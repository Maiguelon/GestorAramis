/** Never include upstream response bodies, URLs, credentials or user tokens in errors. */
export class ServiceError extends Error {
  constructor(public readonly code: string, public readonly status = 400) {
    super(code);
    this.name = 'ServiceError';
  }
}

export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function jsonError(error: unknown): Response {
  const safe = error instanceof ServiceError ? error : new ServiceError('internal_error', 500);
  return Response.json({ error: safe.code }, {
    status: safe.status,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' },
  });
}
