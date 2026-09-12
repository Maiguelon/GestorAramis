// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import worker from '../server/index';
import { authorizeShare, hashShareToken, issueShareToken, requireStaff, verifySupabaseUser, type ShareRecord, type ShareRepository } from '../server/authz';
import { checkDriveUpload, copyDriveSnapshot, initiateDriveUpload, streamDriveAsset, type DriveFile, type StoredAsset, type UploadExpectation } from '../server/drive';
import { decryptRefreshToken, DRIVE_SCOPE, encryptRefreshToken, exchangeGoogleCode, prepareGoogleOAuth, refreshGoogleTokens } from '../server/google-oauth';

describe('production worker fails closed', () => {
  it('health reveals no credentials and makes no integration claim', async () => {
    const response = await worker.fetch(new Request('https://app.test/api/health'), { GOOGLE_CLIENT_SECRET: 'NEVER_PRINT' });
    expect(await response.json()).toEqual({ service: 'gestor-aramis', status: 'ok', businessApi: 'team-core', configured: false });
  });
  it('missing config cannot silently run the demo', async () => {
    const response = await worker.fetch(new Request('https://app.test/api/pieces'), {});
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'configuration_missing', code: 'configuration_missing' });
  });
  it('configured Drive requires an authenticated caller', async () => {
    const response = await worker.fetch(new Request('https://app.test/api/drive/uploads', { method: 'POST' }), {
      SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test', SUPABASE_SERVICE_ROLE_KEY: 'secret',
      ARAMIS_WORKSPACE_ID: '00000000-0000-4000-8000-000000000001',
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthenticated', code: 'unauthenticated' });
  });
});

describe('capabilities and staff identity', () => {
  const record: ShareRecord = { id: 's', workspaceId: 'w', clientId: 'c', scope: 'review', targetId: 'r', revokedAt: null, expiresAt: null };
  const repository = (overrides: Partial<ShareRecord> = {}, accessible = true): ShareRepository => ({
    findByHash: vi.fn(async () => ({ ...record, ...overrides })), targetIsAccessible: vi.fn(async () => accessible),
  });
  it('generates 256-bit capabilities and queries only their hash', async () => {
    const first = await issueShareToken();
    const second = await issueShareToken();
    expect(first.token).toHaveLength(43);
    expect(first.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.token).not.toBe(second.token);
    expect(await hashShareToken(first.token)).toBe(first.tokenHash);
    const repo = repository();
    await expect(authorizeShare(first.token, { scope: 'review', targetId: 'r' }, repo)).resolves.toMatchObject({ access: 'share' });
    expect(repo.findByHash).toHaveBeenCalledWith(first.tokenHash);
  });
  it.each([
    [{ revokedAt: '2026-09-06T00:00:00Z' }, true],
    [{ scope: 'calendar' }, true],
    [{ targetId: 'another-review' }, true],
    [{ expiresAt: '2000-01-01T00:00:00Z' }, true],
    [{ expiresAt: 'invalid' }, true],
    [{}, false],
  ] as [Partial<ShareRecord>, boolean][])('rejects revoked, wrong scope/target, expired and inaccessible links: %j', async (override, accessible) => {
    await expect(authorizeShare('a'.repeat(43), { scope: 'review', targetId: 'r' }, repository(override, accessible))).rejects.toMatchObject({ code: 'invalid_access', status: 403 });
  });
  it('rejects malformed and nonexistent capabilities', async () => {
    const repo = repository();
    await expect(authorizeShare('short', { scope: 'review', targetId: 'r' }, repo)).rejects.toMatchObject({ status: 403 });
    expect(repo.findByHash).not.toHaveBeenCalled();
    await expect(authorizeShare('a'.repeat(43), { scope: 'review', targetId: 'r' }, { ...repo, findByHash: async () => null })).rejects.toMatchObject({ status: 403 });
  });
  it('verifies a user against Auth and then requires server-side active staff membership', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ id: 'verified-user', email: 'not-needed@example.test' }));
    const user = await verifySupabaseUser(new Request('https://app.test', { headers: { Authorization: 'Bearer valid.jwt.signature' } }), { url: 'https://auth.test', publishableKey: 'pk' }, fetcher);
    expect(user).toEqual({ id: 'verified-user' });
    expect(fetcher.mock.calls[0][0].toString()).toBe('https://auth.test/auth/v1/user');
    await expect(requireStaff(user, 'w', { findActiveStaff: async () => null })).rejects.toMatchObject({ status: 403 });
    await expect(requireStaff(user, 'w', { findActiveStaff: async () => ({ memberId: 'm' }) })).resolves.toMatchObject({ access: 'staff', memberId: 'm' });
  });
  it('does not accept a spoofed JWT or an upstream authentication failure', async () => {
    const fetcher = vi.fn(async () => new Response('upstream secret detail', { status: 401 }));
    await expect(verifySupabaseUser(new Request('https://app.test', { headers: { Authorization: 'Bearer forged.jwt.token' } }), { url: 'https://auth.test', publishableKey: 'pk' }, fetcher)).rejects.toMatchObject({ code: 'unauthenticated' });
  });
});

