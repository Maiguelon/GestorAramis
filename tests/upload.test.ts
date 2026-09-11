// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { DRIVE_CHUNK_SIZE as CHUNK, uploadResumableFile, type BrowserUploadSession, type UploadProgress } from '../src/lib/resumable-upload';

const sessionUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=PRIVATE-CAPABILITY';
const session = (size: number): BrowserUploadSession => ({ uploadId: 'upload-record', sessionUrl, expectedSize: size, mimeType: 'video/mp4' });
const blob = (size: number) => new Blob([new Uint8Array(size)], { type: 'video/mp4' });
const pending = (bytes = 0) => new Response(null, { status: 200, headers: { 'X-Http-Status-Code-Override': '308', ...(bytes ? { Range: `bytes=0-${bytes - 1}` } : {}) } });
const complete = () => new Response('provider metadata deliberately ignored', { status: 201 });
const immediate = vi.fn(async () => {});

describe('resumable browser transport', () => {
  it('probes then sends 256 KiB slices, without reading the whole file or credentials', async () => {
    const size = CHUNK * 2 + 17;
    const file = blob(size);
    const readWhole = vi.spyOn(file, 'arrayBuffer');
    const readText = vi.spyOn(file, 'text');
    const slices = vi.spyOn(file, 'slice');
    const fetcher = vi.fn().mockResolvedValueOnce(pending()).mockResolvedValueOnce(pending(CHUNK)).mockResolvedValueOnce(pending(CHUNK * 2)).mockResolvedValueOnce(complete());
    const progress: UploadProgress[] = [];
    const result = await uploadResumableFile(file, session(size), { fetcher, onProgress: (value) => progress.push(value) });
    expect(result).toEqual({ status: 'uploaded_unverified', uploadId: 'upload-record', uploadedBytes: size });
    expect(slices.mock.calls).toEqual([[0, CHUNK], [CHUNK, CHUNK * 2], [CHUNK * 2, size]]);
    expect(readWhole).not.toHaveBeenCalled();
    expect(readText).not.toHaveBeenCalled();
    const requests = fetcher.mock.calls.map(([, init]) => init as RequestInit);
    expect(requests.map((init) => new Headers(init.headers).get('Content-Range'))).toEqual([
      `bytes */${size}`, `bytes 0-${CHUNK - 1}/${size}`, `bytes ${CHUNK}-${CHUNK * 2 - 1}/${size}`, `bytes ${CHUNK * 2}-${size - 1}/${size}`,
    ]);
    expect(requests[0].body).toBeUndefined();
    for (const init of requests) {
      expect(new Headers(init.headers).get('Authorization')).toBeNull();
      expect(new Headers(init.headers).get('Content-Length')).toBeNull();
      expect(new Headers(init.headers).get('X-GUploader-No-308')).toBe('yes');
      expect(init.credentials).toBe('omit');
      expect(init.referrerPolicy).toBe('no-referrer');
      expect(init.redirect).toBe('error');
    }
    expect(progress.map((value) => value.acknowledgedBytes)).toEqual([CHUNK, CHUNK * 2, size]);
    expect(progress.at(-1)?.phase).toBe('uploaded_unverified');
    expect(JSON.stringify(result)).not.toContain('PRIVATE-CAPABILITY');
  });

  it('still understands a readable legacy 308 without treating it as completion', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 308 })).mockResolvedValueOnce(complete());
    await expect(uploadResumableFile(blob(10), session(10), { fetcher })).resolves.toMatchObject({ status: 'uploaded_unverified' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([{ status: 200, override: '201' }, { status: 200, override: '308,200' }, { status: 403, override: '308' }])('rejects an unexpected status override $status/$override', async ({ status, override }) => {
    const fetcher = vi.fn(async () => new Response(null, { status, headers: { 'X-Http-Status-Code-Override': override } }));
    await expect(uploadResumableFile(blob(10), session(10), { fetcher })).rejects.toMatchObject({ code: 'invalid_upload_response' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('resumes from Google acknowledgement rather than the amount previously sent', async () => {
    const size = CHUNK * 2;
    const file = blob(size);
    const slices = vi.spyOn(file, 'slice');
    const fetcher = vi.fn().mockResolvedValueOnce(pending(123)).mockResolvedValueOnce(pending(CHUNK + 123)).mockResolvedValueOnce(complete());
    await uploadResumableFile(file, session(size), { fetcher });
    expect(slices.mock.calls).toEqual([[123, CHUNK + 123], [CHUNK + 123, size]]);
  });

  it('accepts partial acknowledgement and resends only the unacknowledged remainder', async () => {
    const size = CHUNK + 10;
    const fetcher = vi.fn().mockResolvedValueOnce(pending()).mockResolvedValueOnce(pending(100)).mockResolvedValueOnce(complete());
    await uploadResumableFile(blob(size), session(size), { fetcher });
    expect(new Headers(fetcher.mock.calls[2][1].headers).get('Content-Range')).toBe(`bytes 100-${size - 1}/${size}`);
  });

  it('recovers a lost response by probing before retransmission', async () => {
    const size = CHUNK + 5;
    const fetcher = vi.fn().mockResolvedValueOnce(pending()).mockRejectedValueOnce(new TypeError('network at PRIVATE-CAPABILITY')).mockResolvedValueOnce(pending(CHUNK)).mockResolvedValueOnce(complete());
    const delay = vi.fn(async () => {});
    const result = await uploadResumableFile(blob(size), session(size), { fetcher, delay });
    expect(delay).toHaveBeenCalledWith(500, undefined);
    expect(new Headers(fetcher.mock.calls[2][1].headers).get('Content-Range')).toBe(`bytes */${size}`);
    expect(new Headers(fetcher.mock.calls[3][1].headers).get('Content-Range')).toBe(`bytes ${CHUNK}-${size - 1}/${size}`);
    expect(result.status).toBe('uploaded_unverified');
  });

  it('recognizes a previously finished session without slicing or uploading again', async () => {
    const file = blob(10);
    const slice = vi.spyOn(file, 'slice');
    const fetcher = vi.fn(async () => complete());
    await expect(uploadResumableFile(file, session(10), { fetcher })).resolves.toMatchObject({ status: 'uploaded_unverified' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(slice).not.toHaveBeenCalled();
  });

  it('waits for a 200/201 confirmation even if 308 acknowledges every byte', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(pending()).mockResolvedValueOnce(pending(10)).mockResolvedValueOnce(complete());
    await uploadResumableFile(blob(10), session(10), { fetcher });
    expect(new Headers(fetcher.mock.calls[2][1].headers).get('Content-Range')).toBe('bytes */10');
  });

  it('bounds retries with exponential backoff and no raw error disclosure', async () => {
    const fetcher = vi.fn(async () => { throw new TypeError(`failed URL ${sessionUrl}`); });
    const delay = vi.fn(async () => {});
    await expect(uploadResumableFile(blob(10), session(10), { fetcher, delay, maxRetries: 3, baseDelayMs: 100, maxDelayMs: 300 })).rejects.toMatchObject({ message: 'upload_retry_exhausted' });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(delay.mock.calls).toEqual([[100, undefined], [200, undefined], [300, undefined]]);
  });

  it.each([408, 429, 500, 502, 503])('recovers transient HTTP %i with a status probe', async (status) => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('private upstream error', { status })).mockResolvedValueOnce(pending()).mockResolvedValueOnce(complete());
    await expect(uploadResumableFile(blob(10), session(10), { fetcher, delay: immediate })).resolves.toMatchObject({ status: 'uploaded_unverified' });
    expect(new Headers(fetcher.mock.calls[1][1].headers).get('Content-Range')).toBe('bytes */10');
  });

  it('caps Retry-After to the configured delay budget', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '3600' } })).mockResolvedValueOnce(complete());
    const delay = vi.fn(async () => {});
    await uploadResumableFile(blob(10), session(10), { fetcher, delay, maxDelayMs: 1000 });
    expect(delay).toHaveBeenCalledWith(1000, undefined);
  });

  it('bounds stalled acknowledgements instead of looping or declaring success', async () => {
    const fetcher = vi.fn(async () => pending());
    const delay = vi.fn(async () => {});
    await expect(uploadResumableFile(blob(10), session(10), { fetcher, delay, maxRetries: 2 })).rejects.toMatchObject({ code: 'upload_retry_exhausted' });
    expect(fetcher).toHaveBeenCalledTimes(6); // first probe + three stalled chunks + two recovery probes
    expect(delay).toHaveBeenCalledTimes(2);
  });

  it('bounds a server perpetually acknowledging all bytes without a completion response', async () => {
    const fetcher = vi.fn(async () => pending(10));
    await expect(uploadResumableFile(blob(10), session(10), { fetcher, delay: immediate, maxRetries: 1 })).rejects.toMatchObject({ code: 'upload_retry_exhausted' });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it.each([404, 410])('requires a new backend-issued session on HTTP %i', async (status) => {
    const fetcher = vi.fn(async () => new Response('private details', { status }));
    await expect(uploadResumableFile(blob(10), session(10), { fetcher, delay: immediate })).rejects.toMatchObject({ code: 'upload_session_expired' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403])('does not request OAuth tokens or retry access-denied HTTP %i', async (status) => {
    const fetcher = vi.fn(async () => new Response('private details', { status }));
    await expect(uploadResumableFile(blob(10), session(10), { fetcher, delay: immediate })).rejects.toMatchObject({ code: 'upload_access_denied' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(['bytes=1-3', 'bytes=0-99', 'bytes=0-NaN', 'bytes=0-3,5-9'])('rejects malformed or impossible acknowledgements: %s', async (range) => {
    await expect(uploadResumableFile(blob(10), session(10), { fetcher: async () => new Response(null, { status: 308, headers: { Range: range } }) })).rejects.toMatchObject({ code: 'invalid_upload_response' });
  });

  it('rejects acknowledgement that moves backwards', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(pending(5)).mockResolvedValueOnce(pending(3));
    await expect(uploadResumableFile(blob(10), session(10), { fetcher })).rejects.toMatchObject({ code: 'invalid_upload_response' });
  });

  it('rejects early completion of a non-final chunk', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(pending()).mockResolvedValueOnce(complete());
    await expect(uploadResumableFile(blob(CHUNK + 1), session(CHUNK + 1), { fetcher })).rejects.toMatchObject({ code: 'invalid_upload_response' });
  });

  it('validates URL, file size, MIME and chunk size before network access', async () => {
    const fetcher = vi.fn();
    for (const url of ['https://evil.test/?upload_id=x', 'http://www.googleapis.com/upload/drive/v3/files?upload_id=x', 'https://www.googleapis.com/drive/v3/files?upload_id=x', `${sessionUrl}#private`]) {
      await expect(uploadResumableFile(blob(10), { ...session(10), sessionUrl: url }, { fetcher })).rejects.toMatchObject({ code: 'invalid_upload_session' });
    }
    await expect(uploadResumableFile(blob(11), session(10), { fetcher })).rejects.toMatchObject({ code: 'invalid_upload_file' });
    await expect(uploadResumableFile(new Blob(['test'], { type: 'text/html' }), session(4), { fetcher })).rejects.toMatchObject({ code: 'invalid_upload_file' });
    await expect(uploadResumableFile(blob(10), session(10), { fetcher, chunkSize: 10 })).rejects.toMatchObject({ code: 'invalid_upload_options' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('aborts before making a request', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn();
    await expect(uploadResumableFile(blob(10), session(10), { fetcher, signal: controller.signal })).rejects.toMatchObject({ code: 'upload_aborted' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('passes abort to the active request and stops without retrying', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBe(controller.signal);
      controller.abort();
      throw new DOMException('Aborted', 'AbortError');
    });
    const delay = vi.fn(async () => {});
    await expect(uploadResumableFile(blob(10), session(10), { fetcher, signal: controller.signal, delay })).rejects.toMatchObject({ code: 'upload_aborted' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(delay).not.toHaveBeenCalled();
  });

  it('honors abort during the retry delay', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(async () => new Response(null, { status: 503 }));
    const delay = vi.fn(async () => { controller.abort(); });
    await expect(uploadResumableFile(blob(10), session(10), { fetcher, signal: controller.signal, delay })).rejects.toMatchObject({ code: 'upload_aborted' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
