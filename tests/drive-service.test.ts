// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleRequest, type WorkerEnv } from '../server/index';
import { decryptRefreshToken, encryptRefreshToken, DRIVE_SCOPE } from '../server/google-oauth';
import type { Fetcher } from '../server/errors';

// HTTP contract doubles only. PostgreSQL policy tests live in drive-sql; no live services here.
const W = '10000000-0000-4000-8000-000000000001';
const U = '20000000-0000-4000-8000-000000000001';
const U2 = '20000000-0000-4000-8000-000000000002';
const P = '30000000-0000-4000-8000-000000000001';
const C = '40000000-0000-4000-8000-000000000001';
const A = '50000000-0000-4000-8000-000000000001';
const G = '60000000-0000-4000-8000-000000000001';
const TOKEN = 'staff.jwt.one', TOKEN2 = 'staff.jwt.two';
const ACCESS = 'PRIVATE_GOOGLE_ACCESS', REFRESH = 'PRIVATE_GOOGLE_REFRESH';
const env: WorkerEnv = {
  SUPABASE_URL: 'https://project.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'publishable-test',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_PRIVATE_SERVER_KEY', ARAMIS_WORKSPACE_ID: W,
  GOOGLE_CLIENT_ID: 'test.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'PRIVATE_CLIENT_SECRET',
  GOOGLE_REDIRECT_URI: 'https://app.test/api/google/callback', DRIVE_ENCRYPTION_KEY: btoa('k'.repeat(32)),
};
const piece = { id: P, clientId: C, title: 'Reel de prueba', planMonth: '2026-09', plannedDate: null, createdAt: '2026-09-01T00:00:00Z', archived: false };
const workspace = { state: { schemaVersion: 1, pieces: [piece], clients: [{ id: C, name: 'Cliente de prueba' }] }, memberId: 'member', workspaceId: W, workspaceName: 'Aramis' };
const uploadInput = { uploadId: A, pieceId: P, name: 'toma.mp4', mimeType: 'video/mp4', size: 6, fingerprint: 'a'.repeat(64) };
const upload = { ...uploadInput, clientId: C, driveFileId: 'reserved-file', folderId: 'material-folder', generation: G, encryptedSession: null, status: 'uploading' };
const asset = { id: A, pieceId: P, clientId: C, workspaceId: W, name: 'toma.mp4', mimeType: 'video/mp4', size: 6, driveFileId: 'reserved-file', checksum: 'b'.repeat(32), generation: G };
const driveFile = { id: asset.driveFileId, name: asset.name, mimeType: asset.mimeType, size: '6', md5Checksum: asset.checksum, trashed: false, parents: ['material-folder'], appProperties: { workspaceId: W, clientId: C, requestId: P, uploadId: A } };
const sessionUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=PRIVATE_UPLOAD_CAPABILITY';
type Payload = Record<string, unknown>;
type RpcCall = { action: string; payload: Payload; userId: string; init: RequestInit };
type Envelope = { iv: number[]; ciphertext: number[] };
async function encryptionKey() { return crypto.subtle.importKey('raw', new TextEncoder().encode('k'.repeat(32)), 'AES-GCM', false, ['encrypt', 'decrypt']); }
async function sealed(value: unknown, purpose: string) { return encryptRefreshToken(JSON.stringify(value), await encryptionKey(), W + ':' + purpose); }
async function connection(expiresAt = Date.now() + 3_600_000) {
  return { generation: G, encryptedTokens: await sealed({ accessToken: ACCESS, refreshToken: REFRESH, expiresAt }, 'tokens'), accountEmail: 'team@example.com', accountPermissionId: 'google-account', rootFolderId: null, updatedAt: '2026-09-10T00:00:00Z' };
}
const request = (path: string, init: RequestInit = {}, token: string | null = TOKEN) => {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return new Request('https://app.test' + path, { ...init, headers });
};
const post = (path: string, value: unknown = {}, token: string | null = TOKEN) => request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }, token);