describe('Google OAuth server primitives', () => {
  const config = { clientId: 'test-id', clientSecret: 'test-secret', redirectUri: 'https://app.test/api/google/callback' };
  it('requests only drive.file offline with PKCE and server-bound state', async () => {
    const result = await prepareGoogleOAuth(config, { userId: 'u', workspaceId: 'w' }, 0);
    const url = new URL(result.url);
    expect(url.searchParams.get('scope')).toBe(DRIVE_SCOPE);
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(result.record.stateHash).toBe(await hashShareToken(url.searchParams.get('state')!));
    expect(result.url).not.toContain('test-secret');
    expect(result.url).not.toContain(result.record.verifier);
    expect(result.record.expiresAt).toBe(600_000);
  });
  it('rejects wrong owner, expired and replayed state before contacting Google', async () => {
    const prepared = await prepareGoogleOAuth(config, { userId: 'u', workspaceId: 'w' }, 0);
    const state = new URL(prepared.url).searchParams.get('state')!;
    const fetcher = vi.fn();
    await expect(exchangeGoogleCode(config, { code: 'c', state, userId: 'other', workspaceId: 'w' }, { consume: async () => prepared.record }, fetcher, 1)).rejects.toMatchObject({ code: 'invalid_oauth_state' });
    await expect(exchangeGoogleCode(config, { code: 'c', state, userId: 'u', workspaceId: 'w' }, { consume: async () => prepared.record }, fetcher, 600_001)).rejects.toMatchObject({ code: 'invalid_oauth_state' });
    await expect(exchangeGoogleCode(config, { code: 'c', state, userId: 'u', workspaceId: 'w' }, { consume: async () => null }, fetcher, 1)).rejects.toMatchObject({ code: 'invalid_oauth_state' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('retains the existing refresh token when Google returns only a new access token', async () => {
    const fetcher = vi.fn(async () => Response.json({ access_token: 'new-access', token_type: 'Bearer', expires_in: 3600 }));
    const result = await refreshGoogleTokens(config, 'existing-refresh', fetcher, 0);
    expect(result).toEqual({ accessToken: 'new-access', refreshToken: 'existing-refresh', expiresAt: 3_600_000 });
  });
  it('exchanges one bound authorization code with its PKCE verifier only server-side', async () => {
    const prepared = await prepareGoogleOAuth(config, { userId: 'u', workspaceId: 'w' }, 0);
    const state = new URL(prepared.url).searchParams.get('state')!;
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ access_token: 'access', refresh_token: 'refresh', token_type: 'Bearer', expires_in: 3600, scope: DRIVE_SCOPE }));
    const store = { consume: vi.fn(async () => prepared.record) };
    const result = await exchangeGoogleCode(config, { code: 'authorization-code', state, userId: 'u', workspaceId: 'w' }, store, fetcher, 1);
    expect(result.refreshToken).toBe('refresh');
    expect(store.consume).toHaveBeenCalledWith(prepared.record.stateHash);
    const body = fetcher.mock.calls[0][1]!.body as URLSearchParams;
    expect(body.get('code_verifier')).toBe(prepared.record.verifier);
    expect(body.get('client_secret')).toBe(config.clientSecret);
  });
  it('redacts upstream failures and rejects missing Drive scope', async () => {
    await expect(refreshGoogleTokens(config, 'refresh', async () => new Response('secret refresh error payload', { status: 400 }))).rejects.toMatchObject({ message: 'google_reconnect_required' });
    await expect(refreshGoogleTokens(config, 'refresh', async () => Response.json({ access_token: 'access', token_type: 'Bearer', expires_in: 3600, scope: 'openid' }))).rejects.toMatchObject({ code: 'google_scope_missing' });
  });
  it('encrypts stored refresh credentials with workspace binding', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const encrypted = await encryptRefreshToken('never-plain-in-database', key, 'w');
    expect(JSON.stringify(encrypted)).not.toContain('never-plain');
    await expect(decryptRefreshToken(encrypted, key, 'w')).resolves.toBe('never-plain-in-database');
    await expect(decryptRefreshToken(encrypted, key, 'other')).rejects.toMatchObject({ code: 'google_reconnect_required' });
  });
});

