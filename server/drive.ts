import { ServiceError, type Fetcher } from './errors';

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FILE_FIELDS = 'id,name,mimeType,size,md5Checksum,parents,appProperties,trashed';
const ID = /^[A-Za-z0-9_-]{1,160}$/;
const INLINE_MIMES = new Set(['video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/** Must be loaded from a persisted, authorized request. Never build this from client IDs alone. */
export interface UploadExpectation {
  uploadId: string;
  workspaceId: string;
  clientId: string;
  requestId: string;
  parentFolderId: string;
  name: string;
  mimeType: string;
  size: number;
}
/** Opaque server record; sessionUrl is a credential and must never be logged. */
export interface DriveUpload { sessionUrl: string; expected: UploadExpectation }
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  md5Checksum?: string;
  parents: string[];
  appProperties: Record<string, string>;
  trashed: boolean;
}
export interface StoredAsset {
  driveFileId: string;
  name: string;
  mimeType: string;
  size: number;
  workspaceId: string;
  clientId: string;
  /** Required for approval snapshots; a changed file is rejected before it is streamed. */
  checksum: string;
}

function safeId(id: string): string {
  if (!ID.test(id)) throw new ServiceError('invalid_file', 400);
  return id;
}

function sessionUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new ServiceError('invalid_upload_session', 400); }
  if (url.protocol !== 'https:' || url.hostname !== 'www.googleapis.com' || url.port || url.username || url.password ||
    url.pathname !== '/upload/drive/v3/files' || !url.searchParams.get('upload_id') || url.hash) {
    throw new ServiceError('invalid_upload_session', 400);
  }
  return url.toString();
}

function validateExpectation(expected: UploadExpectation): void {
  [expected.uploadId, expected.workspaceId, expected.clientId, expected.requestId, expected.parentFolderId].forEach(safeId);
  if (!expected.name.trim() || expected.name.length > 255 || /[\u0000-\u001f]/.test(expected.name) ||
    !/^[\w.+-]+\/[\w.+-]+$/.test(expected.mimeType) || !Number.isSafeInteger(expected.size) || expected.size <= 0) {
    throw new ServiceError('invalid_upload', 400);
  }
}

async function upstream(fetcher: Fetcher, url: string, init: RequestInit): Promise<Response> {
  try { return await fetcher(url, { ...init, redirect: 'error' }); }
  catch { throw new ServiceError('drive_unavailable', 502); }
}

function upstreamError(status: number): ServiceError {
  if (status === 401) return new ServiceError('google_reconnect_required', 502);
  if (status === 403) return new ServiceError('drive_access_denied', 502);
  if (status === 404 || status === 410) return new ServiceError('drive_file_missing', 404);
  if (status === 429) return new ServiceError('drive_rate_limited', 503);
  return new ServiceError('drive_unavailable', 502);
}

function headers(token: string): Headers {
  if (!token || /[\r\n]/.test(token)) throw new ServiceError('google_reconnect_required', 502);
  return new Headers({ Authorization: `Bearer ${token}` });
}

async function parseFile(response: Response): Promise<DriveFile> {
  const data = await response.json().catch(() => null) as Partial<DriveFile> | null;
  if (!data || typeof data.id !== 'string' || !ID.test(data.id) || typeof data.name !== 'string' ||
    typeof data.mimeType !== 'string' || typeof data.size !== 'string' || !/^\d+$/.test(data.size) ||
    !Number.isSafeInteger(Number(data.size)) || typeof data.trashed !== 'boolean' ||
    !Array.isArray(data.parents) || !data.parents.every((parent) => typeof parent === 'string') ||
    !data.appProperties || typeof data.appProperties !== 'object' ||
    (data.md5Checksum !== undefined && !/^[a-fA-F0-9]{32}$/.test(data.md5Checksum))) {
    throw new ServiceError('invalid_drive_response', 502);
  }
  return data as DriveFile;
}

export async function getDriveFile(token: string, fileId: string, fetcher: Fetcher = fetch): Promise<DriveFile> {
  const query = new URLSearchParams({ fields: FILE_FIELDS, supportsAllDrives: 'true' });
  const response = await upstream(fetcher, `${API}/${safeId(fileId)}?${query}`, { headers: headers(token) });
  if (!response.ok) throw upstreamError(response.status);
  return parseFile(response);
}

/** Server-only primitive. Caller must authorize staff/share and enforce request quota first. */
export async function initiateDriveUpload(
  token: string, expected: UploadExpectation, fetcher: Fetcher = fetch,
): Promise<DriveUpload> {
  validateExpectation(expected);
  const requestHeaders = headers(token);
  requestHeaders.set('Content-Type', 'application/json; charset=UTF-8');
  requestHeaders.set('X-Upload-Content-Type', expected.mimeType);
  requestHeaders.set('X-Upload-Content-Length', String(expected.size));
  const query = new URLSearchParams({ uploadType: 'resumable', fields: FILE_FIELDS, supportsAllDrives: 'true' });
  const response = await upstream(fetcher, `${UPLOAD}?${query}`, {
    method: 'POST', headers: requestHeaders,
    body: JSON.stringify({ name: expected.name, mimeType: expected.mimeType, parents: [expected.parentFolderId], appProperties: {
      uploadId: expected.uploadId, workspaceId: expected.workspaceId, clientId: expected.clientId, requestId: expected.requestId,
    } }),
  });
  if (!response.ok) throw upstreamError(response.status);
  const location = response.headers.get('Location');
  if (!location) throw new ServiceError('invalid_drive_response', 502);
  return { sessionUrl: sessionUrl(location), expected: { ...expected } };
}

