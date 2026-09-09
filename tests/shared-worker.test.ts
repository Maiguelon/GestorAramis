// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { handleRequest, type WorkerEnv } from '../server/index';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const requestId = '00000000-0000-4000-8000-000000000002';
const env: WorkerEnv = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-test-key', ARAMIS_WORKSPACE_ID: workspaceId, SUPABASE_SERVICE_ROLE_KEY: 'NEVER_FORWARD' };
const snapshot = { state: { schemaVersion: 1 }, memberId: 'member', workspaceId, workspaceName: 'Aramis' };
const request = (path = '/api/workspace', init: RequestInit = {}) => new Request(`https://app.test${path}`, { ...init, headers: { Authorization: 'Bearer valid.jwt.token', ...init.headers } });
const post = (body: unknown, headers = {}) => request('/api/commands', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const transport = (rpc = () => Response.json(snapshot)) => vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => String(url).endsWith('/auth/v1/user') ? Response.json({ id: 'real-user' }) : rpc());

describe('shared team Worker API', () => {
  it('verifies identity then forwards the user JWT and a server-selected workspace, never service_role', async () => {
    const fetcher = transport();
    const response = await handleRequest(request(), env, fetcher);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(snapshot);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual(['https://project.supabase.co/auth/v1/user', 'https://project.supabase.co/rest/v1/rpc/aramis_workspace']);
    const init = fetcher.mock.calls[1][1]!;
    expect(init.headers).toEqual({ Authorization: 'Bearer valid.jwt.token', apikey: 'public-test-key', 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({ p_workspace_id: workspaceId });
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain('NEVER_FORWARD');
    expect(init.redirect).toBe('manual');
    expect(fetcher.mock.calls[0][1]?.redirect).toBe('manual');
  });
  it('forwards a command with its retry UUID unchanged', async () => {
    const command = { type: 'create-client', name: 'Prueba' };
    const fetcher = transport(() => Response.json({ ...snapshot, entityId: 'created' }));
    const response = await handleRequest(post({ command, requestId }), env, fetcher);
    expect(response.status).toBe(200);
    expect(JSON.parse(fetcher.mock.calls[1][1]!.body as string)).toEqual({ p_workspace_id: workspaceId, p_command: command, p_request_id: requestId });
  });
  it('does not contact RPC without a verified session', async () => {
    const fetcher = vi.fn(async () => new Response('sensitive provider error', { status: 401 }));
    const response = await handleRequest(request(), env, fetcher);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthenticated', code: 'unauthenticated' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects provider redirects without following them or forwarding credentials', async () => {
    const redirect = () => new Response(null, { status: 302, headers: { Location: 'https://other.test' } });
    const authRedirect = vi.fn(async () => redirect());
    expect((await handleRequest(request(), env, authRedirect)).status).toBe(503);
    expect(authRedirect).toHaveBeenCalledTimes(1);
    const rpcRedirect = transport(redirect);
    expect((await handleRequest(request(), env, rpcRedirect)).status).toBe(503);
    expect(rpcRedirect).toHaveBeenCalledTimes(2);
  });
  it.each([
    [{ code: '42501', message: 'private table names' }, 403, 'forbidden'],
    [{ code: 'P0001', message: 'CONFLICT' }, 409, 'CONFLICT'],
    [{ code: 'P0001', message: 'IDEMPOTENCY_CONFLICT' }, 409, 'IDEMPOTENCY_CONFLICT'],
    [{ code: 'P0001', message: 'VALIDATION' }, 400, 'VALIDATION'],
    [{ code: '23505', message: 'private query and row contents' }, 503, 'service_unavailable'],
  ])('returns only safe database errors: %j', async (error, status, code) => {
    const response = await handleRequest(request(), env, transport(() => Response.json(error, { status: 400 })));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: code, code });
  });
  it.each([
    {}, { requestId, command: [] }, { requestId: 'bad', command: { type: 'create-piece' } },
    { requestId, command: { type: 'create-client' }, workspaceId: 'attacker-choice' },
    { requestId, command: { type: 'create-client' }, actorId: 'another-member' },
  ])('rejects malformed envelopes and identity overrides: %j', async (body) => {
    const fetcher = transport();
    expect((await handleRequest(post(body), env, fetcher)).status).toBe(400);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('keeps Drive, public actions and review commands unavailable', async () => {
    const fetcher = transport();
    expect((await handleRequest(post({ requestId, command: { type: 'create-review' } }), env, fetcher)).status).toBe(501);
    expect((await handleRequest(request('/api/drive/upload'), env, fetcher)).status).toBe(501);
    expect((await handleRequest(request('/api/public/calendar'), env, fetcher)).status).toBe(501);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects cross-origin reads and writes, and wrong methods before contacting Supabase', async () => {
    const fetcher = transport();
    expect((await handleRequest(request('/api/workspace', { headers: { Origin: 'https://other.test' } }), env, fetcher)).status).toBe(403);
    expect((await handleRequest(post({}, { Origin: 'null' }), env, fetcher)).status).toBe(403);
    expect((await handleRequest(request('/api/workspace', { method: 'POST' }), env, fetcher)).status).toBe(405);
    expect((await handleRequest(request('/api/commands'), env, fetcher)).status).toBe(405);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('accepts the same origin and requires JSON with a bounded streamed body', async () => {
    const fetcher = transport();
    expect((await handleRequest(request('/api/workspace', { headers: { Origin: 'https://app.test' } }), env, fetcher)).status).toBe(200);
    expect((await handleRequest(post({}, { 'Content-Type': 'text/plain' }), env, fetcher)).status).toBe(415);
    expect((await handleRequest(post({ text: 'x'.repeat(256 * 1024) }), env, fetcher)).status).toBe(413);
    const malformed = request('/api/commands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    expect((await handleRequest(malformed, env, fetcher)).status).toBe(400);
  });
  it('treats network errors and malformed success as uncertain/unavailable', async () => {
    const failed = transport(() => { throw new Error('secret'); });
    expect((await handleRequest(request(), env, failed)).status).toBe(503);
    expect((await handleRequest(request(), env, transport(() => Response.json({ ...snapshot, workspaceId: 'wrong' })))).status).toBe(503);
  });
  it.each([
    { SUPABASE_URL: 'http://insecure.test' }, { SUPABASE_URL: 'https://user:pass@project.supabase.co' },
    { SUPABASE_URL: 'invalid' }, { ARAMIS_WORKSPACE_ID: '' }, { SUPABASE_PUBLISHABLE_KEY: '' },
  ])('fails closed on missing/unsafe configuration: %j', async (patch) => {
    const fetcher = transport();
    expect((await handleRequest(request(), { ...env, ...patch }, fetcher)).status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
