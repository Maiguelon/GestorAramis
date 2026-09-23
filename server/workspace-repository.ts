import { ServiceError, type Fetcher } from './errors';

const DOMAIN_ERRORS: Record<string, number> = {
  VALIDATION: 400, NOT_FOUND: 404, CONFLICT: 409, ARCHIVED: 409, MONTH_EXISTS: 409,
  EMPTY_PLAN: 400, INVALID_TRANSITION: 409, APPROVAL_REQUIRED: 409, PUBLISHED_IMMUTABLE: 409,
  DELIVERY_LOCKED: 409, DELIVERY_FILES_REQUIRED: 400, CHANGE_REASON_REQUIRED: 400, IDEMPOTENCY_CONFLICT: 409, FEATURE_UNAVAILABLE: 501,
};

/** RPC itself checks active membership, validates the command, locks and commits atomically. */
export async function callWorkspaceRpc(
  config: { url: string; publishableKey: string; workspaceId: string },
  authorization: string,
  command: { command: Record<string, unknown>; requestId: string } | undefined,
  fetcher: Fetcher = fetch,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(new URL(`/rest/v1/rpc/${command ? 'aramis_command' : 'aramis_workspace'}`, config.url), {
      method: 'POST', redirect: 'manual',
      headers: { Authorization: authorization, apikey: config.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_workspace_id: config.workspaceId,
        ...(command ? { p_command: command.command, p_request_id: command.requestId } : {}) }),
    });
  } catch { throw new ServiceError('service_unavailable', 503); }
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    if (data.code === '42501') throw new ServiceError('forbidden', 403);
    if (response.status === 401) throw new ServiceError('unauthenticated', 401);
    if (data.code === 'P0001' && typeof data.message === 'string' && Object.hasOwn(DOMAIN_ERRORS, data.message)) {
      throw new ServiceError(data.message, DOMAIN_ERRORS[data.message]);
    }
    // Schema diagnostics, table names, request data and provider messages never reach the browser.
    throw new ServiceError('service_unavailable', 503);
  }
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (!data.state || typeof data.state !== 'object' || typeof data.memberId !== 'string'
    || data.workspaceId !== config.workspaceId || typeof data.workspaceName !== 'string'
    || (command && typeof data.entityId !== 'string')) throw new ServiceError('service_unavailable', 503);
  return data;
}
