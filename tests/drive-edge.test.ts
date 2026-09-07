// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { copyPinnedDriveSnapshot, getDriveFile, pinDriveAssetRevision, streamDriveAsset, streamPinnedDriveAsset, type DriveFile, type PinnedDriveAsset, type StoredAsset } from '../server/drive';

const asset: StoredAsset = { driveFileId: 'file', name: 'video.mp4', mimeType: 'video/mp4', size: 100, workspaceId: 'workspace', clientId: 'client', checksum: 'a'.repeat(32) };
const file: DriveFile = { id: 'file', name: asset.name, mimeType: asset.mimeType, size: '100', md5Checksum: asset.checksum, parents: ['parent'], appProperties: { workspaceId: 'workspace', clientId: 'client' }, trashed: false };
const media = (status: number, headers: Record<string, string>) => new Response(new Uint8Array(3), { status, headers });

describe('Drive metadata and byte-range consistency', () => {
  it('rejects a metadata response for a different file ID', async () => {
    await expect(getDriveFile('token', 'file', async () => Response.json({ ...file, id: 'another-file' }))).rejects.toMatchObject({ code: 'invalid_drive_response' });
  });

  it.each([
    { md5Checksum: 12345678901234567890123456789012 },
    { parents: ['../other'] },
    { appProperties: ['workspace', 'client'] },
    { appProperties: { workspaceId: 42 } },
    { size: '9007199254740992' },
  ])('rejects inconsistent metadata types: %j', async (override) => {
    await expect(getDriveFile('token', 'file', async () => Response.json({ ...file, ...override }))).rejects.toMatchObject({ code: 'invalid_drive_response' });
  });

  it.each([
    ['bytes=0-2', 'bytes 1-3/100', '3'],
    ['bytes=0-2', 'bytes 0-2/101', '3'],
    ['bytes=0-2', 'bytes 0-1/100', '2'],
    ['bytes=0-2', 'bytes 2-0/100', '3'],
    ['bytes=0-2', 'bytes 0-100/100', '101'],
    ['bytes=0-2', 'bytes 0-2/100', '4'],
    ['bytes=0-2', 'bytes 0-2/100', 'not-a-length'],
    ['bytes=0-2', 'bytes 0-2/100', '9007199254740992'],
    ['bytes=100-', 'bytes 0-2/100', '3'],
  ])('rejects mismatched range or length: %s / %s / %s', async (requestRange, contentRange, length) => {
    const response = media(206, { 'Content-Range': contentRange, 'Content-Length': length });
    const cancel = vi.spyOn(response.body!, 'cancel');
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(file)).mockResolvedValueOnce(response);
    await expect(streamDriveAsset('token', asset, requestRange, fetcher)).rejects.toMatchObject({ code: 'invalid_drive_response' });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([
    ['bytes=-3', 'bytes 97-99/100', '3'],
    ['bytes=97-', 'bytes 97-99/100', '3'],
    ['bytes=97-500', 'bytes 97-99/100', '3'],
    ['bytes=-200', 'bytes 0-99/100', '100'],
  ])('supports suffix, open and file-clamped ranges: %s', async (requestRange, contentRange, length) => {
    const response = media(206, { 'Content-Range': contentRange, 'Content-Length': length });
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(file)).mockResolvedValueOnce(response);
    const result = await streamDriveAsset('token', asset, requestRange, fetcher);
    expect(result.status).toBe(206);
    expect(result.body).toBe(response.body);
    expect(result.headers.get('Content-Range')).toBe(contentRange);
  });

  it('rejects a partial response when the caller requested the complete file', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(file)).mockResolvedValueOnce(media(206, { 'Content-Range': 'bytes 0-2/100' }));
    await expect(streamDriveAsset('token', asset, null, fetcher)).rejects.toMatchObject({ code: 'invalid_drive_response' });
  });

  it('rejects the wrong full-file length while preserving valid streaming bodies', async () => {
    const wrong = vi.fn().mockResolvedValueOnce(Response.json(file)).mockResolvedValueOnce(media(200, { 'Content-Length': '99' }));
    await expect(streamDriveAsset('token', asset, null, wrong)).rejects.toMatchObject({ code: 'invalid_drive_response' });
    const response = new Response(new Uint8Array(100), { headers: { 'Content-Length': '100' } });
    const valid = vi.fn().mockResolvedValueOnce(Response.json(file)).mockResolvedValueOnce(response);
    const result = await streamDriveAsset('token', asset, null, valid);
    expect(result.body).toBe(response.body);
    expect(result.headers.get('Content-Length')).toBe('100');
  });

  it('rejects a provider-reported total that changed while requesting an unsatisfiable range', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(file)).mockResolvedValueOnce(new Response('private', { status: 416, headers: { 'Content-Range': 'bytes */101' } }));
    await expect(streamDriveAsset('token', asset, 'bytes=200-', fetcher)).rejects.toMatchObject({ code: 'invalid_drive_response' });
  });

  it('validates stored size and checksum before any provider access', async () => {
    const fetcher = vi.fn();
    await expect(streamDriveAsset('token', { ...asset, size: -1 }, null, fetcher)).rejects.toMatchObject({ code: 'asset_changed_or_inaccessible' });
    await expect(streamDriveAsset('token', { ...asset, checksum: 'not-a-checksum' }, null, fetcher)).rejects.toMatchObject({ code: 'asset_changed_or_inaccessible' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

const pinned: PinnedDriveAsset = { ...asset, driveRevisionId: 'original-revision' };
const originalHead: DriveFile = { ...file, headRevisionId: pinned.driveRevisionId };
const revision = { id: pinned.driveRevisionId, mimeType: asset.mimeType, size: String(asset.size), md5Checksum: asset.checksum, keepForever: true };

describe('Drive immutable binary review snapshots', () => {
  it('pins the observed revision with keepForever and persists its verified identity', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(originalHead)).mockResolvedValueOnce(Response.json(revision));
    await expect(pinDriveAssetRevision('token', asset, fetcher)).resolves.toEqual(pinned);
    const [url, init] = fetcher.mock.calls[1];
    expect(new URL(url).pathname).toBe('/drive/v3/files/file/revisions/original-revision');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ keepForever: true });
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token');
    expect(init.redirect).toBe('error');
  });

  it.each([
    { headRevisionId: undefined },
    { md5Checksum: 'b'.repeat(32) },
    { size: '101' },
    { mimeType: 'image/png' },
  ])('does not pin a changed or unsupported head: %j', async (override) => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ ...originalHead, ...override }));
    await expect(pinDriveAssetRevision('token', asset, fetcher)).rejects.toMatchObject({ code: 'snapshot_verification_failed' });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([
    { id: 'different-revision' },
    { keepForever: false },
    { keepForever: 'true' },
    { md5Checksum: 'b'.repeat(32) },
    { size: 100 },
    { mimeType: 'image/png' },
  ])('rejects pinning or reading an unverified revision: %j', async (override) => {
    const pinFetcher = vi.fn().mockResolvedValueOnce(Response.json(originalHead)).mockResolvedValueOnce(Response.json({ ...revision, ...override }));
    await expect(pinDriveAssetRevision('token', asset, pinFetcher)).rejects.toMatchObject({ code: 'snapshot_verification_failed' });
    const streamFetcher = vi.fn().mockResolvedValueOnce(Response.json(originalHead)).mockResolvedValueOnce(Response.json({ ...revision, ...override }));
    await expect(streamPinnedDriveAsset('token', pinned, null, streamFetcher)).rejects.toMatchObject({ code: 'snapshot_verification_failed' });
    expect(streamFetcher).toHaveBeenCalledTimes(2);
  });

  it('continues addressing the original revision if a new head appears before pinning completes', async () => {
    const fetcher = vi.fn().mockImplementationOnce(async () => Response.json(originalHead))
      .mockImplementationOnce(async (url, init) => {
        // A different head can now exist: the update still addresses immutable original content.
        expect(new URL(url).pathname).toContain('/revisions/original-revision');
        expect(init.method).toBe('PATCH');
        return Response.json(revision);
      });
    await expect(pinDriveAssetRevision('token', asset, fetcher)).resolves.toEqual(pinned);
  });

  it('streams the pinned bytes even when the file head now contains different content', async () => {
    const newHead = { ...originalHead, headRevisionId: 'new-revision', size: '300', md5Checksum: 'b'.repeat(32), mimeType: 'image/png' };
    const response = media(206, { 'Content-Range': 'bytes 0-2/100', 'Content-Length': '3', 'Set-Cookie': 'private=value' });
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(newHead)).mockResolvedValueOnce(Response.json(revision)).mockResolvedValueOnce(response);
    const result = await streamPinnedDriveAsset('token', pinned, 'bytes=0-2', fetcher);
    expect(result.status).toBe(206);
    expect(result.body).toBe(response.body);
    expect(result.headers.get('Content-Type')).toBe('video/mp4');
    expect(result.headers.get('Cache-Control')).toBe('private, no-store');
    expect(result.headers.get('Set-Cookie')).toBeNull();
    const [url, init] = fetcher.mock.calls[2];
    expect(url).toBe('https://www.googleapis.com/drive/v3/files/file/revisions/original-revision?alt=media');
    expect(new Headers(init.headers).get('Range')).toBe('bytes=0-2');
    expect(init.redirect).toBe('error');
  });

  it.each([404, 403])('never falls back to current file content if revision media returns %s', async (status) => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(originalHead)).mockResolvedValueOnce(Response.json(revision))
      .mockResolvedValueOnce(new Response('private provider detail', { status }));
    await expect(streamPinnedDriveAsset('token', pinned, null, fetcher)).rejects.toMatchObject({ code: status === 404 ? 'drive_file_missing' : 'drive_access_denied' });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.every(([url]) => !String(url).includes('/files/file?alt=media'))).toBe(true);
  });

  it.each([
    { trashed: true },
    { appProperties: { workspaceId: 'other', clientId: 'client' } },
    { appProperties: { workspaceId: 'workspace', clientId: 'other' } },
  ])('rejects trashed files or another tenant before accessing revision metadata: %j', async (override) => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ ...originalHead, ...override }));
    await expect(streamPinnedDriveAsset('token', pinned, null, fetcher)).rejects.toMatchObject({ code: 'asset_changed_or_inaccessible' });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each(['../head', undefined, ''])('rejects invalid stored revision IDs before provider access: %s', async (driveRevisionId) => {
    const fetcher = vi.fn();
    await expect(streamPinnedDriveAsset('token', { ...pinned, driveRevisionId } as PinnedDriveAsset, null, fetcher)).rejects.toMatchObject({ code: 'invalid_file' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('applies the same byte-range validation to immutable revision content', async () => {
    const response = media(206, { 'Content-Range': 'bytes 1-3/100', 'Content-Length': '3' });
    const cancel = vi.spyOn(response.body!, 'cancel');
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(originalHead)).mockResolvedValueOnce(Response.json(revision)).mockResolvedValueOnce(response);
    await expect(streamPinnedDriveAsset('token', pinned, 'bytes=0-2', fetcher)).rejects.toMatchObject({ code: 'invalid_drive_response' });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('copies into the destination and returns a snapshot only after pinning its copied revision', async () => {
    const copied = { ...originalHead, id: 'copy', appProperties: { ...file.appProperties, pieceId: 'piece' } };
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(copied)).mockResolvedValueOnce(Response.json(copied)).mockResolvedValueOnce(Response.json(revision));
    await expect(copyPinnedDriveSnapshot('token', 'source', { workspaceId: 'workspace', clientId: 'client', pieceId: 'piece', parentFolderId: 'parent', name: asset.name }, fetcher))
      .resolves.toEqual({ ...pinned, driveFileId: 'copy' });
    expect(new URL(fetcher.mock.calls[0][0]).pathname).toBe('/drive/v3/files/source/copy');
    expect(new URL(fetcher.mock.calls[2][0]).pathname).toBe('/drive/v3/files/copy/revisions/original-revision');
  });

  it('surfaces provider retention failures without returning a supposedly pinned snapshot', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(originalHead)).mockResolvedValueOnce(new Response('retention or permission failure', { status: 403 }));
    await expect(pinDriveAssetRevision('token', asset, fetcher)).rejects.toMatchObject({ code: 'drive_access_denied' });
  });
});