function harness(rpc: (call: RpcCall) => unknown | Promise<unknown>, google?: Fetcher) {
  const rpcCalls: RpcCall[] = [];
  const googleCalls: Array<{ url: string; init: RequestInit }> = [];
  const otherCalls: Array<{ url: string; init: RequestInit }> = [];
  let revoked = false;
  const fetcher: Fetcher = vi.fn(async (input, supplied = {}) => {
    const url = new URL(String(input)), init = supplied;
    if (url.origin === env.SUPABASE_URL) {
      if (url.pathname === '/auth/v1/user') {
        otherCalls.push({ url: url.toString(), init });
        const auth = new Headers(init.headers).get('Authorization');
        return revoked || ![`Bearer ${TOKEN}`, `Bearer ${TOKEN2}`].includes(auth ?? '') ? Response.json({ message: 'PRIVATE_AUTH_DETAILS' }, { status: 401 }) : Response.json({ id: auth === `Bearer ${TOKEN2}` ? U2 : U });
      }
      if (url.pathname === '/rest/v1/rpc/aramis_workspace') { otherCalls.push({ url: url.toString(), init }); return Response.json(workspace); }
      if (url.pathname === '/rest/v1/rpc/aramis_drive') {
        const data = JSON.parse(String(init.body)) as { p_action: string; p_payload: Payload; p_user_id: string; p_workspace_id: string };
        const call = { action: data.p_action, payload: data.p_payload, userId: data.p_user_id, init };
        rpcCalls.push(call);
        if (data.p_workspace_id !== W) return Response.json({ code: '42501' }, { status: 403 });
        const result = await rpc(call);
        return result instanceof Response ? result : Response.json(result);
      }
    }
    googleCalls.push({ url: url.toString(), init });
    if (!google) throw new Error('Unexpected Google call');
    return google(input, init);
  });
  return { fetcher, rpcCalls, googleCalls, otherCalls, revoke: () => { revoked = true; } };
}
afterEach(() => { vi.useRealTimers(); });