describe('Drive uploads and private video streams', () => {
  const expected: UploadExpectation = { uploadId: 'upload', workspaceId: 'workspace', clientId: 'client', requestId: 'request', parentFolderId: 'parent', name: 'video.mp4', mimeType: 'video/mp4', size: 100 };
  const sessionUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=test-session';
  const file: DriveFile = { id: 'file', name: 'video.mp4', mimeType: 'video/mp4', size: '100', parents: ['parent'], appProperties: { uploadId: 'upload', workspaceId: 'workspace', clientId: 'client', requestId: 'request' }, trashed: false, md5Checksum: 'a'.repeat(32) };
  const asset: StoredAsset = { driveFileId: 'file', name: 'video.mp4', mimeType: 'video/mp4', size: 100, workspaceId: 'workspace', clientId: 'client', checksum: 'a'.repeat(32) };
  it('copies a specifically selected original to a distinct, tagged review snapshot', async () => {
    const destination = { workspaceId: 'workspace', clientId: 'client', pieceId: 'piece', parentFolderId: 'parent', name: 'Review v1.mp4' };
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ ...file, name: destination.name, appProperties: { workspaceId: 'workspace', clientId: 'client', pieceId: 'piece' } }));
    await expect(copyDriveSnapshot('access', 'selected-original', destination, fetcher)).resolves.toEqual({ ...asset, name: destination.name });
    expect(fetcher.mock.calls[0][0].toString()).toContain('/selected-original/copy?');
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string).parents).toEqual(['parent']);
  });
  it('initiates with expected size and binds upload metadata to the authorized request', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 200, headers: { Location: sessionUrl } }));
    await expect(initiateDriveUpload('access', expected, fetcher)).resolves.toEqual({ sessionUrl, expected });
    const init = fetcher.mock.calls[0][1]!;
    expect(new Headers(init.headers).get('X-Upload-Content-Length')).toBe('100');
    expect(new Headers(init.headers).has('Origin')).toBe(false);
    expect(JSON.parse(init.body as string).appProperties.requestId).toBe('request');
    expect(init.redirect).toBe('manual');
  });
  it.each(['https://gestor-aramis.pages.dev', 'https://app.test:8443', 'http://localhost:5174', 'http://127.0.0.1:5174', 'http://[::1]:5174'])(
    'binds browser CORS to the trusted application origin during initiation: %s', async browserOrigin => {
      const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { headers: { Location: sessionUrl } }));
      await expect(initiateDriveUpload('access', expected, fetcher, browserOrigin)).resolves.toEqual({ sessionUrl, expected });
      expect(new Headers(fetcher.mock.calls[0][1]!.headers).get('Origin')).toBe(browserOrigin);
      expect(fetcher.mock.calls[0][0].toString()).toMatch(/^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\?/);
    },
  );
  it.each(['', 'null', '*', 'file:///tmp', 'http://app.test', 'http://localhost.evil.test', 'https://app.test/path', 'https://app.test/', 'https://app.test?query=1', 'https://app.test#fragment', 'https://name:password@app.test', 'https://app.test\r\nX-Fake: yes'])(
    'rejects an invalid upload origin before contacting Google: %s', async browserOrigin => {
      const fetcher = vi.fn();
      await expect(initiateDriveUpload('access', expected, fetcher, browserOrigin)).rejects.toMatchObject({ code: 'invalid_upload_origin', status: 400 });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it('refuses off-origin resumable locations before leaking tokens', async () => {
    const fetcher = vi.fn(async () => new Response(null, { headers: { Location: 'https://evil.test/upload?upload_id=steal' } }));
    await expect(initiateDriveUpload('access', expected, fetcher)).rejects.toMatchObject({ code: 'invalid_upload_session' });
    const noFetch = vi.fn();
    await expect(checkDriveUpload('access', { sessionUrl: 'https://evil.test/?upload_id=x', expected }, noFetch)).rejects.toMatchObject({ code: 'invalid_upload_session' });
    expect(noFetch).not.toHaveBeenCalled();
  });
  it('treats interrupted uploads as pending without inventing success', async () => {
    await expect(checkDriveUpload('access', { sessionUrl, expected }, async () => new Response(null, { status: 308, headers: { Range: 'bytes=0-49' } }))).resolves.toEqual({ status: 'pending', receivedBytes: 50 });
  });
  it('verifies server-reported completion metadata and checksum', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ id: 'file' })).mockResolvedValueOnce(Response.json(file));
    await expect(checkDriveUpload('access', { sessionUrl, expected }, fetcher)).resolves.toEqual({ status: 'complete', file });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([
    { size: '99' }, { trashed: true }, { appProperties: { ...file.appProperties, clientId: 'other' } },
    { parents: ['another-folder'] }, { mimeType: 'text/html' }, { md5Checksum: undefined },
  ])('rejects incorrect completion: %j', async (override) => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ id: 'file' })).mockResolvedValueOnce(Response.json({ ...file, ...override }));
    await expect(checkDriveUpload('access', { sessionUrl, expected }, fetcher)).rejects.toMatchObject({ code: 'upload_verification_failed' });
  });
  it('streams the original response body, forwards Range, and strips upstream headers', async () => {
    const upstream = new Response(new Uint8Array([1, 2, 3]), { status: 206, headers: {
      'Content-Range': 'bytes 0-2/100', 'Content-Length': '3', 'Set-Cookie': 'secret', Location: 'private-google-url',
    } });
    const body = upstream.body;
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(file)).mockResolvedValueOnce(upstream);
    const response = await streamDriveAsset('secret-access', asset, 'bytes=0-2', fetcher);
    expect(response.body).toBe(body);
    expect(new Headers(fetcher.mock.calls[1][1].headers).get('Range')).toBe('bytes=0-2');
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 0-2/100');
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(response.headers.get('Location')).toBeNull();
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.arrayBuffer()).toEqual(new Uint8Array([1, 2, 3]).buffer);
  });
  it('rejects changed snapshots before reading media', async () => {
    const fetcher = vi.fn(async () => Response.json({ ...file, md5Checksum: 'b'.repeat(32) }));
    await expect(streamDriveAsset('access', asset, null, fetcher)).rejects.toMatchObject({ code: 'asset_changed_or_inaccessible' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects multiple or malformed ranges before contacting Google', async () => {
    const fetcher = vi.fn();
    await expect(streamDriveAsset('access', asset, 'bytes=0-1,4-5', fetcher)).rejects.toMatchObject({ status: 416 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('preserves an unsatisfiable range without exposing a Google error body', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(file)).mockResolvedValueOnce(new Response('upstream secret', { status: 416, headers: { 'Content-Range': 'bytes */100' } }));
    const response = await streamDriveAsset('access', asset, 'bytes=900-', fetcher);
    expect(response.status).toBe(416);
    expect(await response.text()).toBe('');
  });
  it('does not download the full object when a requested range is ignored', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(file)).mockResolvedValueOnce(new Response('full file'));
    await expect(streamDriveAsset('access', asset, 'bytes=0-2', fetcher)).rejects.toMatchObject({ code: 'drive_range_unavailable' });
  });
  it('sanitizes Google errors', async () => {
    await expect(streamDriveAsset('access', asset, null, async () => new Response('private upstream detail', { status: 403 }))).rejects.toMatchObject({ message: 'drive_access_denied' });
  });
});

