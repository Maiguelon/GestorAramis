import { FORMAT_LABELS } from '../contracts/domain';
import { ServiceError, type Fetcher } from './errors';

const month = /^20\d{2}-(?:0[1-9]|1[0-2])$/;
const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const filters = new Set(['from', 'through', 'clientId', 'format']);
type Config = { url: string; publishableKey: string; workspaceId: string };

async function statisticsRpc(config: Config, authorization: string, name: string, args: Record<string, unknown>, fetcher: Fetcher) {
  let response: Response;
  try {
    response = await fetcher(new URL('/rest/v1/rpc/' + name, config.url), {
      method: 'POST', redirect: 'manual',
      headers: { Authorization: authorization, apikey: config.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_workspace_id: config.workspaceId, ...args }),
    });
  } catch { throw new ServiceError('service_unavailable', 503); }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) throw new ServiceError('unauthenticated', 401);
    if (response.status === 403 || data?.code === '42501') throw new ServiceError('forbidden', 403);
    if (data?.code === 'P0001' && data.message === 'VALIDATION') throw new ServiceError('VALIDATION', 400);
    throw new ServiceError('service_unavailable', 503);
  }
  return data;
}

export async function statisticsSnapshots(config: Config, authorization: string, request: Request, fetcher: Fetcher) {
  const query = new URL(request.url).searchParams;
  let value: string | null = null;
  if (request.method === 'GET') {
    if ([...query.keys()].some(key => key !== 'month') || query.getAll('month').length > 1) throw new ServiceError('VALIDATION', 400);
    value = query.get('month');
  } else {
    if (query.size || !request.headers.get('Content-Type')?.startsWith('application/json')) throw new ServiceError('VALIDATION', 400);
    const reader = request.body?.getReader();
    if (!reader) throw new ServiceError('VALIDATION', 400);
    let text = '';
    try {
      for (;;) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        if (text.length + chunk.length > 128) { await reader.cancel(); throw new ServiceError('VALIDATION', 400); }
        text += new TextDecoder().decode(chunk);
      }
      const body = JSON.parse(text);
      if (!body || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.month !== 'string') throw new Error();
      value = body.month;
    } catch { throw new ServiceError('VALIDATION', 400); }
  }
  if ((value !== null && !month.test(value)) || (request.method === 'POST' && value === null)) throw new ServiceError('VALIDATION', 400);
  const data = await statisticsRpc(config, authorization,
    request.method === 'POST' ? 'aramis_statistics_snapshot' : 'aramis_statistics_snapshots',
    { p_month: value ? value + '-01' : null }, fetcher);
  if (value && data === null) throw new ServiceError('not_found', 404);
  if (value ? !data?.report || data.month !== value : !Array.isArray(data)) throw new ServiceError('service_unavailable', 503);
  return data;
}

function monthIndex(value: string) {
  return Number(value.slice(0, 4)) * 12 + Number(value.slice(5));
}

export async function readStatistics(
  config: { url: string; publishableKey: string; workspaceId: string },
  authorization: string,
  query: URLSearchParams,
  fetcher: Fetcher,
): Promise<unknown> {
  for (const key of query.keys()) {
    if (!filters.has(key) || query.getAll(key).length !== 1) throw new ServiceError('VALIDATION', 400);
  }
  const from = query.get('from');
  const through = query.get('through');
  const clientId = query.get('clientId');
  const format = query.get('format');
  if (!from || !through || !month.test(from) || !month.test(through) || from > through
    || monthIndex(through) - monthIndex(from) >= 24
    || (clientId !== null && !uuid.test(clientId))
    || (format !== null && !Object.hasOwn(FORMAT_LABELS, format))) {
    throw new ServiceError('VALIDATION', 400);
  }

  const data = await statisticsRpc(config, authorization, 'aramis_statistics', {
        p_from: from + '-01',
        p_through: through + '-01',
        p_client_id: clientId,
        p_format: format,
      }, fetcher);
  if (!data || typeof data.approved !== 'number' || !Array.isArray(data.byClient)) {
    throw new ServiceError('service_unavailable', 503);
  }
  return data;
}
