import type { ShareScope } from '../contracts/domain';
import { ServiceError, type Fetcher } from './errors';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export async function hashShareToken(token: string): Promise<string> {
  if (!TOKEN_PATTERN.test(token)) throw new ServiceError('invalid_access', 403);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The raw capability is returned once; persist only tokenHash on the server. */
export async function issueShareToken(): Promise<{ token: string; tokenHash: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { token, tokenHash: await hashShareToken(token) };
}

export interface ShareRecord {
  id: string;
  workspaceId: string;
  clientId: string;
  scope: ShareScope;
  targetId: string;
  revokedAt: string | null;
  expiresAt: string | null;
}

export interface ShareRepository {
  /** Query server-only storage by SHA-256 digest. Never retrieve all tokens. */
  findByHash(hash: string): Promise<ShareRecord | null>;
  /** Verify target->client->workspace ownership and visibility using trusted DB records. */
  targetIsAccessible(record: ShareRecord): Promise<boolean>;
}

export interface AuthorizedShare extends ShareRecord { access: 'share' }

/** Recheck on EVERY operation, including upload resume/completion and video range reads. */
export async function authorizeShare(
  token: string,
  required: { scope: ShareScope; targetId: string },
  repository: ShareRepository,
  now = Date.now(),
): Promise<AuthorizedShare> {
  const hash = await hashShareToken(token);
  const record = await repository.findByHash(hash);
  if (!record || record.revokedAt !== null || record.scope !== required.scope || record.targetId !== required.targetId) {
    throw new ServiceError('invalid_access', 403);
  }
  if (record.expiresAt !== null) {
    const expiration = Date.parse(record.expiresAt);
    if (!Number.isFinite(expiration) || expiration <= now) throw new ServiceError('invalid_access', 403);
  }
  if (!await repository.targetIsAccessible(record)) throw new ServiceError('invalid_access', 403);
  return { ...record, access: 'share' };
}

export interface SupabaseAuthConfig { url: string; publishableKey: string }
export interface VerifiedUser { id: string }

/** Verifies with Supabase Auth. Decoding a JWT locally without verifying is never authorization. */
export async function verifySupabaseUser(
  request: Request,
  config: SupabaseAuthConfig,
  fetcher: Fetcher = fetch,
): Promise<VerifiedUser> {
  const authorization = request.headers.get('Authorization');
  if (!authorization || !/^Bearer [A-Za-z0-9._~-]+$/.test(authorization)) throw new ServiceError('unauthenticated', 401);
  const url = new URL(config.url);
  if (url.protocol !== 'https:' || url.username || url.password || !config.publishableKey) {
    throw new ServiceError('configuration_missing', 503);
  }
  let response: Response;
  try {
    response = await fetcher(new URL('/auth/v1/user', url), {
      headers: { Authorization: authorization, apikey: config.publishableKey }, redirect: 'error',
    });
  } catch { throw new ServiceError('authentication_unavailable', 503); }
  if (!response.ok) throw new ServiceError(response.status >= 500 ? 'authentication_unavailable' : 'unauthenticated', response.status >= 500 ? 503 : 401);
  const body: unknown = await response.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('id' in body) || typeof body.id !== 'string' || !body.id) {
    throw new ServiceError('unauthenticated', 401);
  }
  return { id: body.id };
}

export interface MembershipRepository {
  /** Server-side query using verified user ID, never a role from the browser. */
  findActiveStaff(userId: string, workspaceId: string): Promise<{ memberId: string } | null>;
}

export async function requireStaff(user: VerifiedUser, workspaceId: string, repository: MembershipRepository) {
  const member = await repository.findActiveStaff(user.id, workspaceId);
  if (!member) throw new ServiceError('forbidden', 403);
  return { access: 'staff' as const, userId: user.id, workspaceId, memberId: member.memberId };
}
