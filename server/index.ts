import { verifySupabaseUser } from './authz';
import { ServiceError, type Fetcher } from './errors';
import { callWorkspaceRpc } from './workspace-repository';
import { googleCallbackRedirect, handleDriveRequest } from './drive-service';

export interface WorkerEnv {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  ARAMIS_WORKSPACE_ID?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  DRIVE_ENCRYPTION_KEY?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_COMMAND_BYTES = 256 * 1024;
const HEADERS = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
const COMMANDS = new Set(['create-client', 'update-client', 'generate-month', 'create-piece', 'update-piece']);

function configuration(env: WorkerEnv) {
  let url: URL;
  try { url = new URL(env.SUPABASE_URL ?? ''); }
  catch { throw new ServiceError('configuration_missing', 503); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || !env.SUPABASE_PUBLISHABLE_KEY || !UUID.test(env.ARAMIS_WORKSPACE_ID ?? '')) {
    throw new ServiceError('configuration_missing', 503);
  }
  return { url: url.origin, publishableKey: env.SUPABASE_PUBLISHABLE_KEY, workspaceId: env.ARAMIS_WORKSPACE_ID! };
}

/** Limit the streamed body too: Content-Length can be absent or dishonest. */
async function commandBody(request: Request): Promise<{ command: Record<string, unknown>; requestId: string }> {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new ServiceError('unsupported_media_type', 415);
  }
  if (Number(request.headers.get('Content-Length')) > MAX_COMMAND_BYTES) throw new ServiceError('payload_too_large', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ServiceError('VALIDATION', 400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > MAX_COMMAND_BYTES) {
        await reader.cancel();
        throw new ServiceError('payload_too_large', 413);
      }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new ServiceError('VALIDATION', 400); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ServiceError('VALIDATION', 400);
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => key !== 'command' && key !== 'requestId')
    || typeof body.requestId !== 'string' || !UUID.test(body.requestId)
    || !body.command || typeof body.command !== 'object' || Array.isArray(body.command)) throw new ServiceError('VALIDATION', 400);
  const command = body.command as Record<string, unknown>;
  if (typeof command.type !== 'string') throw new ServiceError('VALIDATION', 400);
  if (!COMMANDS.has(command.type)) throw new ServiceError('FEATURE_UNAVAILABLE', 501);
  return { command, requestId: body.requestId };
}

/** Same-origin API. Workspace commands use the user JWT; Drive's private bridge rechecks staff. */
export async function handleRequest(request: Request, env: WorkerEnv, fetcher: Fetcher = fetch): Promise<Response> {
  try {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) throw new ServiceError('not_found', 404);
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) throw new ServiceError('forbidden_origin', 403);
    if (url.pathname === '/api/health' && request.method === 'GET') {
      let configured = false;
      try { configuration(env); configured = true; } catch { /* configuration only, not a live DB probe */ }
      return Response.json({ service: 'gestor-aramis', status: 'ok', businessApi: 'team-core', configured }, { headers: HEADERS });
    }
    const config = configuration(env);
    if (url.pathname === '/api/google/callback') return googleCallbackRedirect(request);
    if (url.pathname.startsWith('/api/drive/')) return await handleDriveRequest(request, env, config, fetcher);
    if (!['/api/workspace', '/api/commands'].includes(url.pathname)) throw new ServiceError('feature_unavailable', 501);
    if ((url.pathname === '/api/workspace' && request.method !== 'GET')
      || (url.pathname === '/api/commands' && request.method !== 'POST')) throw new ServiceError('method_not_allowed', 405);
    const boundedFetch: Fetcher = (input, init) => fetcher(input, { ...init, signal: AbortSignal.timeout(30_000) });
    await verifySupabaseUser(request, config, boundedFetch);
    const authorization = request.headers.get('Authorization')!;
    const command = url.pathname === '/api/commands' ? await commandBody(request) : undefined;
    const result = await callWorkspaceRpc(config, authorization, command, boundedFetch);
    return Response.json(result, { headers: HEADERS });
  } catch (error) {
    const safe = error instanceof ServiceError ? error : new ServiceError('internal_error', 500);
    return Response.json({ error: safe.code, code: safe.code }, { status: safe.status, headers: HEADERS });
  }
}

export default { fetch: (request: Request, env: WorkerEnv) => handleRequest(request, env) };