describe('PostgreSQL schema and actual row-level policies (PGlite)', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    for (const path of ['supabase/tests/bootstrap.sql', 'supabase/migrations/202609060001_initial.sql', 'supabase/tests/fixtures.sql']) {
      await db.exec(await readFile(path, 'utf8'));
    }
  }, 30_000);
  afterAll(async () => { await db?.close(); });
  const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  async function asUser<T>(n: number, sql: string) {
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${uid(n)}';`);
    try { return (await db.query<T>(sql)).rows; }
    finally { await db.exec('reset role; reset request.jwt.claim.sub;'); }
  }
  it('client A sees only its visible, unarchived piece and review', async () => {
    expect(await asUser(2, 'select title from public.pieces')).toEqual([{ title: 'A visible' }]);
    expect(await asUser(2, 'select caption from public.reviews')).toEqual([{ caption: 'Texto público' }]);
    expect(await asUser(2, 'select name from public.clients')).toEqual([{ name: 'Cliente A' }]);
  });
  it('client B in the same workspace cannot read client A', async () => {
    expect(await asUser(3, 'select title from public.pieces')).toEqual([{ title: 'B visible' }]);
    expect(await asUser(3, 'select * from public.pieces where id = \'40000000-0000-4000-8000-000000000001\'')).toEqual([]);
  });
  it('staff can coordinate its workspace but not a different workspace', async () => {
    expect(await asUser(1, 'select title from public.pieces order by title')).toHaveLength(4);
    expect(await asUser(4, 'select title from public.pieces')).toEqual([{ title: 'C visible' }]);
    expect(await asUser(1, 'select * from public.piece_internal_notes')).toHaveLength(1);
  });
  it('former staff has no workspace access', async () => {
    expect(await asUser(5, 'select * from public.pieces')).toEqual([]);
    expect(await asUser(5, 'select * from public.clients')).toEqual([]);
  });
  it('notes, private activity and Drive identifiers never reach client SQL reads', async () => {
    expect(await asUser(2, 'select * from public.piece_internal_notes')).toEqual([]);
    expect(await asUser(2, 'select text from public.activity')).toEqual([{ text: 'Visible' }]);
    expect(await asUser(2, 'select * from public.assets')).toEqual([]);
    const columns = await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema='public' and table_name='pieces'");
    expect(columns.rows.map((column) => column.column_name)).not.toContain('internal_note');
  });
  it('keeps editable copy private even when its calendar piece is client-visible', async () => {
    expect(await asUser(2, 'select * from public.piece_drafts')).toEqual([]);
    expect(await asUser(3, 'select * from public.piece_drafts')).toEqual([]);
    expect(await asUser(4, 'select * from public.piece_drafts')).toEqual([]);
    expect(await asUser(5, 'select * from public.piece_drafts')).toEqual([]);
    expect(await asUser(1, 'select caption from public.piece_drafts')).toEqual([{ caption: 'BORRADOR PRIVADO sin aprobar' }]);
    const visiblePieces = await asUser(2, 'select * from public.pieces');
    expect(visiblePieces).toHaveLength(1);
    expect(JSON.stringify(visiblePieces)).not.toContain('BORRADOR PRIVADO');
    expect(visiblePieces[0]).not.toHaveProperty('caption');
    expect(await asUser(2, 'select caption from public.reviews')).toEqual([{ caption: 'Texto público' }]);
    await expect(asUser(1, "update public.piece_drafts set caption = 'bypass'")).rejects.toMatchObject({ code: '42501' });
  });
  it('anonymous direct database access is denied', async () => {
    await db.exec('set role anon;');
    try { await expect(db.query('select * from public.pieces')).rejects.toMatchObject({ code: '42501' }); }
    finally { await db.exec('reset role;'); }
  });
  it('even staff cannot retrieve share hashes or mutate business data directly', async () => {
    await expect(asUser(1, 'select * from public.shares')).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(1, "update public.pieces set title = 'bypass'")).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(2, "update public.members set role = 'staff', client_id = null")).rejects.toMatchObject({ code: '42501' });
  });
  it('cross-client references and client owners fail even for privileged inserts', async () => {
    await expect(db.query(`insert into public.reviews(workspace_id,client_id,piece_id,version,status) values
      ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001',2,'superseded')`)).rejects.toMatchObject({ code: '23503' });
    await expect(db.query(`insert into public.pieces(workspace_id,client_id,title,owner_member_id) values
      ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Bad owner','30000000-0000-4000-8000-000000000002')`)).rejects.toMatchObject({ code: '23503' });
  });
  it('sealed review copy and verified Drive snapshots cannot be overwritten', async () => {
    await expect(db.query("update public.reviews set caption='changed' where id='50000000-0000-4000-8000-000000000001'")).rejects.toThrow('sealed_review_immutable');
    await expect(db.query("update public.assets set checksum=repeat('b',32) where id='60000000-0000-4000-8000-000000000001'")).rejects.toThrow('verified_asset_immutable');
    await expect(db.query(`insert into public.review_assets(workspace_id,client_id,piece_id,review_id,asset_id,position) values
      ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',0)`)).rejects.toThrow('sealed_review_assets_immutable');
  });
  it('keeps the rejected revision history while allowing exactly one new pending revision', async () => {
    await db.exec('begin;');
    try {
      await db.query("update public.reviews set status='changes' where id='50000000-0000-4000-8000-000000000001'");
      await db.query(`insert into public.reviews(workspace_id,client_id,piece_id,version,caption,sealed_at) values
        ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',2,'Corregido',now())`);
      const versions = await db.query<{ version: number; status: string }>("select version,status from public.reviews where piece_id='40000000-0000-4000-8000-000000000001' order by version");
      expect(versions.rows).toEqual([{ version: 1, status: 'changes' }, { version: 2, status: 'pending' }]);
      expect(await asUser(2, 'select version,caption from public.reviews')).toEqual([{ version: 2, caption: 'Corregido' }]);
      expect(await asUser(1, "select version,status from public.reviews where piece_id='40000000-0000-4000-8000-000000000001' order by version")).toEqual(versions.rows);
      await expect(db.query(`insert into public.reviews(workspace_id,client_id,piece_id,version) values
        ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',3)`)).rejects.toMatchObject({ code: '23505' });
    } finally { await db.exec('rollback;'); }
  });
  it('does not expose superseded reviews or related responses while copy is being revised', async () => {
    await db.exec('begin;');
    try {
      await db.query(`insert into public.responses(workspace_id,client_id,review_id,kind,comment,author_name,source,idempotency_key) values
        ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','comment','Consulta de versión anterior','Cliente','link',gen_random_uuid())`);
      expect(await asUser(2, 'select comment from public.responses')).toEqual([{ comment: 'Consulta de versión anterior' }]);
      await db.query("update public.reviews set status='superseded' where id='50000000-0000-4000-8000-000000000001'");
      expect(await asUser(2, 'select * from public.reviews')).toEqual([]);
      expect(await asUser(2, 'select * from public.responses')).toEqual([]);
      expect(await asUser(1, "select caption from public.reviews where id='50000000-0000-4000-8000-000000000001'")).toEqual([{ caption: 'Texto público' }]);
      await db.query(`insert into public.reviews(workspace_id,client_id,piece_id,version,caption) values
        ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',2,'Todavía sin sellar')`);
      expect(await asUser(2, 'select * from public.reviews')).toEqual([]);
    } finally { await db.exec('rollback;'); }
  });
  it('malformed hashes and empty change requests fail validation', async () => {
    await expect(db.query(`insert into public.shares(workspace_id,client_id,scope,token_hash) values
      ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','calendar','plain-token')`)).rejects.toMatchObject({ code: '23514' });
    await expect(db.query(`insert into public.responses(workspace_id,client_id,review_id,kind,author_name,source,idempotency_key) values
      ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','changes','Test','link',gen_random_uuid())`)).rejects.toMatchObject({ code: '23514' });
  });
});
