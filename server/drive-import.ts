import { ServiceError, type Fetcher } from './errors';

export interface ImportFile { id: string; name: string; mimeType: string; size: number; checksum: string }
const ID = /^[A-Za-z0-9_-]{1,160}$/;
const TYPES = new Set(['video/mp4','video/webm','video/quicktime','video/x-m4v','image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','image/avif','application/pdf']);

/** The folder ID must come from the workspace's persisted piece mapping, never request input.
 * Finish every page before reconciling; an incomplete listing must never remove material. */
export async function listImportFiles(token: string, folderId: string, fetcher: Fetcher = fetch) {
  if (!ID.test(folderId)) throw new ServiceError('VALIDATION',400);
  const files: ImportFile[] = [];
  const seen = new Set<string>();
  let pageToken = '', skipped = 0;
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({ q: `'${folderId}' in parents and trashed=false`, pageSize: '1000',
      fields: 'nextPageToken,incompleteSearch,files(id,name,mimeType,size,md5Checksum,parents,trashed)',
      supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', ...(pageToken ? {pageToken} : {}) });
    const response = await fetcher(`https://www.googleapis.com/drive/v3/files?${query}`, {
      // Match the other Drive calls: never forward credentials through redirects.
      headers: {Authorization: `Bearer ${token}`}, redirect: 'manual',
    });
    if (!response.ok) throw new ServiceError(response.status === 401 ? 'google_reconnect_required' : response.status === 403 ? 'drive_access_denied' : 'service_unavailable',502);
    const data = await response.json() as {files?: Record<string,unknown>[]; nextPageToken?: string; incompleteSearch?: boolean};
    if (!Array.isArray(data.files) || data.incompleteSearch) throw new ServiceError('drive_sync_incomplete',502);
    for (const f of data.files) {
      if (typeof f.id !== 'string' || !ID.test(f.id) || !Array.isArray(f.parents) || !f.parents.includes(folderId) || f.trashed === true) throw new ServiceError('invalid_drive_response',502);
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      if (typeof f.name !== 'string' || !f.name.trim() || f.name.length > 240 || /[\u0000-\u001f]/.test(f.name) ||
          typeof f.mimeType !== 'string' || !TYPES.has(f.mimeType) || typeof f.size !== 'string' || !/^\d+$/.test(f.size) ||
          !Number.isSafeInteger(Number(f.size)) || Number(f.size) <= 0 || Number(f.size) > 2 * 1024 ** 3 ||
          typeof f.md5Checksum !== 'string' || !/^[a-f0-9]{32}$/i.test(f.md5Checksum)) { skipped++; continue; }
      files.push({id:f.id,name:f.name,mimeType:f.mimeType,size:Number(f.size),checksum:f.md5Checksum.toLowerCase()});
    }
    if (!data.nextPageToken) return {files,skipped};
    if (typeof data.nextPageToken !== 'string' || data.nextPageToken === pageToken) throw new ServiceError('drive_sync_incomplete',502);
    pageToken = data.nextPageToken;
  }
  throw new ServiceError('drive_sync_incomplete',502);
}