function verifyCompletedFile(file: DriveFile, expected: UploadExpectation): void {
  if (file.trashed || file.size !== String(expected.size) || file.mimeType !== expected.mimeType ||
    !file.parents.includes(expected.parentFolderId) || !file.md5Checksum ||
    file.appProperties.uploadId !== expected.uploadId || file.appProperties.workspaceId !== expected.workspaceId ||
    file.appProperties.clientId !== expected.clientId || file.appProperties.requestId !== expected.requestId) {
    throw new ServiceError('upload_verification_failed', 409);
  }
}

/** Completion is based on Google state and metadata, never the browser's claimed file ID. */
export async function checkDriveUpload(
  token: string, upload: DriveUpload, fetcher: Fetcher = fetch,
): Promise<{ status: 'pending'; receivedBytes: number } | { status: 'complete'; file: DriveFile }> {
  validateExpectation(upload.expected);
  const requestHeaders = headers(token);
  requestHeaders.set('Content-Length', '0');
  requestHeaders.set('Content-Range', `bytes */${upload.expected.size}`);
  const response = await upstream(fetcher, sessionUrl(upload.sessionUrl), { method: 'PUT', headers: requestHeaders });
  if (response.status === 308) {
    const range = response.headers.get('Range');
    if (!range) return { status: 'pending', receivedBytes: 0 };
    const match = /^bytes=0-(\d+)$/.exec(range);
    const receivedBytes = match ? Number(match[1]) + 1 : NaN;
    if (!Number.isSafeInteger(receivedBytes) || receivedBytes < 1 || receivedBytes > upload.expected.size) throw new ServiceError('invalid_drive_response', 502);
    return { status: 'pending', receivedBytes };
  }
  if (response.status !== 200 && response.status !== 201) throw upstreamError(response.status);
  const completion = await response.json().catch(() => null) as { id?: unknown } | null;
  if (!completion || typeof completion.id !== 'string') throw new ServiceError('invalid_drive_response', 502);
  const file = await getDriveFile(token, completion.id, fetcher);
  verifyCompletedFile(file, upload.expected);
  return { status: 'complete', file };
}

function validRange(range: string): boolean {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return false;
  const start = match[1] ? Number(match[1]) : undefined;
  const end = match[2] ? Number(match[2]) : undefined;
  if ((start !== undefined && !Number.isSafeInteger(start)) || (end !== undefined && !Number.isSafeInteger(end))) return false;
  if (start !== undefined && end !== undefined && start > end) return false;
  return start !== undefined || (end !== undefined && end > 0);
}

/** The caller must resolve and authorize this stored asset BEFORE invoking; no HTTP route exposes it yet. */
export async function streamDriveAsset(
  token: string, asset: StoredAsset, range: string | null, fetcher: Fetcher = fetch,
): Promise<Response> {
  if (range !== null && !validRange(range)) throw new ServiceError('invalid_range', 416);
  const file = await getDriveFile(token, asset.driveFileId, fetcher);
  if (file.trashed || !asset.checksum || file.md5Checksum !== asset.checksum || file.size !== String(asset.size) ||
    file.mimeType !== asset.mimeType || file.appProperties.workspaceId !== asset.workspaceId || file.appProperties.clientId !== asset.clientId) {
    throw new ServiceError('asset_changed_or_inaccessible', 409);
  }
  const requestHeaders = headers(token);
  if (range) requestHeaders.set('Range', range);
  const response = await upstream(fetcher, `${API}/${safeId(asset.driveFileId)}?alt=media&supportsAllDrives=true`, { headers: requestHeaders });
  if (response.status === 416) {
    const resultHeaders = new Headers({ 'Cache-Control': 'private, no-store' });
    const contentRange = response.headers.get('Content-Range');
    if (contentRange && /^bytes \*\/\d+$/.test(contentRange)) resultHeaders.set('Content-Range', contentRange);
    return new Response(null, { status: 416, headers: resultHeaders });
  }
  if (response.status !== 200 && response.status !== 206) throw upstreamError(response.status);
  if (range && response.status !== 206) {
    await response.body?.cancel();
    throw new ServiceError('drive_range_unavailable', 502);
  }
  const resultHeaders = new Headers({
    'Content-Type': INLINE_MIMES.has(asset.mimeType) ? asset.mimeType : 'application/octet-stream',
    'Cache-Control': 'private, no-store', 'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Disposition': INLINE_MIMES.has(asset.mimeType) ? 'inline' : 'attachment',
  });
  const length = response.headers.get('Content-Length');
  if (length && /^\d+$/.test(length)) resultHeaders.set('Content-Length', length);
  const contentRange = response.headers.get('Content-Range');
  if (response.status === 206 && (!contentRange || !/^bytes \d+-\d+\/\d+$/.test(contentRange))) {
    await response.body?.cancel();
    throw new ServiceError('invalid_drive_response', 502);
  }
  if (contentRange && response.status === 206) resultHeaders.set('Content-Range', contentRange);
  return new Response(response.body, { status: response.status, headers: resultHeaders });
}
