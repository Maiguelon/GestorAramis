import { sharedWorkspace } from './shared-api';
import type { BrowserUploadSession } from './resumable-upload';

export interface DriveStatus { configured: boolean; connected: boolean; canImport?: boolean; canTrashExternal?:boolean; accountEmail?: string; rootFolderId?: string }
export interface DriveAsset { version?: string; id: string; name: string; mimeType: string; size: number; source: 'drive' }
export interface DriveUploadReply { session?: BrowserUploadSession; asset?: DriveAsset }
export const DRIVE_FILE_LIMIT = 2 * 1024 ** 3;
export const DRIVE_ZIP_LIMIT = 256 * 1024 ** 2;
export const DRIVE_FILE_ACCEPT = 'video/mp4,video/webm,video/quicktime,video/x-m4v,image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf,.mp4,.mov,.m4v,.webm,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.pdf';
const allowedMime = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf', 'application/octet-stream']);
const messages: Record<string, string> = {
  google_trash_scope_missing: 'Renová la conexión desde Configuración para enviar a la papelera lo subido directamente a Drive.',
  drive_trash_pending: 'Drive recibió la operación, pero falta confirmarla en el gestor. Reintentá para completar el registro.',
  google_import_scope_missing: 'Renová la conexión desde Configuración para incorporar archivos subidos directamente a Drive.',
  drive_sync_incomplete: 'No se pudo revisar toda la carpeta. Se conservó la lista anterior; volvé a actualizar.',
  configuration_missing: 'La conexión con Drive todavía no está configurada.',
  forbidden: 'Tu cuenta no tiene permiso para esta operación.', unauthenticated: 'La sesión venció. Volvé a ingresar.',
  google_reconnect_required: 'Hace falta renovar la conexión con Google Drive desde Configuración.',
  google_scope_missing: 'Google no concedió el permiso de archivos. Volvé a conectar Drive y aceptá ese permiso.',
  drive_access_denied: 'Drive no permite acceder a ese archivo o carpeta. Revisá la conexión desde Configuración.',
  drive_rate_limited: 'Drive está limitando las operaciones. Esperá un momento y volvé a intentar.',
  drive_file_missing: 'El archivo ya no está disponible en Drive.',
  asset_changed_or_inaccessible: 'El archivo cambió o ya no está disponible. No se descargó una copia sin verificar.',
  invalid_oauth_state: 'La autorización venció o no corresponde a esta sesión. Volvé a conectar Drive.',
  invalid_upload: 'No pudimos aceptar esa carga. Revisá el archivo y volvé a intentar.',
  upload_incomplete: 'Drive todavía no confirmó el archivo completo. Reintentá la verificación.',
  service_unavailable: 'No pudimos comunicarnos con el servicio. Podés volver a intentar.',
  CONFLICT: 'El registro cambió durante la operación. Actualizá la vista antes de continuar.',
  ARCHIVED: 'La pieza fue archivada. No se adjuntaron archivos.',
  IDEMPOTENCY_CONFLICT: 'La carga pendiente corresponde a otro archivo. Seleccioná el archivo original.',
  ACCOUNT_CONFLICT: 'Este espacio ya está vinculado a otra cuenta de Google. Usá la cuenta conectada.',
};
export class DriveApiError extends Error {
  constructor(public code: string, public status = 0) {
    super(messages[code] ?? (status === 401 ? messages.unauthenticated : status === 403 ? messages.forbidden : 'No pudimos completar la operación de Drive. Podés volver a intentar.'));
    this.name = 'DriveApiError';
  }
}
export async function driveRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await sharedWorkspace.authenticatedFetch(path, init);
  let body: unknown;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok) {
    const record = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    const nested = record.error && typeof record.error === 'object' ? record.error as Record<string, unknown> : {};
    const code = typeof record.code === 'string' ? record.code : typeof record.error === 'string' ? record.error : typeof nested.code === 'string' ? nested.code : 'service_unavailable';
    throw new DriveApiError(code, response.status);
  }
  if (!body || typeof body !== 'object') throw new DriveApiError('service_unavailable');
  return body as T;
}
export const drivePost = <T>(path: string, body: unknown = {}, signal?: AbortSignal) => driveRequest<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
export const driveAssetUrl = (id: string, download = false) => `/api/drive/assets/${encodeURIComponent(id)}/content${download ? '?download=1' : ''}`;
export const driveThumbnailUrl = (id: string) => `/api/drive/assets/${encodeURIComponent(id)}/thumbnail`;
export function fileSize(bytes: number): string {
  return bytes < 1024 ** 2 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : bytes < 1024 ** 3 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
export function validateDriveFile(file: File): string {
  if (!file.name || file.name.length > 240) throw new Error('El nombre del archivo debe tener entre 1 y 240 caracteres.');
  if (!file.size) throw new Error('El archivo está vacío.');
  if (file.size > DRIVE_FILE_LIMIT) throw new Error('Supera el límite de 2 GB por archivo.');
  const mimeType = file.type || 'application/octet-stream';
  if (!allowedMime.has(mimeType)) throw new Error('Usá un video MP4, MOV, M4V o WebM, una imagen o un PDF.');
  return mimeType;
}
/** Identity hint for reselection only; Google metadata verifies completion independently. */
export async function fingerprintDriveFile(file: File): Promise<string> {
  const sample = 1024 ** 2;
  const header = new TextEncoder().encode(JSON.stringify([file.name, file.size, file.type, file.lastModified]));
  const first = new Uint8Array(await file.slice(0, sample).arrayBuffer());
  const last = new Uint8Array(await file.slice(Math.max(sample, file.size - sample)).arrayBuffer());
  const input = new Uint8Array(header.length + first.length + last.length);
  input.set(header); input.set(first, header.length); input.set(last, header.length + first.length);
  const hash = await crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
