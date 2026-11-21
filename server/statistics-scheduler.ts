import type { NotificationEnv } from './notifications';
import type { Fetcher } from './errors';

/** The database owns calendar boundaries, capture serialization and retry identity. */
export async function closeStatisticsMonth(env: NotificationEnv, fetcher: Fetcher = fetch) {
  const secret = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !env.ARAMIS_WORKSPACE_ID || !env.SUPABASE_URL) return;
  const url = new URL(env.SUPABASE_URL);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('statistics_configuration_missing');
  const response = await fetcher(new URL('/rest/v1/rpc/aramis_statistics_close_month', url), {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(25_000),
    headers: { apikey: secret, 'Content-Type': 'application/json', ...(secret.startsWith('eyJ') ? { Authorization: `Bearer ${secret}` } : {}) },
    body: JSON.stringify({ p_workspace_id: env.ARAMIS_WORKSPACE_ID }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    // Safe staged rollout: Pages/cron can precede the new database migration.
    if (response.status === 404 && error?.code === 'PGRST202') return;
    throw new Error('statistics_capture_failed');
  }
  await response.body?.cancel();
}
