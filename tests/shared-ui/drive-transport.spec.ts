import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';
import type { UploadProgress } from '../../src/lib/resumable-upload';

test('transporte nativo: negocia 308 sin redirección y continúa desde los bytes confirmados', async ({ page }) => {
  // Real local HTTP responses exercise Chromium's CORS and redirect handling.
  // route.fulfill and mocked fetch responses skip the behavior that broke Drive.
  const chunk = 256 * 1024;
  const total = chunk * 2 + 17;
  const requests: Array<{ range: string; bytes: number; compatibility?: string; origin?: string; authorization?: string; cookie?: string; correctBody: boolean }> = [];
  const preflights: string[] = [];
  let acknowledged = 0;
  let redirectHits = 0;
  let forcedRedirects = 0;
  const server = createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'PUT');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Content-Range, X-GUploader-No-308');
    response.setHeader('Access-Control-Expose-Headers', 'Range, X-Http-Status-Code-Override');
    if (request.method === 'OPTIONS') {
      preflights.push(String(request.headers['access-control-request-headers'] ?? ''));
      response.writeHead(204).end(); return;
    }
    const parts: Buffer[] = [];
    for await (const part of request) parts.push(Buffer.from(part));
    const bytes = Buffer.concat(parts);
    if (request.url === '/redirect-target') { redirectHits++; response.writeHead(200).end(); return; }
    if (request.url === '/forced-redirect') {
      forcedRedirects++;
      response.writeHead(308, { Location: '/redirect-target' }).end(); return;
    }
    if (request.url !== '/upload') { response.writeHead(404).end(); return; }
    const range = String(request.headers['content-range'] ?? '');
    const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range);
    const start = Number(match?.[1]);
    const end = Number(match?.[2]) + 1;
    const correctBody = match
      ? start === acknowledged && Number(match[3]) === total && bytes.length === end - start && bytes.every((value, index) => value === (start + index) % 251)
      : range === `bytes */${total}` && bytes.length === 0;
    requests.push({ range, bytes: bytes.length, compatibility: request.headers['x-guploader-no-308'] as string | undefined, origin: request.headers.origin, authorization: request.headers.authorization, cookie: request.headers.cookie, correctBody });
    if (!correctBody) { response.writeHead(400).end(); return; }
    if (match) {
      // The first chunk is only partly acknowledged. The browser must resend
      // the remaining bytes instead of advancing by the full amount sent.
      acknowledged = start === 0 ? chunk / 2 : end;
    }
    if (acknowledged === total) { response.writeHead(201, { 'Content-Type': 'application/json' }).end('{}'); return; }
    response.setHeader('Location', '/redirect-target');
    if (acknowledged) response.setHeader('Range', `bytes=0-${acknowledged - 1}`);
    if (request.headers['x-guploader-no-308'] === 'yes') {
      response.setHeader('X-Http-Status-Code-Override', '308');
      response.writeHead(200).end();
    } else response.writeHead(308).end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const uploadOrigin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await page.goto('/');
    const result = await page.evaluate(async ({ uploadOrigin, total }) => {
      const modulePath = '/src/lib/resumable-upload.ts';
      const { uploadResumableFile } = await import(modulePath) as typeof import('../../src/lib/resumable-upload');
      const file = new Blob([Uint8Array.from({ length: total }, (_, index) => index % 251)], { type: 'video/mp4' });
      const session = { uploadId: 'native-browser-fixture', sessionUrl: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=LOCAL_FIXTURE_ONLY', expectedSize: total, mimeType: file.type };
      let legacyFailure = '';
      try {
        await fetch(`${uploadOrigin}/upload`, { method: 'PUT', headers: { 'Content-Range': `bytes */${total}` }, mode: 'cors', credentials: 'omit', redirect: 'error' });
      } catch (error) { legacyFailure = (error as Error).name; }
      const progress: UploadProgress[] = [];
      const result = await uploadResumableFile(file, session, {
        // Only adapt the destination to the local fixture. Native fetch and
        // every production request option/header remain unchanged.
        fetcher: (_url, init) => fetch(`${uploadOrigin}/upload`, init),
        onProgress: value => progress.push(value), maxRetries: 0,
      });
      let forcedRedirectFailure = '';
      try {
        await uploadResumableFile(file, session, { fetcher: (_url, init) => fetch(`${uploadOrigin}/forced-redirect`, init), maxRetries: 0 });
      } catch (error) { forcedRedirectFailure = (error as Error).message; }
      return { result, progress, legacyFailure, forcedRedirectFailure, pageOrigin: location.origin };
    }, { uploadOrigin, total });

    expect(result.pageOrigin).not.toBe(uploadOrigin);
    expect(result.legacyFailure).toBe('TypeError');
    expect(result.result).toEqual({ status: 'uploaded_unverified', uploadId: 'native-browser-fixture', uploadedBytes: total });
    expect(result.progress).toEqual([
      { acknowledgedBytes: chunk / 2, totalBytes: total, phase: 'uploading' },
      { acknowledgedBytes: chunk * 1.5, totalBytes: total, phase: 'uploading' },
      { acknowledgedBytes: total, totalBytes: total, phase: 'uploaded_unverified' },
    ]);
    expect(requests.map(request => request.range)).toEqual([
      `bytes */${total}`, // Native legacy 308 demonstrates the real redirect failure.
      `bytes */${total}`,
      `bytes 0-${chunk - 1}/${total}`,
      `bytes ${chunk / 2}-${chunk * 1.5 - 1}/${total}`,
      `bytes ${chunk * 1.5}-${total - 1}/${total}`,
    ]);
    expect(requests.every(request => request.correctBody && request.origin === result.pageOrigin && !request.authorization && !request.cookie)).toBe(true);
    expect(requests.slice(1).every(request => request.compatibility === 'yes')).toBe(true);
    expect(preflights.some(headers => headers.includes('x-guploader-no-308') && headers.includes('content-range'))).toBe(true);
    expect(result.forcedRedirectFailure).toBe('upload_retry_exhausted');
    expect(forcedRedirects).toBe(1);
    expect(redirectHits).toBe(0);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  }
});
