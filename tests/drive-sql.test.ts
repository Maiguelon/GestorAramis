// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const id = (prefix: number, suffix = 1) => `${prefix}0000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const W = id(1), W2 = id(1, 2), P = id(4), U = id(0), U2 = id(0, 6);
const generation = randomUUID();
const cipher = (byte = 19) => ({ iv: Array(12).fill(byte), ciphertext: Array(32).fill(byte) });
interface Upload extends Record<string, unknown> { uploadId: string; pieceId: string; name: string; mimeType: string; size: number; driveFileId: string; folderId: string; generation: string; status: string; offset: number }
interface Asset extends Record<string, unknown> { id: string; checksum: string; driveRevisionId: string | null }

describe('private Drive persistence in PostgreSQL (PGlite, not Google/hosted Supabase)', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    for (const path of ['supabase/tests/bootstrap.sql', 'supabase/migrations/202609060001_initial.sql', 'supabase/tests/fixtures.sql', 'supabase/migrations/202609080001_shared_workspace.sql', 'supabase/migrations/202609100001_drive_team.sql']) {
      await db.exec(await readFile(path, 'utf8'));
    }
    await db.query('insert into auth.users(id) values($1)', [U2]);
    await db.query('insert into public.profiles(user_id,display_name) values($1,$2)', [U2, 'Otro integrante']);
    await db.query("insert into public.members(workspace_id,user_id,role) values($1,$2,'staff')", [W, U2]);
  }, 30_000);
  afterAll(async () => { await db?.close(); });
  async function rpc<T = Record<string, unknown>>(action: string, payload: unknown = {}, user = U, workspace = W): Promise<T> {
    await db.exec('set role service_role');
    try { return (await db.query<{ value: T }>('select public.aramis_drive($1,$2,$3,$4::jsonb) as value', [workspace, user, action, JSON.stringify(payload)])).rows[0].value; }
    finally { await db.exec('reset role'); }
  }
  const connection = (patch: Record<string, unknown> = {}) => ({ expectedGeneration: null, generation, encryptedTokens: cipher(), accountEmail: 'test@example.test', accountPermissionId: 'account-one', rootFolderId: null, ...patch });
  const reservation = (patch: Record<string, unknown> = {}) => ({ uploadId: randomUUID(), pieceId: P, name: 'toma.mp4', mimeType: 'video/mp4', size: 1048576, fingerprint: 'sha256-file-fingerprint', driveFileId: 'drive-' + randomUUID(), folderId: 'material-folder', generation, encryptedSession: null, ...patch });
  async function put(patch: Record<string, unknown> = {}, user = U) { return rpc<Upload>('upload-put', reservation(patch), user); }
  const verified = (upload: Upload, patch: Record<string, unknown> = {}) => ({ driveFileId: upload.driveFileId, checksum: 'a'.repeat(32), driveRevisionId: 'revision-one', mimeType: upload.mimeType, size: upload.size, ...patch });
  async function complete(upload: Upload, patch: Record<string, unknown> = {}, user = U) { return rpc<Asset>('upload-complete', { uploadId: upload.uploadId, asset: verified(upload, patch) }, user); }

  it('restricts RPC execution to service_role and fixes security definer search_path', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}; set request.jwt.claim.sub='${U}'`);
      try { await expect(db.query('select public.aramis_drive($1,$2,$3)', [W, U, 'connection-get'])).rejects.toMatchObject({ code: '42501' }); }
      finally { await db.exec('reset role; reset request.jwt.claim.sub'); }
    }
    const fn = (await db.query<{ prosecdef: boolean; proconfig: string[] }>("select prosecdef,proconfig from pg_proc where oid='public.aramis_drive(uuid,uuid,text,jsonb)'::regprocedure")).rows[0];
    expect(fn.prosecdef).toBe(true);
    expect(fn.proconfig).toContain('search_path=""');
  });

  it.each([2, 3, 4, 5, 99])('checks active staff even when service_role supplies customer/other-tenant/inactive/unknown user %s', async user => {
    for (const action of ['connection-get', 'connection-save', 'state-put', 'state-take', 'folder-get', 'folder-put', 'upload-get', 'upload-put', 'upload-update', 'upload-complete', 'list-assets', 'get-asset']) {
      await expect(rpc(action, {}, id(0, user))).rejects.toMatchObject({ code: '42501' });
    }
    await expect(rpc('connection-get', {}, U, W2)).rejects.toMatchObject({ code: '42501' });
  });

  it('protects every private table with RLS and no direct grants, including service_role', async () => {
    const tables = ['drive_connections', 'drive_oauth_states', 'drive_folders', 'drive_uploads', 'drive_team_assets'];
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await db.exec(`set role ${role}`);
      try {
        for (const table of tables) await expect(db.query(`select * from app_private.${table}`)).rejects.toMatchObject({ code: '42501' });
      } finally { await db.exec('reset role'); }
    }
    const rows = (await db.query<{ relname: string; relrowsecurity: boolean }>("select relname,relrowsecurity from pg_class where relnamespace='app_private'::regnamespace and relname=any($1::text[])", [tables])).rows;
    expect(rows).toHaveLength(tables.length);
    expect(rows.every(row => row.relrowsecurity)).toBe(true);
  });

  it('stores encrypted connection only, rejects plaintext, and enforces initial compare-and-set', async () => {
    expect(await rpc('connection-get')).toBeNull();
    await expect(rpc('connection-save', connection({ encryptedTokens: { refresh_token: 'plaintext' } }))).rejects.toThrow('VALIDATION');
    await expect(rpc('connection-save', connection({ encryptedTokens: { iv: [1], ciphertext: Array(32).fill(2) } }))).rejects.toThrow('VALIDATION');
    await expect(rpc('connection-save', connection({ expectedGeneration: randomUUID() }))).rejects.toThrow('CONFLICT');
    const result = await rpc('connection-save', connection());
    expect(result).toMatchObject({ generation, encryptedTokens: cipher(), accountPermissionId: 'account-one', rootFolderId: null });
    await expect(rpc('connection-save', connection())).rejects.toThrow('CONFLICT');
  });

  it('retains connection generation and root on token refresh, rejecting account/namespace swaps', async () => {
    const refreshed = await rpc('connection-save', connection({ expectedGeneration: generation, encryptedTokens: cipher(22), rootFolderId: 'root-folder' }));
    expect(refreshed).toMatchObject({ generation, encryptedTokens: cipher(22), rootFolderId: 'root-folder' });
    await expect(rpc('connection-save', connection({ expectedGeneration: generation, accountPermissionId: 'another-account' }))).rejects.toThrow('ACCOUNT_CONFLICT');
    await expect(rpc('connection-save', connection({ expectedGeneration: generation, generation: randomUUID() }))).rejects.toThrow('CONFLICT');
    await expect(rpc('connection-save', connection({ expectedGeneration: generation, rootFolderId: 'different-root' }))).rejects.toThrow('FOLDER_CONFLICT');
    expect(await rpc('connection-get', {}, U2)).toMatchObject({ rootFolderId: 'root-folder' });
    await rpc('folder-put', { logicalKey: 'material', folderId: 'material-folder' });
    await rpc('folder-put', { logicalKey: 'another-material', folderId: 'another-folder' });
  });

  it('consumes OAuth state once and only for its bound user/workspace', async () => {
    const state = { stateHash: 'b'.repeat(64), encryptedPayload: cipher(), expiresAt: new Date(Date.now() + 600_000).toISOString() };
    expect(await rpc('state-put', state)).toEqual({ stored: true });
    expect(await rpc('state-take', { stateHash: state.stateHash }, U2)).toBeNull();
    expect(await rpc('state-take', { stateHash: state.stateHash }, id(0, 4), W2)).toBeNull();
    expect(await rpc('state-take', { stateHash: state.stateHash })).toMatchObject({ stateHash: state.stateHash, encryptedPayload: cipher() });
    expect(await rpc('state-take', { stateHash: state.stateHash })).toBeNull();
  });

  it('discards expired OAuth state atomically and rejects invalid lifetime/plaintext payload', async () => {
    const state = { stateHash: 'c'.repeat(64), encryptedPayload: cipher(), expiresAt: new Date(Date.now() + 600_000).toISOString() };
    await rpc('state-put', state);
    await db.query("update app_private.drive_oauth_states set expires_at=now()-interval '1 second' where state_hash=$1", [state.stateHash]);
    expect(await rpc('state-take', { stateHash: state.stateHash })).toBeNull();
    expect((await db.query('select * from app_private.drive_oauth_states where state_hash=$1', [state.stateHash])).rows).toEqual([]);
    await expect(rpc('state-put', { ...state, encryptedPayload: { verifier: 'plaintext' } })).rejects.toThrow('VALIDATION');
    await expect(rpc('state-put', { ...state, expiresAt: '2100-01-01T00:00:00Z' })).rejects.toThrow('VALIDATION');
  });

  it('returns the winning folder reservation, preserving original mapping across retries', async () => {
    expect(await rpc('folder-get', { logicalKey: 'client/a/month/2026-09' })).toBeNull();
    const original = await rpc('folder-put', { logicalKey: 'client/a/month/2026-09', folderId: 'folder-one', parentId: 'parent-folder', name: '2026-09' });
    expect(original).toEqual({ logicalKey: 'client/a/month/2026-09', folderId: 'folder-one', parentId: 'parent-folder', name: '2026-09' });
    expect(await rpc('folder-put', { logicalKey: 'client/a/month/2026-09', folderId: 'racing-folder', parentId: 'changed-parent', name: '2026-10' }, U2)).toEqual(original);
    expect(await rpc('folder-get', { logicalKey: 'client/a/month/2026-09' }, id(0, 4), W2)).toBeNull();
  });

  it('reserves an immutable upload before external session creation and replays the current record', async () => {
    const request = reservation();
    const first = await rpc<Upload>('upload-put', request);
    expect(first).toMatchObject({ uploadId: request.uploadId, pieceId: P, status: 'uploading', encryptedSession: null, offset: 0 });
    await rpc('upload-update', { uploadId: first.uploadId, encryptedSession: cipher(25), offset: 262144 });
    expect(await rpc('upload-put', request)).toMatchObject({ uploadId: first.uploadId, encryptedSession: cipher(25), offset: 262144 });
    for (const patch of [{ name: 'different.mp4' }, { mimeType: 'video/webm' }, { size: 50 }, { fingerprint: 'other' }, { folderId: 'another-folder' }, { pieceId: id(4, 2) }]) {
      await expect(rpc('upload-put', { ...request, ...patch })).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    }
    await expect(rpc('upload-put', { ...request, size: '1048576' })).rejects.toThrow('VALIDATION');
    await expect(rpc('upload-put', { ...request, size: 1048576.1 })).rejects.toThrow('VALIDATION');
  });

  it('returns the winning reservation when concurrent initializers pre-generate different Drive file IDs', async () => {
    const request = reservation();
    const winner = await rpc<Upload>('upload-put', request);
    const loser = await rpc<Upload>('upload-put', { ...request, driveFileId: 'losing-pre-generated-id', encryptedSession: cipher(27) });
    expect(loser).toEqual(winner);
    expect(loser.driveFileId).toBe(request.driveFileId);
    expect((await db.query('select upload_id from app_private.drive_uploads where upload_id=$1', [request.uploadId])).rows).toHaveLength(1);
    await expect(rpc('upload-put', { ...request, driveFileId: 'losing-pre-generated-id', name: 'changed.mp4' })).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    await expect(rpc('upload-put', { ...request, driveFileId: 'losing-pre-generated-id', folderId: 'another-folder' })).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  });

  it('sets a resumable session only once and returns the winning record to a losing initializer', async () => {
    const upload = await put();
    const winner = await rpc<Upload>('upload-update', { uploadId: upload.uploadId, encryptedSession: cipher(29), offset: 262144, status: 'uploading' });
    const loser = await rpc<Upload>('upload-update', { uploadId: upload.uploadId, encryptedSession: cipher(30), offset: 524288, status: 'expired' });
    expect(loser).toEqual(winner);
    expect(await rpc('upload-get', { uploadId: upload.uploadId })).toEqual(winner);
    // Normal progress still works once the caller has the winning session.
    expect(await rpc('upload-update', { uploadId: upload.uploadId, offset: 524288 })).toMatchObject({ offset: 524288, encryptedSession: cipher(29) });
    expect(await rpc('upload-update', { uploadId: upload.uploadId, encryptedSession: cipher(31), offset: 0 })).toMatchObject({ offset: 524288, encryptedSession: cipher(29) });
  });

  it('does not expose or mutate another uploader session, even to active staff', async () => {
    const upload = await put();
    for (const action of ['upload-get', 'upload-update', 'upload-complete']) {
      await expect(rpc(action, { uploadId: upload.uploadId }, U2)).rejects.toThrow('NOT_FOUND');
      await expect(rpc(action, { uploadId: upload.uploadId }, id(0, 4), W2)).rejects.toThrow('NOT_FOUND');
    }
    await expect(rpc('upload-put', reservation({ uploadId: upload.uploadId }), U2)).rejects.toThrow('NOT_FOUND');
  });

  it('rejects unknown connection generation, archived pieces, other tenant pieces and malformed size', async () => {
    await expect(put({ generation: randomUUID() })).rejects.toThrow('DRIVE_NOT_CONNECTED');
    await expect(put({ folderId: 'unreserved-or-other-workspace' })).rejects.toThrow('FOLDER_NOT_FOUND');
    for (const pieceId of [id(4, 4), id(4, 5), randomUUID()]) await expect(put({ pieceId })).rejects.toThrow('NOT_FOUND');
    for (const size of [0, -1, 1.5, 10737418241, '100']) await expect(put({ size })).rejects.toThrow();
    await expect(put({ encryptedSession: { url: 'https://upload.example/secret' } })).rejects.toThrow('VALIDATION');
  });

  it('persists only monotonic byte offsets, validates session ciphertext and rejects forged completion status', async () => {
    const upload = await put();
    expect(await rpc('upload-update', { uploadId: upload.uploadId, offset: 262144, encryptedSession: cipher() })).toMatchObject({ offset: 262144 });
    for (const offset of [0, upload.size + 1, 262144.5, '300000', null]) {
      await expect(rpc('upload-update', { uploadId: upload.uploadId, offset })).rejects.toThrow();
    }
    await expect(rpc('upload-update', { uploadId: upload.uploadId, status: 'complete' })).rejects.toThrow('VALIDATION');
    await expect(rpc('upload-update', { uploadId: upload.uploadId, encryptedSession: { access_token: 'plaintext' } })).rejects.toThrow('VALIDATION');
    expect(await rpc('upload-update', { uploadId: upload.uploadId, status: 'expired' })).toMatchObject({ status: 'expired', offset: 262144 });
  });

  it('requires verified metadata match and rejects completion without checksum', async () => {
    const upload = await put();
    for (const patch of [{ driveFileId: 'wrong-file' }, { mimeType: 'video/webm' }, { size: upload.size - 1 }, { size: '1048576' }]) {
      await expect(complete(upload, patch)).rejects.toThrow('ASSET_MISMATCH');
    }
    await expect(complete(upload, { checksum: null })).rejects.toThrow();
    await expect(complete(upload, { checksum: 'not-md5' })).rejects.toThrow();
    expect(await rpc('get-asset', { assetId: upload.uploadId })).toBeNull();
    expect(await rpc('upload-get', { uploadId: upload.uploadId })).toMatchObject({ status: 'uploading' });
  });

  it('completes once with private activity/revision and allows team reads without exposing ciphertext', async () => {
    const upload = await put({ encryptedSession: cipher() });
    const before = (await db.query<{ revision: number }>('select revision from public.pieces where id=$1', [P])).rows[0].revision;
    const activityBefore = (await db.query<{ n: number }>('select count(*)::int as n from public.activity where piece_id=$1', [P])).rows[0].n;
    const asset = await complete(upload);
    expect(await complete(upload)).toEqual(asset);
    expect(asset).toMatchObject({ id: upload.uploadId, pieceId: P, clientId: id(2), workspaceId: W, name: 'toma.mp4', mimeType: 'video/mp4', size: upload.size, driveFileId: upload.driveFileId, checksum: 'a'.repeat(32), driveRevisionId: 'revision-one', folderId: upload.folderId, generation });
    expect(await rpc('get-asset', { assetId: asset.id }, U2)).toEqual(asset);
    expect(await rpc<Asset[]>('list-assets', { pieceId: P }, U2)).toContainEqual(asset);
    expect(JSON.stringify(await rpc('list-assets'))).not.toMatch(/encrypted|ciphertext|fingerprint|userId|Session/);
    expect(await rpc('get-asset', { assetId: asset.id }, id(0, 4), W2)).toBeNull();
    expect((await db.query<{ revision: number }>('select revision from public.pieces where id=$1', [P])).rows[0].revision).toBe(before + 1);
    const activities = (await db.query<{ visibility: string; text: string }>('select visibility,text from public.activity where piece_id=$1', [P])).rows;
    expect(activities).toHaveLength(activityBefore + 1);
    expect(activities.at(-1)).toMatchObject({ visibility: 'internal', text: 'Material agregado: toma.mp4.' });
    expect(await rpc('upload-get', { uploadId: upload.uploadId })).toMatchObject({ status: 'complete', encryptedSession: null, offset: upload.size });
    await expect(complete(upload, { checksum: 'b'.repeat(32) })).rejects.toThrow('ASSET_MISMATCH');
    await expect(complete(upload, { driveRevisionId: 'revision-two' })).rejects.toThrow('ASSET_MISMATCH');
    expect(await rpc('upload-update', { uploadId: upload.uploadId, offset: 0, encryptedSession: cipher() })).toMatchObject({ status: 'complete', encryptedSession: null });
  });

  it('does not change client review semantics or expose assets via ordinary workspace/customer projections', async () => {
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${id(0, 2)}'`);
    try {
      expect((await db.query<{ name: string }>('select name from public.assets where piece_id=$1', [P])).rows.map(row => row.name)).not.toContain('toma.mp4');
      expect((await db.query<{ text: string }>("select text from public.activity where piece_id=$1 and text like 'Material agregado:%'", [P])).rows).toEqual([]);
    } finally { await db.exec('reset role; reset request.jwt.claim.sub'); }
  });

  it('rejects all upload continuation/completion after piece archival and hides existing assets', async () => {
    const upload = await put({ pieceId: id(4, 2) });
    const finished = await put({ pieceId: id(4, 2) });
    await complete(finished);
    await db.query('update public.pieces set archived=true where id=$1', [upload.pieceId]);
    for (const action of ['upload-get', 'upload-update', 'upload-complete']) await expect(rpc(action, { uploadId: upload.uploadId })).rejects.toThrow('NOT_FOUND');
    await expect(complete(finished)).rejects.toThrow('NOT_FOUND');
    expect(await rpc('get-asset', { assetId: finished.uploadId })).toBeNull();
    await expect(rpc('list-assets', { pieceId: upload.pieceId })).rejects.toThrow('NOT_FOUND');
    expect((await rpc<Asset[]>('list-assets')).some(asset => asset.id === finished.uploadId)).toBe(false);
  });

  it('hides files and disallows upload after client archival or uploader membership deactivation', async () => {
    const upload = await put({ pieceId: id(4, 3) });
    await complete(upload);
    await db.query('update public.clients set archived_at=now() where id=$1', [id(2, 2)]);
    expect(await rpc('get-asset', { assetId: upload.uploadId })).toBeNull();
    await expect(rpc('upload-get', { uploadId: upload.uploadId })).rejects.toThrow('NOT_FOUND');
    await expect(put({ pieceId: id(4, 3) })).rejects.toThrow('NOT_FOUND');
    await db.query('update public.members set active=false where workspace_id=$1 and user_id=$2', [W, U2]);
    await expect(rpc('list-assets', {}, U2)).rejects.toMatchObject({ code: '42501' });
  });
});
