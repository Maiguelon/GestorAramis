import { ServiceError, type Fetcher } from './errors';

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FILE_FIELDS = 'id,name,mimeType,size,md5Checksum,parents,appProperties,trashed,headRevisionId';
const FOLDER_FIELDS = 'id,name,mimeType,parents,appProperties,trashed';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const REVISION_FIELDS = 'id,mimeType,size,md5Checksum,keepForever';
const ID = /^[A-Za-z0-9_-]{1,160}$/;
const INLINE_MIMES = new Set(['video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/** Must be loaded from a persisted, authorized request. Never build this from client IDs alone. */
export interface UploadExpectation {
  uploadId: string;
  workspaceId: string;
  clientId: string;
  requestId: string;
  parentFolderId: string;
  /** ID reserved through generateDriveId and persisted before starting the upload. */
  driveFileId?: string;
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
  /** Present only for binary files; optional for upload/legacy metadata compatibility. */
  headRevisionId?: string;
}
export interface StoredAsset {
  driveFileId: string;
  name: string;
  mimeType: string;
  size: number;
  workspaceId: string;
  clientId: string;
  /** Metadata checksum alone does not prevent mutable-head races. Reviews require PinnedDriveAsset. */
  checksum: string;
}

/** Store this revision ID with the review snapshot; never resolve the head again for its media. */
export interface PinnedDriveAsset extends StoredAsset {
  driveRevisionId: string;
}

interface DriveRevision {
  id: string;
  mimeType: string;
  size: string;
  md5Checksum: string;
  keepForever: boolean;
}

export interface SnapshotDestination {
  workspaceId: string;
  clientId: string;
  pieceId: string;
  parentFolderId: string;
  name: string;
}

export interface DriveFolderExpectation {
  /** Caller must reserve and persist this ID before creating the folder. */
  id: string;
  name: string;
  parentId?: string;
  workspaceId: string;
  logicalKey: string;
}

function safeId(id: string): string {
  if (typeof id !== 'string' || !ID.test(id)) throw new ServiceError('invalid_file', 400);
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
  if (expected.driveFileId !== undefined) safeId(expected.driveFileId);
  if (!expected.name.trim() || expected.name.length > 255 || /[\u0000-\u001f]/.test(expected.name) ||
    !/^[\w.+-]+\/[\w.+-]+$/.test(expected.mimeType) || !Number.isSafeInteger(expected.size) || expected.size <= 0) {
    throw new ServiceError('invalid_upload', 400);
  }
}

function browserUploadOrigin(value: string): string {
  let origin: URL;
  try { origin = new URL(value); }
  catch { throw new ServiceError('invalid_upload_origin', 400); }
  const localHttp = origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  // Only a serialized origin is accepted, not a URL carrying a path, credentials,
  // query or control characters. The caller derives it from its trusted request URL.
  if (value !== origin.origin || (origin.protocol !== 'https:' && !localHttp)) {
    throw new ServiceError('invalid_upload_origin', 400);
  }
  return origin.origin;
}

async function upstream(fetcher: Fetcher, url: string, init: RequestInit): Promise<Response> {
  // Workers supports manual/follow only; callers validate status (including resumable 308).
  try { return await fetcher(url, { ...init, redirect: 'manual' }); }
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

/** Reserve once and persist the ID; retry creation with that same ID after an uncertain response. */
export async function generateDriveId(token: string, fetcher: Fetcher = fetch): Promise<string> {
  const query = new URLSearchParams({ count: '1', space: 'drive', type: 'files', fields: 'ids' });
  const response = await upstream(fetcher, `${API}/generateIds?${query}`, { headers: headers(token) });
  if (!response.ok) throw upstreamError(response.status);
  const data = await response.json().catch(() => null) as { ids?: unknown } | null;
  if (!data || !Array.isArray(data.ids) || data.ids.length !== 1 || typeof data.ids[0] !== 'string' || !ID.test(data.ids[0])) {
    throw new ServiceError('invalid_drive_response', 502);
  }
  return data.ids[0];
}

/** The stable permission ID prevents an accidental reconnect from replacing another account's tree. */
export async function getDriveAccount(token: string, fetcher: Fetcher = fetch): Promise<{ email: string; permissionId: string }> {
  const query = new URLSearchParams({ fields: 'user(emailAddress,permissionId)' });
  const response = await upstream(fetcher, `https://www.googleapis.com/drive/v3/about?${query}`, { headers: headers(token) });
  if (!response.ok) throw upstreamError(response.status);
  const data = await response.json().catch(() => null) as { user?: { emailAddress?: unknown; permissionId?: unknown } } | null;
  const user = data?.user;
  if (!user || typeof user.emailAddress !== 'string' || user.emailAddress.length > 320 ||
    !/^[^\s@]+@[^\s@]+$/.test(user.emailAddress) || /[\u0000-\u001f\u007f]/.test(user.emailAddress) ||
    typeof user.permissionId !== 'string' || !ID.test(user.permissionId)) {
    throw new ServiceError('invalid_drive_response', 502);
  }
  return { email: user.emailAddress, permissionId: user.permissionId };
}

async function verifiedFolder(response: Response, expected: DriveFolderExpectation): Promise<{ id: string; name: string }> {
  const data = await response.json().catch(() => null) as Partial<DriveFile> | null;
  if (!data || typeof data.id !== 'string' || !ID.test(data.id) || typeof data.name !== 'string' || !data.name.trim() ||
    typeof data.mimeType !== 'string' || typeof data.trashed !== 'boolean' ||
    (data.parents !== undefined && (!Array.isArray(data.parents) || !data.parents.every(parent => typeof parent === 'string' && ID.test(parent)))) ||
    !data.appProperties || typeof data.appProperties !== 'object' || Array.isArray(data.appProperties) ||
    !Object.values(data.appProperties).every(value => typeof value === 'string')) {
    throw new ServiceError('invalid_drive_response', 502);
  }
  if (data.id !== expected.id || data.mimeType !== FOLDER_MIME || data.trashed ||
    data.appProperties.workspaceId !== expected.workspaceId || data.appProperties.logicalKey !== expected.logicalKey ||
    (expected.parentId !== undefined && !data.parents?.includes(expected.parentId))) {
    throw new ServiceError('drive_folder_mismatch', 409);
  }
  // Renaming a known folder in Drive does not change its identity and must not create a duplicate.
  return { id: data.id, name: data.name };
}

/**
 * Creates only a specifically reserved app-owned folder. Never searches, adopts or alters existing
 * client folders by name. Concurrent calls and retries resolve the same ID and verify its binding.
 */
export async function ensureDriveFolder(
  token: string, expected: DriveFolderExpectation, fetcher: Fetcher = fetch,
): Promise<{ id: string; name: string }> {
  [expected.id, expected.workspaceId].forEach(safeId);
  if (expected.parentId !== undefined) safeId(expected.parentId);
  if (typeof expected.name !== 'string' || !expected.name.trim() || expected.name.length > 255 || /[\u0000-\u001f]/.test(expected.name) ||
    typeof expected.logicalKey !== 'string' || !expected.logicalKey.trim() || /[\u0000-\u001f]/.test(expected.logicalKey) ||
    new TextEncoder().encode('logicalKey' + expected.logicalKey).length > 124) {
    throw new ServiceError('invalid_folder', 400);
  }
  const query = new URLSearchParams({ fields: FOLDER_FIELDS, supportsAllDrives: 'true' });
  const read = () => upstream(fetcher, `${API}/${expected.id}?${query}`, { headers: headers(token) });
  const existing = await read();
  if (existing.ok) return verifiedFolder(existing, expected);
  if (existing.status !== 404) throw upstreamError(existing.status);

  const requestHeaders = headers(token);
  requestHeaders.set('Content-Type', 'application/json; charset=UTF-8');
  let created: Response | undefined;
  let creationError = new ServiceError('drive_unavailable', 502);
  try {
    created = await upstream(fetcher, `${API}?${query}`, {
      method: 'POST', headers: requestHeaders,
      body: JSON.stringify({
        id: expected.id, name: expected.name, mimeType: FOLDER_MIME,
        ...(expected.parentId === undefined ? {} : { parents: [expected.parentId] }),
        appProperties: { workspaceId: expected.workspaceId, logicalKey: expected.logicalKey },
      }),
    });
  } catch (error) {
    if (!(error instanceof ServiceError) || error.code !== 'drive_unavailable') throw error;
    creationError = error;
  }
  if (created) {
    if (created.ok) return verifiedFolder(created, expected);
    // A conflict can be our successful concurrent create; 5xx/408 may have committed before failing.
    if (created.status !== 409 && created.status !== 408 && created.status < 500) throw upstreamError(created.status);
    creationError = created.status === 409 ? new ServiceError('drive_folder_mismatch', 409) : upstreamError(created.status);
  }
  const recovered = await read();
  if (recovered.ok) return verifiedFolder(recovered, expected);
  if (recovered.status === 404) throw creationError;
  throw upstreamError(recovered.status);
}

async function parseFile(response: Response): Promise<DriveFile> {
  const data = await response.json().catch(() => null) as Partial<DriveFile> | null;
  if (!data || typeof data.id !== 'string' || !ID.test(data.id) || typeof data.name !== 'string' ||
    typeof data.mimeType !== 'string' || typeof data.size !== 'string' || !/^\d+$/.test(data.size) ||
    !Number.isSafeInteger(Number(data.size)) || typeof data.trashed !== 'boolean' ||
    !Array.isArray(data.parents) || !data.parents.every((parent) => typeof parent === 'string' && ID.test(parent)) ||
    !data.appProperties || typeof data.appProperties !== 'object' || Array.isArray(data.appProperties) ||
    !Object.values(data.appProperties).every((value) => typeof value === 'string') ||
    (data.md5Checksum !== undefined && (typeof data.md5Checksum !== 'string' || !/^[a-fA-F0-9]{32}$/.test(data.md5Checksum))) ||
    (data.headRevisionId !== undefined && (typeof data.headRevisionId !== 'string' || !ID.test(data.headRevisionId)))) {
    throw new ServiceError('invalid_drive_response', 502);
  }
  return data as DriveFile;
}

export async function getDriveFile(token: string, fileId: string, fetcher: Fetcher = fetch): Promise<DriveFile> {
  const query = new URLSearchParams({ fields: FILE_FIELDS, supportsAllDrives: 'true' });
  const response = await upstream(fetcher, `${API}/${safeId(fileId)}?${query}`, { headers: headers(token) });
  if (!response.ok) throw upstreamError(response.status);
  const file = await parseFile(response);
  if (file.id !== fileId) throw new ServiceError('invalid_drive_response', 502);
  return file;
}

/** Copy into a new tagged file. Pin its revision before attaching it to an exact review snapshot. */
export async function copyDriveSnapshot(
  token: string, sourceFileId: string, destination: SnapshotDestination, fetcher: Fetcher = fetch,
): Promise<StoredAsset> {
  [destination.workspaceId, destination.clientId, destination.pieceId, destination.parentFolderId].forEach(safeId);
  if (!destination.name.trim() || destination.name.length > 255 || /[\u0000-\u001f]/.test(destination.name)) {
    throw new ServiceError('invalid_file', 400);
  }
  const requestHeaders = headers(token);
  requestHeaders.set('Content-Type', 'application/json');
  const query = new URLSearchParams({ fields: FILE_FIELDS, supportsAllDrives: 'true' });
  const response = await upstream(fetcher, `${API}/${safeId(sourceFileId)}/copy?${query}`, {
    method: 'POST', headers: requestHeaders,
    body: JSON.stringify({ name: destination.name, parents: [destination.parentFolderId], appProperties: {
      workspaceId: destination.workspaceId, clientId: destination.clientId, pieceId: destination.pieceId,
    } }),
  });
  if (!response.ok) throw upstreamError(response.status);
  const file = await parseFile(response);
  if (file.trashed || !file.md5Checksum || file.id === sourceFileId || !INLINE_MIMES.has(file.mimeType) ||
    !file.parents.includes(destination.parentFolderId) || Number(file.size) <= 0 ||
    file.appProperties.workspaceId !== destination.workspaceId || file.appProperties.clientId !== destination.clientId ||
    file.appProperties.pieceId !== destination.pieceId) {
    throw new ServiceError('snapshot_verification_failed', 409);
  }
  return {
    driveFileId: file.id, name: file.name, mimeType: file.mimeType, size: Number(file.size),
    workspaceId: destination.workspaceId, clientId: destination.clientId, checksum: file.md5Checksum,
  };
}

function validateStoredAsset(asset: StoredAsset): void {
  [asset.driveFileId, asset.workspaceId, asset.clientId].forEach(safeId);
  if (!Number.isSafeInteger(asset.size) || asset.size <= 0 || typeof asset.checksum !== 'string' || !/^[a-fA-F0-9]{32}$/.test(asset.checksum)) {
    throw new ServiceError('asset_changed_or_inaccessible', 409);
  }
}

function assertAssetOwnership(file: DriveFile, asset: StoredAsset): void {
  if (file.trashed || file.appProperties.workspaceId !== asset.workspaceId || file.appProperties.clientId !== asset.clientId) {
    throw new ServiceError('asset_changed_or_inaccessible', 409);
  }
}

async function verifiedRevision(response: Response, revisionId: string, asset: StoredAsset): Promise<DriveRevision> {
  const data = await response.json().catch(() => null) as Partial<DriveRevision> | null;
  if (!data || data.id !== revisionId || data.keepForever !== true ||
    data.size !== String(asset.size) || data.mimeType !== asset.mimeType || data.md5Checksum !== asset.checksum) {
    throw new ServiceError('snapshot_verification_failed', 409);
  }
  return data as DriveRevision;
}

/**
 * Server-only mutation for an already authorized app-owned copy. Pin the observed binary head
 * and verify that exact revision before persisting a review. An intervening new head is harmless:
 * the PATCH and every future download address the original revision ID, never current content.
 */
export async function pinDriveAssetRevision(
  token: string, asset: StoredAsset, fetcher: Fetcher = fetch,
): Promise<PinnedDriveAsset> {
  validateStoredAsset(asset);
  if (!INLINE_MIMES.has(asset.mimeType)) throw new ServiceError('snapshot_verification_failed', 409);
  const file = await getDriveFile(token, asset.driveFileId, fetcher);
  assertAssetOwnership(file, asset);
  if (!file.headRevisionId || file.md5Checksum !== asset.checksum || file.size !== String(asset.size) || file.mimeType !== asset.mimeType) {
    throw new ServiceError('snapshot_verification_failed', 409);
  }
  const requestHeaders = headers(token);
  requestHeaders.set('Content-Type', 'application/json');
  const query = new URLSearchParams({ fields: REVISION_FIELDS });
  const response = await upstream(fetcher, `${API}/${safeId(asset.driveFileId)}/revisions/${safeId(file.headRevisionId)}?${query}`, {
    method: 'PATCH', headers: requestHeaders, body: JSON.stringify({ keepForever: true }),
  });
  if (!response.ok) throw upstreamError(response.status);
  await verifiedRevision(response, file.headRevisionId, asset);
  return { ...asset, driveRevisionId: file.headRevisionId };
}

/** Copy and pin are not a database transaction; caller tracks failed/orphan copies for cleanup. */
export async function copyPinnedDriveSnapshot(
  token: string, sourceFileId: string, destination: SnapshotDestination, fetcher: Fetcher = fetch,
): Promise<PinnedDriveAsset> {
  const asset = await copyDriveSnapshot(token, sourceFileId, destination, fetcher);
  return pinDriveAssetRevision(token, asset, fetcher);
}

/**
 * Server-only primitive. Caller must authorize staff/share and enforce quota first.
 * For browser uploads, pass the origin of the trusted application request URL.
 * Google binds upload-session CORS during initiation, including the final response.
 */
export async function initiateDriveUpload(
  token: string, expected: UploadExpectation, fetcher: Fetcher = fetch, browserOrigin?: string,
): Promise<DriveUpload> {
  validateExpectation(expected);
  const requestHeaders = headers(token);
  if (browserOrigin !== undefined) requestHeaders.set('Origin', browserUploadOrigin(browserOrigin));
  requestHeaders.set('Content-Type', 'application/json; charset=UTF-8');
  requestHeaders.set('X-Upload-Content-Type', expected.mimeType);
  requestHeaders.set('X-Upload-Content-Length', String(expected.size));
  const query = new URLSearchParams({ uploadType: 'resumable', fields: FILE_FIELDS, supportsAllDrives: 'true' });
  const response = await upstream(fetcher, `${UPLOAD}?${query}`, {
    method: 'POST', headers: requestHeaders,
    body: JSON.stringify({ ...(expected.driveFileId === undefined ? {} : { id: expected.driveFileId }),
      name: expected.name, mimeType: expected.mimeType, parents: [expected.parentFolderId], appProperties: {
      uploadId: expected.uploadId, workspaceId: expected.workspaceId, clientId: expected.clientId, requestId: expected.requestId,
    } }),
  });
  if (!response.ok) throw upstreamError(response.status);
  const location = response.headers.get('Location');
  if (!location) throw new ServiceError('invalid_drive_response', 502);
  return { sessionUrl: sessionUrl(location), expected: { ...expected } };
}

function verifyCompletedFile(file: DriveFile, expected: UploadExpectation): void {
  if ((expected.driveFileId !== undefined && file.id !== expected.driveFileId) ||
    file.trashed || file.size !== String(expected.size) || file.mimeType !== expected.mimeType ||
    !file.parents.includes(expected.parentFolderId) || !file.md5Checksum ||
    file.appProperties.uploadId !== expected.uploadId || file.appProperties.workspaceId !== expected.workspaceId ||
    file.appProperties.clientId !== expected.clientId || file.appProperties.requestId !== expected.requestId) {
    throw new ServiceError('upload_verification_failed', 409);
  }
}

/**
 * Completion is based on Google state and metadata, never the browser's claimed file ID.
 * A vanished session may have finished before persistence failed. Recover only through the
 * previously reserved file ID, with the same ownership/size/type checks as normal completion.
 */
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
  if ((response.status === 404 || response.status === 410) && upload.expected.driveFileId) {
    try { await response.body?.cancel(); } catch { /* Provider error details are not returned. */ }
    const file = await getDriveFile(token, upload.expected.driveFileId, fetcher);
    verifyCompletedFile(file, upload.expected);
    return { status: 'complete', file };
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

function expectedByteRange(range: string, total: number): { start: number; end: number } {
  const [start, end] = range.slice('bytes='.length).split('-');
  return start
    ? { start: Number(start), end: end ? Math.min(Number(end), total - 1) : total - 1 }
    : { start: Math.max(total - Number(end), 0), end: total - 1 };
}

async function invalidMediaResponse(response: Response): Promise<never> {
  try { await response.body?.cancel(); } catch { /* Do not expose upstream stream errors. */ }
  throw new ServiceError('invalid_drive_response', 502);
}

/**
 * Legacy mutable-head transport, NOT safe for exact approvals: content can change between metadata
 * and media requests. Review routes must use streamPinnedDriveAsset. No HTTP route exposes either.
 */
export async function streamDriveAsset(
  token: string, asset: StoredAsset, range: string | null, fetcher: Fetcher = fetch,
): Promise<Response> {
  if (range !== null && !validRange(range)) throw new ServiceError('invalid_range', 416);
  validateStoredAsset(asset);
  const file = await getDriveFile(token, asset.driveFileId, fetcher);
  if (file.trashed || !asset.checksum || file.md5Checksum !== asset.checksum || file.size !== String(asset.size) ||
    file.mimeType !== asset.mimeType || file.appProperties.workspaceId !== asset.workspaceId || file.appProperties.clientId !== asset.clientId) {
    throw new ServiceError('asset_changed_or_inaccessible', 409);
  }
  const requestHeaders = headers(token);
  if (range) requestHeaders.set('Range', range);
  const response = await upstream(fetcher, `${API}/${safeId(asset.driveFileId)}?alt=media&supportsAllDrives=true`, { headers: requestHeaders });
  return checkedMediaResponse(response, asset, range);
}

/** Internal download only. Preserves byte streaming and forces an attachment with a safe name. */
export async function streamTeamDriveAsset(
  token: string, asset: StoredAsset, range: string | null, fetcher: Fetcher = fetch,
): Promise<Response> {
  const response = await streamDriveAsset(token, asset, range, fetcher);
  if (response.status === 416) return response;
  const normalized = new TextDecoder().decode(new TextEncoder().encode(asset.name));
  const name = Array.from(normalized.replace(/[\u0000-\u001f\u007f/\\]/g, '_')).slice(0, 160).join('').trim() || 'archivo';
  const encoded = encodeURIComponent(name).replace(/['()*]/g, character => '%' + character.charCodeAt(0).toString(16).toUpperCase());
  response.headers.set('Content-Disposition', `attachment; filename="archivo"; filename*=UTF-8''${encoded}`);
  return response;
}

/** Caller must authorize the persisted review/asset relationship and current share before invoking. */
export async function streamPinnedDriveAsset(
  token: string, asset: PinnedDriveAsset, range: string | null, fetcher: Fetcher = fetch,
): Promise<Response> {
  if (range !== null && !validRange(range)) throw new ServiceError('invalid_range', 416);
  validateStoredAsset(asset);
  safeId(asset.driveRevisionId);
  if (!INLINE_MIMES.has(asset.mimeType)) throw new ServiceError('snapshot_verification_failed', 409);
  const file = await getDriveFile(token, asset.driveFileId, fetcher);
  // The current head may differ. Ownership and trash are file properties; bytes belong to the revision.
  assertAssetOwnership(file, asset);
  const revisionUrl = `${API}/${safeId(asset.driveFileId)}/revisions/${safeId(asset.driveRevisionId)}`;
  const metadata = await upstream(fetcher, `${revisionUrl}?${new URLSearchParams({ fields: REVISION_FIELDS })}`, { headers: headers(token) });
  if (!metadata.ok) throw upstreamError(metadata.status);
  await verifiedRevision(metadata, asset.driveRevisionId, asset);
  const requestHeaders = headers(token);
  if (range) requestHeaders.set('Range', range);
  const response = await upstream(fetcher, `${revisionUrl}?alt=media`, { headers: requestHeaders });
  return checkedMediaResponse(response, asset, range);
}

async function checkedMediaResponse(response: Response, asset: StoredAsset, range: string | null): Promise<Response> {
  if (response.status === 416) {
    const resultHeaders = new Headers({ 'Cache-Control': 'private, no-store' });
    const contentRange = response.headers.get('Content-Range');
    if (contentRange) {
      if (contentRange !== `bytes */${asset.size}`) return invalidMediaResponse(response);
      resultHeaders.set('Content-Range', contentRange);
    }
    try { await response.body?.cancel(); } catch { /* Never forward provider error contents. */ }
    return new Response(null, { status: 416, headers: resultHeaders });
  }
  if (response.status !== 200 && response.status !== 206) throw upstreamError(response.status);
  if (range && response.status !== 206) {
    await response.body?.cancel();
    throw new ServiceError('drive_range_unavailable', 502);
  }
  if (!range && response.status === 206) return invalidMediaResponse(response);
  const contentRange = response.headers.get('Content-Range');
  let expectedLength = asset.size;
  if (response.status === 206) {
    const match = contentRange && /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange);
    if (!match || !range) return invalidMediaResponse(response);
    const [start, end, total] = match.slice(1).map(Number);
    const wanted = expectedByteRange(range, asset.size);
    if (![start, end, total].every(Number.isSafeInteger) || total !== asset.size || end < start || end >= total ||
      start !== wanted.start || end !== wanted.end) return invalidMediaResponse(response);
    expectedLength = end - start + 1;
  } else if (contentRange) return invalidMediaResponse(response);
  const length = response.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) !== expectedLength)) {
    return invalidMediaResponse(response);
  }
  const resultHeaders = new Headers({
    'Content-Type': INLINE_MIMES.has(asset.mimeType) ? asset.mimeType : 'application/octet-stream',
    'Cache-Control': 'private, no-store', 'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Disposition': INLINE_MIMES.has(asset.mimeType) ? 'inline' : 'attachment',
  });
  if (length !== null) resultHeaders.set('Content-Length', length);
  if (contentRange && response.status === 206) resultHeaders.set('Content-Range', contentRange);
  return new Response(response.body, { status: response.status, headers: resultHeaders });
}
