import type { NotificationBatch, NotificationEmail, NotificationItem, NotificationSettings } from '../contracts/notifications';
import { FORMAT_LABELS } from '../contracts/domain';
import { verifySupabaseUser } from './authz';
import { ServiceError, type Fetcher } from './errors';

export interface NotificationEnv {
  SUPABASE_URL?: string; SUPABASE_PUBLISHABLE_KEY?: string; SUPABASE_SERVICE_ROLE_KEY?: string;
  ARAMIS_WORKSPACE_ID?: string; RESEND_API_KEY?: string; NOTIFICATION_FROM?: string;
  NOTIFICATION_APP_URL?: string; NOTIFICATION_EMAIL_ENABLED?: string;
}
type Config = { url: string; publishableKey: string; workspaceId: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const HEADERS = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

function sendingConfiguration(env: NotificationEnv) {
  if (env.NOTIFICATION_EMAIL_ENABLED !== 'true') return null;
  let app: URL, db: URL;
  try { app = new URL(env.NOTIFICATION_APP_URL ?? ''); db = new URL(env.SUPABASE_URL ?? ''); }
  catch { throw new ServiceError('notification_configuration_missing', 503); }
  const from = env.NOTIFICATION_FROM ?? '';
  if (!env.RESEND_API_KEY || !env.SUPABASE_SERVICE_ROLE_KEY || !UUID.test(env.ARAMIS_WORKSPACE_ID ?? '')
    || !/^[^\s<>@\r\n]+@[^\s<>@\r\n]+\.[^\s<>@\r\n]+$/.test(from)
    || from.length > 254 || app.protocol !== 'https:' || app.username || app.password || app.search || app.hash || app.pathname !== '/'
    || db.protocol !== 'https:' || db.username || db.password || db.pathname !== '/' || db.search || db.hash) {
    throw new ServiceError('notification_configuration_missing', 503);
  }
  return { from: `Aramis <${from}>`, appUrl: app.origin, dbUrl: db.origin };
}

/** A digest includes task identification and explicit return reasons, never private notes or media. */
export function renderNotificationEmail(batch: Pick<NotificationBatch, 'recipient'|'audience'|'items'>, from: string, appUrl: string): NotificationEmail {
  if (!batch.items.length || batch.items.length > 200 || batch.items.some(i => !UUID.test(i.pieceId))) throw new ServiceError('invalid_notification_batch', 503);
  const stage = batch.audience === 'design' ? 'producción' : 'revisión';
  const subject = `Aramis · ${batch.items.length} ${batch.items.length === 1 ? 'pieza pendiente' : 'piezas pendientes'} de ${stage}`;
  const date = (value: string | null) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Intl.DateTimeFormat('es-AR', {day:'numeric',month:'long'}).format(new Date(value+'T12:00:00Z')) : 'Sin fecha prevista';
  const label = (item: NotificationItem) => item.kind === 'returned' ? 'Volvió a producción' : item.kind === 'review' ? 'Nueva entrega para revisar' : 'Para producción';
  const url = (id: string) => new URL('/?piece='+encodeURIComponent(id), appUrl).toString();
  const rows = batch.items.map(i => `<tr><td style="padding:18px 0;border-bottom:1px solid #e9ecf1"><p style="margin:0 0 6px;color:#667085;font-size:13px">${escape(i.client)} · ${escape(FORMAT_LABELS[i.format as keyof typeof FORMAT_LABELS] ?? i.format)}</p><strong>${escape(i.title)}</strong><p style="margin:7px 0">${escape(label(i))} · ${escape(date(i.plannedDate))}</p>${i.kind==='returned' && i.reason ? `<p style="padding:10px;background:#fff5e1">Cambios solicitados: ${escape(i.reason)}</p>` : ''}<a href="${escape(url(i.pieceId))}" style="color:#8b2634;font-weight:bold">Abrir pieza</a></td></tr>`).join('');
  return {
    from, to:[batch.recipient], subject,
    html:`<!doctype html><html lang="es"><body style="margin:0;background:#f6f8fa;font-family:Arial,sans-serif;color:#1b2a41"><main style="max-width:600px;margin:24px auto;padding:24px;background:white"><h1 style="font-size:24px;margin:0 0 12px">${escape(subject)}</h1><p>Estas piezas requieren tu intervención.</p><table role="presentation" style="width:100%;border-collapse:collapse">${rows}</table><p style="font-size:12px;color:#667085;margin-top:24px">Podés cambiar la frecuencia o pausar estos avisos en <a href="${escape(new URL('/?settings=notifications',appUrl).toString())}">Configuración del gestor</a>.</p></main></body></html>`,
    text:subject+'\n\n'+batch.items.map(i => `${i.client} · ${i.title}\n${label(i)} · ${date(i.plannedDate)}${i.kind==='returned'&&i.reason?'\nCambios solicitados: '+i.reason:''}\n${url(i.pieceId)}`).join('\n\n')+'\n\nConfigurá tus avisos: '+new URL('/?settings=notifications',appUrl).toString(),
  };
}

async function privateRpc(env: NotificationEnv, action: string, payload: Record<string, unknown>, fetcher: Fetcher) {
  const secret = env.SUPABASE_SERVICE_ROLE_KEY!;
  const response = await fetcher(new URL('/rest/v1/rpc/aramis_notification_dispatch', env.SUPABASE_URL), {
    method:'POST', redirect:'manual', signal:AbortSignal.timeout(25_000),
    headers:{apikey:secret,'Content-Type':'application/json',...(secret.startsWith('eyJ')?{Authorization:`Bearer ${secret}`}:{})},
    body:JSON.stringify({p_workspace_id:env.ARAMIS_WORKSPACE_ID,p_action:action,p_payload:payload}),
  });
  if (!response.ok) { await response.body?.cancel(); throw new ServiceError('notification_store_unavailable',503); }
  return response.json() as Promise<unknown>;
}

/** Cron and immediate wakeups share database leases. A successful API response means accepted, not delivered. */
export async function dispatchNotifications(env: NotificationEnv, fetcher: Fetcher = fetch) {
  const config = sendingConfiguration(env);
  if (!config) return { enabled:false, sent:0, failed:0 };
  let sent=0, failed=0;
  for (let i=0;i<5;i++) {
    const raw = await privateRpc(env,'claim',{},fetcher);
    if (raw === null) break;
    if (!isObject(raw) || typeof raw.id!=='string' || !UUID.test(raw.id) || typeof raw.lease!=='string' || !UUID.test(raw.lease)
      || typeof raw.recipient!=='string' || !['design','marketing'].includes(String(raw.audience)) || !Array.isArray(raw.items)) throw new ServiceError('invalid_notification_batch',503);
    const batch=raw as unknown as NotificationBatch;
    const key={id:batch.id,lease:batch.lease};
    let email: NotificationEmail;
    try { email=batch.payload ?? renderNotificationEmail(batch,config.from,config.appUrl); }
    catch { await privateRpc(env,'failed',{...key,code:'invalid_payload',permanent:true},fetcher); failed++; continue; }
    const begin=await privateRpc(env,'begin-send',{...key,email},fetcher);
    if (!isObject(begin) || typeof begin.send!=='boolean') throw new ServiceError('invalid_notification_batch',503);
    if (!begin.send) continue;
    // Always use the frozen database body, including on a retry after a configuration/deployment change.
    email=begin.email as NotificationEmail;
    let providerId: string | null=null, permanent=false, code='unknown_result';
    try {
      const response=await fetcher('https://api.resend.com/emails', {
        method:'POST',redirect:'manual',signal:AbortSignal.timeout(20_000),
        headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`aramis-notification/${batch.id}`},
        body:JSON.stringify(email),
      });
      const result: unknown=await response.json().catch(()=>null);
      if (response.ok && isObject(result) && typeof result.id==='string' && result.id.length>0 && result.id.length<=160) providerId=result.id;
      else if (!response.ok) {
        permanent=response.status>=400&&response.status<500&&![408,425,429].includes(response.status);
        code=permanent?'provider_rejected':'provider_unavailable';
      }
    } catch { /* No upstream bodies, URLs or credentials are logged. Retry the same idempotency key. */ }
    if (providerId) { await privateRpc(env,'sent',{...key,providerId},fetcher); sent++; }
    else { await privateRpc(env,'failed',{...key,code,permanent},fetcher); failed++; }
  }
  return { enabled:true,sent,failed };
}

