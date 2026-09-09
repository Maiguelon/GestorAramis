import { hashShareToken, issueShareToken } from './authz';
import { ServiceError, type Fetcher } from './errors';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export interface GoogleConfig { clientId: string; clientSecret: string; redirectUri: string }
export interface OAuthState {
  stateHash: string;
  verifier: string;
  userId: string;
  workspaceId: string;
  expiresAt: number;
}
export interface OAuthStateStore {
  /** Atomic read-and-delete; a callback can consume a state only once. */
  consume(stateHash: string): Promise<OAuthState | null>;
}
export interface GoogleTokens { accessToken: string; refreshToken: string; expiresAt: number }

function validateConfig(config: GoogleConfig): void {
  let redirect: URL;
  try { redirect = new URL(config.redirectUri); } catch { throw new ServiceError('configuration_missing', 503); }
  const loopback = redirect.hostname === 'localhost' || redirect.hostname === '127.0.0.1';
  if (!config.clientId || !config.clientSecret || redirect.username || redirect.password ||
    (redirect.protocol !== 'https:' && !(loopback && redirect.protocol === 'http:'))) {
    throw new ServiceError('configuration_missing', 503);
  }
}

/** Call only AFTER staff authentication. Persist the returned record server-side before redirect. */
export async function prepareGoogleOAuth(
  config: GoogleConfig,
  staff: { userId: string; workspaceId: string },
  now = Date.now(),
): Promise<{ url: string; record: OAuthState }> {
  validateConfig(config);
  const state = await issueShareToken();
  const verifier = (await issueShareToken()).token;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code',
    scope: DRIVE_SCOPE, access_type: 'offline', prompt: 'consent',
    state: state.token, code_challenge: challenge, code_challenge_method: 'S256',
  }).toString();
  return { url: url.toString(), record: { stateHash: state.tokenHash, verifier, ...staff, expiresAt: now + 10 * 60_000 } };
}

async function tokenRequest(
  config: GoogleConfig, fields: Record<string, string>, previousRefreshToken: string | undefined,
  fetcher: Fetcher, now: number,
): Promise<GoogleTokens> {
  validateConfig(config);
  let response: Response;
  try {
    response = await fetcher(TOKEN_URL, {
      method: 'POST', redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...fields }),
    });
  } catch { throw new ServiceError('google_unavailable', 502); }
  if (!response.ok) throw new ServiceError(response.status === 400 || response.status === 401 ? 'google_reconnect_required' : 'google_unavailable', 502);
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!data || typeof data.access_token !== 'string' || !data.access_token || data.token_type !== 'Bearer' ||
    typeof data.expires_in !== 'number' || !Number.isFinite(data.expires_in) || data.expires_in <= 0) {
    throw new ServiceError('invalid_google_response', 502);
  }
  if (typeof data.scope === 'string' && !data.scope.split(' ').includes(DRIVE_SCOPE)) {
    throw new ServiceError('google_scope_missing', 403);
  }
  const refreshToken = typeof data.refresh_token === 'string' && data.refresh_token ? data.refresh_token : previousRefreshToken;
  if (!refreshToken) throw new ServiceError('google_reconnect_required', 502);
  return { accessToken: data.access_token, refreshToken, expiresAt: now + data.expires_in * 1000 };
}

/** Call after re-verifying the callback's staff session. Tokens MUST NOT be sent to a browser. */
export async function exchangeGoogleCode(
  config: GoogleConfig,
  input: { code: string; state: string; userId: string; workspaceId: string },
  store: OAuthStateStore,
  fetcher: Fetcher = fetch,
  now = Date.now(),
): Promise<GoogleTokens> {
  const hash = await hashShareToken(input.state);
  const state = await store.consume(hash);
  if (!state || state.stateHash !== hash || state.userId !== input.userId || state.workspaceId !== input.workspaceId ||
    !Number.isFinite(state.expiresAt) || state.expiresAt <= now || !input.code || input.code.length > 4096) {
    throw new ServiceError('invalid_oauth_state', 403);
  }
  return tokenRequest(config, { grant_type: 'authorization_code', code: input.code, redirect_uri: config.redirectUri, code_verifier: state.verifier }, undefined, fetcher, now);
}

export async function refreshGoogleTokens(
  config: GoogleConfig, refreshToken: string, fetcher: Fetcher = fetch, now = Date.now(),
): Promise<GoogleTokens> {
  if (!refreshToken) throw new ServiceError('google_reconnect_required', 502);
  return tokenRequest(config, { grant_type: 'refresh_token', refresh_token: refreshToken }, refreshToken, fetcher, now);
}

/** AES-GCM secret storage primitive; keep the non-extractable key in the server environment. */
export async function encryptRefreshToken(token: string, key: CryptoKey, workspaceId: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(workspaceId) }, key, new TextEncoder().encode(token),
  );
  return { iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(ciphertext)) };
}

export async function decryptRefreshToken(
  value: { iv: number[]; ciphertext: number[] }, key: CryptoKey, workspaceId: string,
): Promise<string> {
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(value.iv), additionalData: new TextEncoder().encode(workspaceId) },
      key, new Uint8Array(value.ciphertext),
    );
    return new TextDecoder().decode(plaintext);
  } catch { throw new ServiceError('google_reconnect_required', 502); }
}
