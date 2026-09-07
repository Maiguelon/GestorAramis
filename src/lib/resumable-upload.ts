/** Browser transport only. This module never authenticates to Google or marks material received. */
export const DRIVE_CHUNK_SIZE = 256 * 1024;

export interface BrowserUploadSession {
  uploadId: string;
  /** Private, limited upload capability issued by the authenticated application backend. */
  sessionUrl: string;
  expectedSize: number;
  mimeType: string;
}

export interface UploadProgress {
  /** Bytes acknowledged by Google, not a statement that Aramís has verified the file. */
  acknowledgedBytes: number;
  totalBytes: number;
  phase: 'uploading' | 'retrying' | 'uploaded_unverified';
}

export interface UploadedUnverified {
  status: 'uploaded_unverified';
  uploadId: string;
  uploadedBytes: number;
}

export type UploadFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type UploadDelay = (milliseconds: number, signal?: AbortSignal) => Promise<void>;

export interface ResumableUploadOptions {
  fetcher?: UploadFetcher;
  delay?: UploadDelay;
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
  /** Multiples of 256 KiB only; the final slice can be smaller. */
  chunkSize?: number;
  /** Consecutive recoveries without confirmed progress, default three. */
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export type UploadErrorCode =
  | 'invalid_upload_session' | 'invalid_upload_file' | 'invalid_upload_options'
  | 'upload_aborted' | 'upload_session_expired' | 'upload_access_denied'
  | 'upload_rejected' | 'invalid_upload_response' | 'upload_retry_exhausted';

/** Errors deliberately exclude the session capability and raw provider messages. */
export class ResumableUploadError extends Error {
  constructor(public readonly code: UploadErrorCode) {
    super(code);
    this.name = 'ResumableUploadError';
  }
}

function aborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ResumableUploadError('upload_aborted');
}

const abortableDelay: UploadDelay = (milliseconds, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) { reject(new ResumableUploadError('upload_aborted')); return; }
  const onAbort = () => {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    reject(new ResumableUploadError('upload_aborted'));
  };
  const timer = setTimeout(() => {
    signal?.removeEventListener('abort', onAbort);
    resolve();
  }, milliseconds);
  signal?.addEventListener('abort', onAbort, { once: true });
});

function validateSession(session: BrowserUploadSession): string {
  let url: URL;
  try { url = new URL(session.sessionUrl); }
  catch { throw new ResumableUploadError('invalid_upload_session'); }
  if (url.protocol !== 'https:' || url.hostname !== 'www.googleapis.com' || url.port || url.username || url.password ||
    url.pathname !== '/upload/drive/v3/files' || !url.searchParams.get('upload_id') || url.hash ||
    !/^[A-Za-z0-9_-]{1,160}$/.test(session.uploadId) ||
    !/^[\w.+-]+\/[\w.+-]+$/.test(session.mimeType)) {
    throw new ResumableUploadError('invalid_upload_session');
  }
  return url.toString();
}

function acknowledgedRange(response: Response, total: number): number {
  const range = response.headers.get('Range');
  if (!range) return 0;
  const match = /^bytes=0-(\d+)$/.exec(range);
  const acknowledged = match ? Number(match[1]) + 1 : NaN;
  if (!Number.isSafeInteger(acknowledged) || acknowledged <= 0 || acknowledged > total) {
    throw new ResumableUploadError('invalid_upload_response');
  }
  return acknowledged;
}

async function discardBody(response: Response): Promise<void> {
  try { await response.body?.cancel(); }
  catch { /* Metadata and error bodies are unnecessary and must not escape to callers. */ }
}

/**
 * Always probes first, making a repeated invocation resume the existing session.
 * Keep the same original File/Blob across retries; size alone is not file identity.
 * The caller must send uploadId to the backend for independent completion verification.
 */