export async function handleNotificationPreferences(request: Request, env: NotificationEnv, config: Config, fetcher: Fetcher = fetch) {
  if (!['GET','POST'].includes(request.method)) throw new ServiceError('method_not_allowed',405);
  const bounded: Fetcher=(input,init)=>fetcher(input,{...init,signal:AbortSignal.timeout(25_000)});
  await verifySupabaseUser(request,config,bounded);
  let body: Record<string,unknown> | null=null;
  if (request.method==='POST') {
    if (request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json') throw new ServiceError('unsupported_media_type',415);
    if (Number(request.headers.get('Content-Length'))>2048) throw new ServiceError('payload_too_large',413);
    const reader=request.body?.getReader(); if(!reader)throw new ServiceError('VALIDATION',400);
    const chunks:Uint8Array[]=[]; let size=0;
    try { while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>2048){await reader.cancel();throw new ServiceError('payload_too_large',413);}chunks.push(part.value);} }
    finally {reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
    try {const parsed:unknown=JSON.parse(new TextDecoder().decode(bytes));if(isObject(parsed))body=parsed;}catch{/* validate below */}
    if(!body||Object.keys(body).some(k=>!['preferences','requestId'].includes(k))||!isObject(body.preferences)||typeof body.requestId!=='string'||!UUID.test(body.requestId))throw new ServiceError('VALIDATION',400);
  }
  const response=await bounded(new URL('/rest/v1/rpc/aramis_notification_preferences',config.url), {
    method:'POST',redirect:'manual',headers:{Authorization:request.headers.get('Authorization')!,apikey:config.publishableKey,'Content-Type':'application/json'},
    body:JSON.stringify({p_workspace_id:config.workspaceId,...(body?{p_payload:body.preferences,p_request_id:body.requestId}:{})}),
  });
  const data:unknown=await response.json().catch(()=>null);
  if(!response.ok){
    if(isObject(data)&&data.code==='42501')throw new ServiceError('forbidden',403);
    if(isObject(data)&&data.code==='P0001'&&['CONFLICT','VALIDATION','IDEMPOTENCY_CONFLICT'].includes(String(data.message)))throw new ServiceError(String(data.message),data.message==='VALIDATION'?400:409);
    throw new ServiceError('notification_store_unavailable',503);
  }
  if(!isObject(data)||!isObject(data.preferences))throw new ServiceError('notification_store_unavailable',503);
  let sendingEnabled=false;
  try{sendingEnabled=!!sendingConfiguration(env);}catch{/* preference editing stays available while sender config is incomplete */}
  return Response.json({...data,sendingEnabled} as unknown as NotificationSettings,{headers:HEADERS});
}