describe('Drive HTTP authorization and OAuth', () => {
  it('rejects missing authentication and another Origin before any privileged call', async () => {
    const h = harness(() => null);
    expect((await handleRequest(post('/api/drive/connect', {}, null), env, h.fetcher)).status).toBe(401);
    expect((await handleRequest(request('/api/drive/status', { headers: { Origin: 'https://other.test' } }), env, h.fetcher)).status).toBe(403);
    expect(h.fetcher).not.toHaveBeenCalled();
  });

  it('keeps the service key on the private RPC and returns only public connection status', async () => {
    const conn = await connection();
    const h = harness(() => conn);
    const response = await handleRequest(request('/api/drive/status'), env, h.fetcher);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(JSON.parse(body)).toMatchObject({ configured: true, connected: true, accountEmail: 'team@example.com' });
    for (const secret of [ACCESS, REFRESH, env.SUPABASE_SERVICE_ROLE_KEY!, env.GOOGLE_CLIENT_SECRET!, 'ciphertext', 'encryptedTokens']) expect(body).not.toContain(secret);
    expect(h.rpcCalls[0].userId).toBe(U);
    expect(new Headers(h.rpcCalls[0].init.headers).get('apikey')).toBe(env.SUPABASE_SERVICE_ROLE_KEY);
    for (const call of h.otherCalls) {
      expect(new Headers(call.init.headers).get('apikey')).toBe(env.SUPABASE_PUBLISHABLE_KEY);
      expect(new Headers(call.init.headers).get('Authorization')).toBe(`Bearer ${TOKEN}`);
    }
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('persists encrypted user-bound state, exchanges it once, and never returns Google tokens', async () => {
    const states = new Map<string, { userId: string; encryptedPayload: unknown }>();
    let saved: Payload | null = null;
    const h = harness(call => {
      if (call.action === 'state-put') { states.set(String(call.payload.stateHash), { userId: call.userId, encryptedPayload: call.payload.encryptedPayload }); return { stored: true }; }
      if (call.action === 'state-take') {
        const item = states.get(String(call.payload.stateHash));
        if (!item || item.userId !== call.userId) return null;
        states.delete(String(call.payload.stateHash)); return item;
      }
      if (call.action === 'connection-get') return saved;
      if (call.action === 'connection-save') { saved = call.payload; return saved; }
      throw new Error('Unexpected RPC');
    }, async input => {
      const url = new URL(String(input));
      if (url.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: ACCESS, refresh_token: REFRESH, token_type: 'Bearer', expires_in: 3600, scope: DRIVE_SCOPE });
      if (url.pathname === '/drive/v3/about') return Response.json({ user: { emailAddress: 'team@example.com', permissionId: 'google-account' } });
      throw new Error('Unexpected Google mutation');
    });
    const started = await handleRequest(post('/api/drive/connect'), env, h.fetcher);
    const { url: authorizationUrl } = await started.json() as { url: string };
    const oauth = new URL(authorizationUrl), state = oauth.searchParams.get('state')!;
    expect(oauth.origin).toBe('https://accounts.google.com');
    expect(oauth.searchParams.get('scope')).toBe(DRIVE_SCOPE);
    expect(oauth.searchParams.get('code_challenge_method')).toBe('S256');
    const stored = h.rpcCalls.find(call => call.action === 'state-put')!.payload;
    expect(JSON.stringify(stored)).not.toContain(state);
    expect(JSON.stringify(stored)).not.toContain('verifier');

    const wrongUser = await handleRequest(post('/api/drive/callback', { code: 'one-use-code', state }, TOKEN2), env, h.fetcher);
    expect(wrongUser.status).toBe(403);
    expect(states.size).toBe(1);
    expect(h.googleCalls).toHaveLength(0);
    const finished = await handleRequest(post('/api/drive/callback', { code: 'one-use-code', state }), env, h.fetcher);
    expect(finished.status).toBe(200);
    expect(await finished.json()).toEqual({ connected: true, accountEmail: 'team@example.com' });
    expect(JSON.stringify(saved)).not.toContain(ACCESS);
    expect(JSON.stringify(saved)).not.toContain(REFRESH);
    const tokenCall = h.googleCalls.find(call => new URL(call.url).hostname === 'oauth2.googleapis.com')!;
    const fields = new URLSearchParams(String(tokenCall.init.body));
    expect(fields.get('code_verifier')).toHaveLength(43);
    expect(fields.get('client_secret')).toBe(env.GOOGLE_CLIENT_SECRET);
    expect(tokenCall.init.redirect).toBe('manual');
    expect((await handleRequest(post('/api/drive/callback', { code: 'one-use-code', state }), env, h.fetcher)).status).toBe(403);
    expect(h.googleCalls.filter(call => new URL(call.url).hostname === 'oauth2.googleapis.com')).toHaveLength(1);
  });

  it('returns OAuth navigation data only in a same-origin fragment', async () => {
    const h = harness(() => null);
    const response = await handleRequest(request('/api/google/callback?code=short-code&state=state&access_token=DO_NOT_FORWARD&redirect=https://evil.test', {}, null), env, h.fetcher);
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/#drive-callback=code=short-code&state=state');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(h.fetcher).not.toHaveBeenCalled();
  });

  it('blocks the privileged RPC if staff membership is denied and redacts database details', async () => {
    const h = harness(() => Response.json({ code: '42501', message: 'PRIVATE_TABLE_DETAILS' }, { status: 403 }));
    const result = await handleRequest(request('/api/drive/status'), env, h.fetcher);
    expect(result.status).toBe(403);
    expect(await result.json()).toEqual({ error: 'forbidden', code: 'forbidden' });
    expect(h.googleCalls).toHaveLength(0);
  });
});

describe('private media cookie and streaming', () => {
  it('issues an encrypted secure cookie and revalidates Auth and membership for every Range read', async () => {
    const conn = await connection();
    const h = harness(call => call.action === 'connection-get' ? conn : call.action === 'get-asset' ? asset : null, async (input, init) => {
      const url = new URL(String(input));
      if (!url.searchParams.has('alt')) return Response.json(driveFile);
      expect(new Headers(init?.headers).get('Range')).toBe('bytes=1-3');
      return new Response(new Uint8Array([1, 2, 3]), { status: 206, headers: { 'Content-Length': '3', 'Content-Range': 'bytes 1-3/6', 'Set-Cookie': 'PRIVATE_PROVIDER_COOKIE' } });
    });
    const issued = await handleRequest(post('/api/drive/media-session'), env, h.fetcher);
    const setCookie = issued.headers.get('Set-Cookie')!;
    expect(setCookie).toContain('__Host-aramis-media=');
    for (const flag of ['Path=/', 'HttpOnly', 'SameSite=Strict', 'Secure', 'Max-Age=600']) expect(setCookie).toContain(flag);
    expect(setCookie).not.toContain(TOKEN);
    const cookie = setCookie.split(';')[0];
    const response = await handleRequest(request(`/api/drive/assets/${A}/content`, { headers: { Cookie: cookie, Range: 'bytes=1-3' } }, null), env, h.fetcher);
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 1-3/6');
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(h.otherCalls.filter(call => call.url.endsWith('/auth/v1/user'))).toHaveLength(2);
    expect(h.otherCalls.filter(call => call.url.endsWith('/aramis_workspace'))).toHaveLength(2);
    const before = h.googleCalls.length;
    h.revoke();
    expect((await handleRequest(request(`/api/drive/assets/${A}/content`, { headers: { Cookie: cookie, Range: 'bytes=1-3' } }, null), env, h.fetcher)).status).toBe(401);
    expect(h.googleCalls).toHaveLength(before);
  });

  it('rejects expired, tampered and wrong-purpose cookies before provider access', async () => {
    const h = harness(() => null);
    const encode = (value: Envelope) => '__Host-aramis-media=' + btoa(String.fromCharCode(...value.iv)) + '.' + btoa(String.fromCharCode(...value.ciphertext));
    const expired = await sealed({ authorization: `Bearer ${TOKEN}`, expiresAt: Date.now() - 1 }, 'media');
    const wrongPurpose = await sealed({ authorization: `Bearer ${TOKEN}`, expiresAt: Date.now() + 600_000 }, 'tokens');
    for (const cookie of [encode(expired), encode(wrongPurpose), '__Host-aramis-media=invalid.invalid']) {
      expect((await handleRequest(request(`/api/drive/assets/${A}/content`, { headers: { Cookie: cookie } }, null), env, h.fetcher)).status).toBe(401);
    }
    expect(h.fetcher).not.toHaveBeenCalled();
  });

  it('does not apply the metadata timeout to a media response after headers arrive', async () => {
    const conn = await connection();
    vi.useFakeTimers();
    let mediaSignal: AbortSignal | undefined;
    const h = harness(call => call.action === 'connection-get' ? conn : asset, async (input, init) => {
      if (!new URL(String(input)).searchParams.has('alt')) return Response.json(driveFile);
      mediaSignal = init?.signal ?? undefined;
      return new Response(new Uint8Array(6), { headers: { 'Content-Length': '6' } });
    });
    const response = await handleRequest(request(`/api/drive/assets/${A}/content`), env, h.fetcher);
    expect(response.status).toBe(200);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(mediaSignal?.aborted).toBe(false);
    expect((await response.arrayBuffer()).byteLength).toBe(6);
  });

  it('refreshes expired tokens using only allowed connection fields', async () => {
    const conn = await connection(Date.now() - 1000);
    let saved: Payload | undefined;
    const h = harness(call => {
      if (call.action === 'connection-get') return conn;
      if (call.action === 'connection-save') {
        const allowed = ['generation', 'encryptedTokens', 'accountEmail', 'accountPermissionId', 'rootFolderId', 'expectedGeneration'];
        if (Object.keys(call.payload).some(key => !allowed.includes(key))) return Response.json({ code: 'P0001', message: 'VALIDATION' }, { status: 400 });
        saved = call.payload; return call.payload;
      }
      return asset;
    }, async input => new URL(String(input)).hostname === 'oauth2.googleapis.com'
      ? Response.json({ access_token: 'REFRESHED_ACCESS', token_type: 'Bearer', expires_in: 3600, scope: DRIVE_SCOPE })
      : new URL(String(input)).searchParams.has('alt') ? new Response(new Uint8Array(6), { headers: { 'Content-Length': '6' } }) : Response.json(driveFile));
    const response = await handleRequest(request(`/api/drive/assets/${A}/content`), env, h.fetcher);
    expect(response.status).toBe(200);
    expect(saved).toBeDefined();
    expect(saved).not.toHaveProperty('updatedAt');
    const tokens = JSON.parse(await decryptRefreshToken(saved!.encryptedTokens as Envelope, await encryptionKey(), W + ':tokens'));
    expect(tokens.refreshToken).toBe(REFRESH);
    expect(tokens.accessToken).toBe('REFRESHED_ACCESS');
  });

  it('never serves an asset from a different connection namespace', async () => {
    const conn = await connection();
    const h = harness(call => call.action === 'connection-get' ? conn : { ...asset, generation: 'different' });
    expect((await handleRequest(request(`/api/drive/assets/${A}/content`), env, h.fetcher)).status).toBe(409);
    expect(h.googleCalls).toHaveLength(0);
  });
});

describe('internal upload HTTP verification', () => {
  it('initializes browser uploads with the application origin so Google can expose completion', async () => {
    const conn = await connection();
    const h = harness(call => call.action === 'connection-get' ? conn
      : call.action === 'upload-update' ? { ...upload, encryptedSession: call.payload.encryptedSession } : upload,
      async () => new Response(null, { headers: { Location: sessionUrl } }));
    const result = await handleRequest(post('/api/drive/uploads', uploadInput), env, h.fetcher);
    expect(result.status).toBe(200);
    expect(h.googleCalls).toHaveLength(1);
    expect(new Headers(h.googleCalls[0].init.headers).get('Origin')).toBe('https://app.test');
    expect(await result.json()).toEqual({ session: { uploadId: A, sessionUrl, expectedSize: 6, mimeType: 'video/mp4' } });
  });

  it.each([{ parentFolderId: 'attacker-folder' }, { driveFileId: 'attacker-file' }, { userId: U2 }, { workspaceId: 'other' }])('rejects browser-supplied storage/identity bindings: %j', async forged => {
    const h = harness(() => null);
    expect((await handleRequest(post('/api/drive/uploads', { ...uploadInput, ...forged }), env, h.fetcher)).status).toBe(400);
    expect(h.rpcCalls).toHaveLength(0);
    expect(h.googleCalls).toHaveLength(0);
  });

  it('returns the persisted upload capability on retry without creating another Google session', async () => {
    const conn = await connection();
    const pending = { ...upload, encryptedSession: await sealed({ sessionUrl }, 'upload:' + A) };
    const h = harness(call => call.action === 'connection-get' ? conn : pending);
    const result = await handleRequest(post('/api/drive/uploads', uploadInput), env, h.fetcher);
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ session: { uploadId: A, sessionUrl, expectedSize: 6, mimeType: 'video/mp4' } });
    expect(h.googleCalls).toHaveLength(0);
    const changed = await handleRequest(post('/api/drive/uploads', { ...uploadInput, fingerprint: 'c'.repeat(64) }), env, h.fetcher);
    expect(changed.status).toBe(409);
    expect(h.googleCalls).toHaveLength(0);
  });

  it('verifies Google completion before attaching and returns metadata without storage identifiers', async () => {
    const conn = await connection();
    const pending = { ...upload, encryptedSession: await sealed({ sessionUrl }, 'upload:' + A) };
    const h = harness(call => call.action === 'connection-get' ? conn : call.action === 'upload-complete' ? asset : pending,
      async input => new URL(String(input)).pathname.startsWith('/upload/') ? Response.json({ id: asset.driveFileId }) : Response.json(driveFile));
    const result = await handleRequest(post(`/api/drive/uploads/${A}/complete`), env, h.fetcher);
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ asset: { id: A, name: asset.name, mimeType: asset.mimeType, size: asset.size, source: 'drive' } });
    const attached = h.rpcCalls.find(call => call.action === 'upload-complete')!;
    expect(attached.payload).toEqual({ uploadId: A, asset: { driveFileId: asset.driveFileId, checksum: asset.checksum, mimeType: asset.mimeType, size: asset.size } });
    expect(h.googleCalls).toHaveLength(2);
  });

  it.each([
    { status: 308, headers: { Range: 'bytes=0-2' }, expectedCode: 'upload_incomplete' },
    { status: 404, headers: {}, expectedCode: 'drive_file_missing' },
  ])('never attaches an unfinished or expired upload (%s)', async scenario => {
    const conn = await connection();
    const pending = { ...upload, encryptedSession: await sealed({ sessionUrl }, 'upload:' + A) };
    const h = harness(call => call.action === 'connection-get' ? conn : pending,
      async () => new Response(null, { status: scenario.status, headers: scenario.headers as Record<string,string> }));
    const result = await handleRequest(post(`/api/drive/uploads/${A}/complete`), env, h.fetcher);
    expect((await result.json() as { code: string }).code).toBe(scenario.expectedCode);
    expect(h.rpcCalls.some(call => call.action === 'upload-complete')).toBe(false);
  });

  it('rejects a completed Google file whose piece binding changed', async () => {
    const conn = await connection();
    const pending = { ...upload, encryptedSession: await sealed({ sessionUrl }, 'upload:' + A) };
    const h = harness(call => call.action === 'connection-get' ? conn : pending, async input => new URL(String(input)).pathname.startsWith('/upload/')
      ? Response.json({ id: asset.driveFileId }) : Response.json({ ...driveFile, appProperties: { ...driveFile.appProperties, requestId: 'other-piece' } }));
    const result = await handleRequest(post(`/api/drive/uploads/${A}/complete`), env, h.fetcher);
    expect(result.status).toBe(409);
    expect(h.rpcCalls.some(call => call.action === 'upload-complete')).toBe(false);
  });

  it('replays completed uploads without contacting Google or attaching twice', async () => {
    const h = harness(call => call.action === 'get-asset' ? asset : { ...upload, status: 'complete' });
    for (let repeat = 0; repeat < 2; repeat++) expect((await handleRequest(post(`/api/drive/uploads/${A}/complete`), env, h.fetcher)).status).toBe(200);
    expect(h.googleCalls).toHaveLength(0);
    expect(h.rpcCalls.some(call => call.action === 'upload-complete')).toBe(false);
  });
});