export async function uploadResumableFile(
  file: Blob,
  session: BrowserUploadSession,
  options: ResumableUploadOptions = {},
): Promise<UploadedUnverified> {
  const sessionUrl = validateSession(session);
  const total = session.expectedSize;
  if (!Number.isSafeInteger(total) || total <= 0 || file.size !== total || (file.type && file.type !== session.mimeType)) {
    throw new ResumableUploadError('invalid_upload_file');
  }
  const chunkSize = options.chunkSize ?? DRIVE_CHUNK_SIZE;
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 8000;
  if (!Number.isSafeInteger(chunkSize) || chunkSize < DRIVE_CHUNK_SIZE || chunkSize % DRIVE_CHUNK_SIZE !== 0 ||
    !Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 10 ||
    !Number.isFinite(baseDelayMs) || baseDelayMs < 0 || !Number.isFinite(maxDelayMs) ||
    maxDelayMs < baseDelayMs || maxDelayMs > 60_000) {
    throw new ResumableUploadError('invalid_upload_options');
  }
  const fetcher = options.fetcher ?? fetch;
  const delay = options.delay ?? abortableDelay;
  let acknowledgedBytes = 0;
  let recoveries = 0;
  let probe = true;
  const progress = (phase: UploadProgress['phase']) => options.onProgress?.({ acknowledgedBytes, totalBytes: total, phase });

  async function recover(retryAfter: string | null = null): Promise<void> {
    aborted(options.signal);
    if (recoveries >= maxRetries) throw new ResumableUploadError('upload_retry_exhausted');
    const exponential = Math.min(baseDelayMs * 2 ** recoveries, maxDelayMs);
    // Honor numeric Retry-After within the bounded retry budget; do not parse provider messages.
    const advertised = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : 0;
    const milliseconds = Math.min(Math.max(exponential, advertised), maxDelayMs);
    recoveries += 1;
    progress('retrying');
    await delay(milliseconds, options.signal);
    aborted(options.signal);
    probe = true;
  }

  while (true) {
    aborted(options.signal);
    const wasProbe = probe;
    const end = wasProbe ? acknowledgedBytes : Math.min(acknowledgedBytes + chunkSize, total);
    const headers = new Headers({
      'Content-Range': wasProbe ? `bytes */${total}` : `bytes ${acknowledgedBytes}-${end - 1}/${total}`,
    });
    if (!wasProbe) headers.set('Content-Type', session.mimeType);
    // Fetch computes Content-Length from the Blob. Browsers forbid setting it manually.
    const body = wasProbe ? undefined : file.slice(acknowledgedBytes, end);
    let response: Response;
    try {
      response = await fetcher(sessionUrl, {
        method: 'PUT', headers, body, signal: options.signal,
        credentials: 'omit', mode: 'cors', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
      });
    } catch {
      aborted(options.signal);
      await recover();
      continue;
    }
    aborted(options.signal);
    await discardBody(response);

    if (response.status === 200 || response.status === 201) {
      if (!wasProbe && end !== total) throw new ResumableUploadError('invalid_upload_response');
      acknowledgedBytes = total;
      progress('uploaded_unverified');
      return { status: 'uploaded_unverified', uploadId: session.uploadId, uploadedBytes: total };
    }
    if (response.status === 308) {
      const next = acknowledgedRange(response, total);
      if (next < acknowledgedBytes || (!wasProbe && next > end)) throw new ResumableUploadError('invalid_upload_response');
      if (next > acknowledgedBytes) {
        acknowledgedBytes = next;
        recoveries = 0;
        progress('uploading');
      } else if (!wasProbe || acknowledgedBytes === total) {
        // Includes a provider claiming all bytes with 308 forever: bounded, never false success.
        await recover();
        continue;
      }
      probe = acknowledgedBytes === total;
      continue;
    }
    if (response.status === 408 || response.status === 429 || response.status >= 500) {
      await recover(response.headers.get('Retry-After'));
      continue;
    }
    if (response.status === 404 || response.status === 410) throw new ResumableUploadError('upload_session_expired');
    if (response.status === 401 || response.status === 403) throw new ResumableUploadError('upload_access_denied');
    throw new ResumableUploadError('upload_rejected');
  }
}
