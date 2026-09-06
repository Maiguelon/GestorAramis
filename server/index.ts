import { jsonError, ServiceError } from './errors';

export interface WorkerEnv {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
}

/** Deliberately fail-closed until auth repositories and transactional business routes are wired. */
export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/api/health' && request.method === 'GET') {
      return Response.json({ service: 'gestor-aramis', status: 'scaffold', businessApi: 'unavailable' }, {
        headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      });
    }
    if (!path.startsWith('/api/')) return jsonError(new ServiceError('not_found', 404));
    if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return jsonError(new ServiceError('configuration_missing', 503));
    }
    return jsonError(new ServiceError('feature_unavailable', 501));
  },
};
