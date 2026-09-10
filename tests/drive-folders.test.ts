// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  checkDriveUpload, ensureDriveFolder, generateDriveId, getDriveAccount, initiateDriveUpload,
  pinDriveAssetRevision, streamDriveAsset, streamTeamDriveAsset,
  type DriveFolderExpectation, type DriveFile, type StoredAsset, type UploadExpectation,
} from '../server/drive';

const folder: DriveFolderExpectation = {
  id: 'reserved-folder', name: 'Septiembre 2026', parentId: 'client-folder',
  workspaceId: 'workspace', logicalKey: 'client-client-2026-09',
};
const folderFile = {
  id: folder.id, name: folder.name, mimeType: 'application/vnd.google-apps.folder',
  parents: [folder.parentId], trashed: false,
  appProperties: { workspaceId: folder.workspaceId, logicalKey: folder.logicalKey },
};

describe('Drive account and reserved identifiers', () => {
  it('requests only one Drive file ID and returns its validated value', async () => {
    const fetcher = vi.fn(async () => Response.json({ ids: ['reserved-id'] }));
    await expect(generateDriveId('access', fetcher)).resolves.toBe('reserved-id');
    const [input, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const url = new URL(input);
    expect(url.pathname).toBe('/drive/v3/files/generateIds');
    expect(Object.fromEntries(url.searchParams)).toEqual({ count: '1', space: 'drive', type: 'files', fields: 'ids' });
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer access');
    expect(init.redirect).toBe('manual');
  });

  it.each([null, {}, { ids: [] }, { ids: ['one', 'two'] }, { ids: ['../unsafe'] }, { ids: [12] }])('rejects invalid reserved ID responses', async data => {
    await expect(generateDriveId('access', async () => Response.json(data))).rejects.toMatchObject({ code: 'invalid_drive_response' });
  });

  it('returns just the connected account identity', async () => {
    const fetcher = vi.fn(async () => Response.json({ user: { emailAddress: 'team@example.com', permissionId: '123456', displayName: 'Private display name' } }));
    await expect(getDriveAccount('access', fetcher)).resolves.toEqual({ email: 'team@example.com', permissionId: '123456' });
    const [input] = fetcher.mock.calls[0] as unknown as [string];
    expect(new URL(input).pathname).toBe('/drive/v3/about');
    expect(new URL(input).searchParams.get('fields')).toBe('user(emailAddress,permissionId)');
  });

  it.each([
    null, {}, { user: {} }, { user: { emailAddress: 'invalid', permissionId: '123' } },
    { user: { emailAddress: 'team@example.com\r\n', permissionId: '123' } },
    { user: { emailAddress: 'team@example.com', permissionId: '../other' } },
    { user: { emailAddress: 'team@example.com', permissionId: 123 } },
  ])('rejects missing or malformed account identity', async data => {
    await expect(getDriveAccount('access', async () => Response.json(data))).rejects.toMatchObject({ code: 'invalid_drive_response' });
  });

  it('redacts provider errors and does not follow a credentials-bearing redirect', async () => {
    const fetcher = vi.fn(async () => new Response('PRIVATE PROVIDER DETAILS', { status: 403 }));
    await expect(getDriveAccount('access', fetcher)).rejects.toMatchObject({ message: 'drive_access_denied' });
    const [_, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.redirect).toBe('manual');
  });
});

describe('idempotent app-owned Drive folders', () => {
  it('creates a missing folder with its reserved ID and persisted parent binding', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 })).mockResolvedValueOnce(Response.json(folderFile));
    await expect(ensureDriveFolder('access', folder, fetcher)).resolves.toEqual({ id: folder.id, name: folder.name });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [input, init] = fetcher.mock.calls[1];
    expect(new URL(input).pathname).toBe('/drive/v3/files');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      id: folder.id, name: folder.name, mimeType: 'application/vnd.google-apps.folder',
      parents: [folder.parentId], appProperties: folderFile.appProperties,
    });
    expect(init.redirect).toBe('manual');
  });

  it('creates a top-level app folder without claiming an arbitrary existing parent', async () => {
    const root = { ...folder, parentId: undefined };
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 })).mockResolvedValueOnce(Response.json(folderFile));
    await ensureDriveFolder('access', root, fetcher);
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).not.toHaveProperty('parents');
  });

  it('recognizes an existing renamed folder without searching, moving or creating', async () => {
    const fetcher = vi.fn(async () => Response.json({ ...folderFile, name: 'Mes editado en Drive' }));
    await expect(ensureDriveFolder('access', folder, fetcher)).resolves.toEqual({ id: folder.id, name: 'Mes editado en Drive' });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([
    { id: 'other-folder' }, { mimeType: 'video/mp4' }, { trashed: true }, { parents: ['other-parent'] },
    { appProperties: { workspaceId: 'other-workspace', logicalKey: folder.logicalKey } },
    { appProperties: { workspaceId: folder.workspaceId, logicalKey: 'other-month' } },
  ])('rejects a reserved ID collision or changed folder binding: %j', async override => {
    const fetcher = vi.fn(async () => Response.json({ ...folderFile, ...override }));
    await expect(ensureDriveFolder('access', folder, fetcher)).rejects.toMatchObject({ code: 'drive_folder_mismatch', status: 409 });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([
    { appProperties: null }, { appProperties: ['workspace', 'key'] }, { appProperties: { workspaceId: 42 } },
    { parents: ['../other'] }, { trashed: 'false' },
  ])('rejects malformed metadata without treating it as missing', async override => {
    const fetcher = vi.fn(async () => Response.json({ ...folderFile, ...override }));
    await expect(ensureDriveFolder('access', folder, fetcher)).rejects.toMatchObject({ code: 'invalid_drive_response' });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([409, 408, 500, 503])('recovers a concurrently committed or uncertain create after HTTP %s', async status => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response('PRIVATE PROVIDER DETAILS', { status }))
      .mockResolvedValueOnce(Response.json(folderFile));
    await expect(ensureDriveFolder('access', folder, fetcher)).resolves.toEqual({ id: folder.id, name: folder.name });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(new URL(fetcher.mock.calls[2][0]).pathname).toBe('/drive/v3/files/reserved-folder');
    expect(fetcher.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(1);
  });

  it('recovers a lost create response by reading the reserved ID', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockRejectedValueOnce(new TypeError('PRIVATE TOKEN URL')).mockResolvedValueOnce(Response.json(folderFile));
    await expect(ensureDriveFolder('access', folder, fetcher)).resolves.toEqual({ id: folder.id, name: folder.name });
  });

  it('rejects another folder at the reserved ID after a create conflict', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ ...folderFile, appProperties: { workspaceId: 'other' } }));
    await expect(ensureDriveFolder('access', folder, fetcher)).rejects.toMatchObject({ code: 'drive_folder_mismatch' });
  });

  it('reports unresolved lost creation without creating twice', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockRejectedValueOnce(new TypeError('PRIVATE URL')).mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(ensureDriveFolder('access', folder, fetcher)).rejects.toMatchObject({ message: 'drive_unavailable' });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it.each([401, 403, 429])('does not create after a denied or throttled metadata request: %s', async status => {
    const fetcher = vi.fn(async () => new Response(null, { status }));
    await expect(ensureDriveFolder('access', folder, fetcher)).rejects.toBeDefined();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('validates IDs and the Google property byte limit before network access', async () => {
    const fetcher = vi.fn();
    await expect(ensureDriveFolder('access', { ...folder, id: '../x' }, fetcher)).rejects.toMatchObject({ code: 'invalid_file' });
    await expect(ensureDriveFolder('access', { ...folder, logicalKey: 'é'.repeat(58) }, fetcher)).rejects.toMatchObject({ code: 'invalid_folder' });
    await expect(ensureDriveFolder('access', { ...folder, name: 'x\n' }, fetcher)).rejects.toMatchObject({ code: 'invalid_folder' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

const expected: UploadExpectation = {
  uploadId: 'upload', workspaceId: 'workspace', clientId: 'client', requestId: 'piece',
  parentFolderId: 'parent', driveFileId: 'reserved-file', name: 'Toma.mov', mimeType: 'video/quicktime', size: 3,
};
const sessionUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=PRIVATE';
const uploadedFile: DriveFile = {
  id: expected.driveFileId!, name: expected.name, mimeType: expected.mimeType, size: String(expected.size),
  parents: ['parent'], trashed: false, md5Checksum: 'a'.repeat(32),
  appProperties: { uploadId: 'upload', workspaceId: 'workspace', clientId: 'client', requestId: 'piece' },
};
const asset: StoredAsset = {
  driveFileId: uploadedFile.id, name: uploadedFile.name, mimeType: uploadedFile.mimeType, size: expected.size,
  workspaceId: 'workspace', clientId: 'client', checksum: uploadedFile.md5Checksum!,
};

describe('reserved uploads and private original-file downloads', () => {
  it('includes the reserved file ID when initiating a raw upload', async () => {
    const fetcher = vi.fn(async () => new Response(null, { headers: { Location: sessionUrl } }));
    await initiateDriveUpload('access', expected, fetcher);
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).id).toBe('reserved-file');
    expect(JSON.parse(String(init.body)).mimeType).toBe('video/quicktime');
  });

  it('accepts only completion metadata for the reserved file and authorized piece', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ id: uploadedFile.id })).mockResolvedValueOnce(Response.json(uploadedFile));
    await expect(checkDriveUpload('access', { sessionUrl, expected }, fetcher)).resolves.toEqual({ status: 'complete', file: uploadedFile });
    for (const override of [{ id: 'different-file' }, { appProperties: { ...uploadedFile.appProperties, requestId: 'other-piece' } }]) {
      const file = { ...uploadedFile, ...override };
      const wrong = vi.fn().mockResolvedValueOnce(Response.json({ id: file.id })).mockResolvedValueOnce(Response.json(file));
      await expect(checkDriveUpload('access', { sessionUrl, expected }, wrong)).rejects.toMatchObject({ code: 'upload_verification_failed' });
    }
  });

  it.each([404, 410])('recovers a completed reserved file after its upload session disappears (%s)', async status => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('PRIVATE SESSION ERROR', { status }))
      .mockResolvedValueOnce(Response.json(uploadedFile));
    await expect(checkDriveUpload('access', { sessionUrl, expected }, fetcher)).resolves.toEqual({ status: 'complete', file: uploadedFile });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [input, init] = fetcher.mock.calls[1];
    expect(new URL(input).pathname).toBe('/drive/v3/files/reserved-file');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer access');
    expect(init.redirect).toBe('manual');
  });

  it.each([
    { size: '2' }, { mimeType: 'video/mp4' }, { trashed: true }, { md5Checksum: undefined }, { parents: ['other-parent'] },
    { appProperties: { ...uploadedFile.appProperties, uploadId: 'other-upload' } },
    { appProperties: { ...uploadedFile.appProperties, workspaceId: 'other-workspace' } },
    { appProperties: { ...uploadedFile.appProperties, clientId: 'other-client' } },
    { appProperties: { ...uploadedFile.appProperties, requestId: 'other-piece' } },
  ])('never recovers an expired upload with mismatched metadata: %j', async override => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ ...uploadedFile, ...override }));
    await expect(checkDriveUpload('access', { sessionUrl, expected }, fetcher)).rejects.toMatchObject({ code: 'upload_verification_failed' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([404, 410])('still rejects recovery when the reserved file is missing (%s)', async status => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status }))
      .mockResolvedValueOnce(new Response('PRIVATE FILE ERROR', { status: 404 }));
    await expect(checkDriveUpload('access', { sessionUrl, expected }, fetcher)).rejects.toMatchObject({ code: 'drive_file_missing', status: 404 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403, 429, 500])('does not substitute file lookup for a live session error (%s)', async status => {
    const fetcher = vi.fn(async () => new Response(null, { status }));
    await expect(checkDriveUpload('access', { sessionUrl, expected }, fetcher)).rejects.toBeDefined();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([404, 410])('does not search for legacy uploads without a reserved ID (%s)', async status => {
    const fetcher = vi.fn(async () => new Response(null, { status }));
    await expect(checkDriveUpload('access', { sessionUrl, expected: { ...expected, driveFileId: undefined } }, fetcher)).rejects.toMatchObject({ code: 'drive_file_missing' });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each(['video/quicktime', 'image/heic', 'image/avif', 'application/pdf', 'application/octet-stream', 'text/html'])('keeps %s originals as private attachments, outside review snapshots', async mimeType => {
    const file = { ...uploadedFile, mimeType };
    const original = { ...asset, mimeType };
    const body = new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Length': '3', 'Set-Cookie': 'PRIVATE' } });
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(file)).mockResolvedValueOnce(body);
    const result = await streamDriveAsset('access', original, null, fetcher);
    expect(result.body).toBe(body.body);
    expect(result.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(result.headers.get('Content-Disposition')).toBe('attachment');
    expect(result.headers.get('Cache-Control')).toBe('private, no-store');
    expect(result.headers.get('Set-Cookie')).toBeNull();
    const pinFetcher = vi.fn();
    await expect(pinDriveAssetRevision('access', original, pinFetcher)).rejects.toMatchObject({ code: 'snapshot_verification_failed' });
    expect(pinFetcher).not.toHaveBeenCalled();
  });

  it('forces a safely named download while preserving the original stream and range', async () => {
    const original = { ...asset, name: 'Toma ñ/2\r\n.mov' };
    const body = new Response(new Uint8Array([2, 3]), { status: 206, headers: { 'Content-Length': '2', 'Content-Range': 'bytes 1-2/3' } });
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(uploadedFile)).mockResolvedValueOnce(body);
    const result = await streamTeamDriveAsset('access', original, 'bytes=1-', fetcher);
    expect(result.status).toBe(206);
    expect(result.body).toBe(body.body);
    expect(result.headers.get('Content-Range')).toBe('bytes 1-2/3');
    expect(result.headers.get('Content-Disposition')).toBe('attachment; filename="archivo"; filename*=UTF-8\'\'Toma%20%C3%B1_2__.mov');
    expect(new Headers(fetcher.mock.calls[1][1].headers).get('Range')).toBe('bytes=1-');
  });

  it('denies an attachment when its persisted client binding differs', async () => {
    const fetcher = vi.fn(async () => Response.json({ ...uploadedFile, appProperties: { ...uploadedFile.appProperties, clientId: 'other-client' } }));
    await expect(streamTeamDriveAsset('access', asset, null, fetcher)).rejects.toMatchObject({ code: 'asset_changed_or_inaccessible' });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
