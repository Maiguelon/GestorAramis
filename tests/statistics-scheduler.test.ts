import { describe, expect, it, vi } from 'vitest';
import { closeStatisticsMonth } from '../server/statistics-scheduler';
import worker from '../server/notification-worker';

const env = { SUPABASE_URL:'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY:'sb_secret_FIXTURE',
  ARAMIS_WORKSPACE_ID:'00000000-0000-4000-8000-000000000001', NOTIFICATION_EMAIL_ENABLED:'false' };

describe('monthly statistics scheduler', () => {
  it('executes independently of email settings with a server-only key and a fixed workspace', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(null));
    await closeStatisticsMonth(env,fetcher);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url,init] = fetcher.mock.calls[0];
    expect(String(url)).toBe('https://fixture.supabase.co/rest/v1/rpc/aramis_statistics_close_month');
    expect(init?.redirect).toBe('manual');
    expect(new Headers(init?.headers).get('apikey')).toBe(env.SUPABASE_SERVICE_ROLE_KEY);
    expect(JSON.parse(String(init?.body))).toEqual({p_workspace_id:env.ARAMIS_WORKSPACE_ID});
  });
  it('allows migration staging but surfaces real outages without exposing upstream messages', async () => {
    await expect(closeStatisticsMonth(env, async () => Response.json({code:'PGRST202'}, {status:404}))).resolves.toBeUndefined();
    await expect(closeStatisticsMonth(env, async () => new Response('private failure', {status:500}))).rejects.toThrow('statistics_capture_failed');
  });
  it('registers both scheduled jobs so a failed cut never cancels notification dispatch', async () => {
    const fetcher=vi.fn<typeof fetch>(async () => new Response('private failure',{status:500}));
    vi.stubGlobal('fetch',fetcher);
    const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});
    try {
      const tasks:Promise<unknown>[]=[];
      worker.scheduled(null,env,{waitUntil:task=>{tasks.push(task);}});
      expect(tasks).toHaveLength(2);
      await Promise.all(tasks);
      expect(fetcher).toHaveBeenCalledOnce();
      expect(warning).toHaveBeenCalledWith('statistics_capture_failed');
    } finally { warning.mockRestore(); vi.unstubAllGlobals(); }
  });
});
