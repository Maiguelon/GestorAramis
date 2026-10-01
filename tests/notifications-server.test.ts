import {describe,expect,it,vi} from 'vitest';
import {dispatchNotifications,renderNotificationEmail,type NotificationEnv} from '../server/notifications';
import {handleRequest} from '../server/index';
import type {NotificationBatch,NotificationEmail} from '../contracts/notifications';

const workspace='00000000-0000-4000-8000-000000000001';
const env:NotificationEnv={SUPABASE_URL:'https://notification-test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_TEST',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_SERVER_TEST_ONLY',ARAMIS_WORKSPACE_ID:workspace,RESEND_API_KEY:'re_TEST_ONLY',NOTIFICATION_FROM:'gestor@avisos.example.test',NOTIFICATION_APP_URL:'https://gestor.example.test',NOTIFICATION_EMAIL_ENABLED:'true'};
const batch:NotificationBatch={id:'00000000-0000-4000-8000-000000000002',lease:'00000000-0000-4000-8000-000000000003',recipient:'design@example.test',audience:'design',payload:null,firstAttemptAt:null,items:[{pieceId:'00000000-0000-4000-8000-000000000004',sequence:1,client:'Club',title:'Resumen del partido',format:'reel',plannedDate:'2030-01-03',kind:'ready',reason:''}]};
function service(options:{claimed?:NotificationBatch;send?:boolean;providerStatus?:number;providerBody?:unknown;timeout?:boolean;ackLost?:boolean;frozen?:NotificationEmail}={}){
 let claims=0;
 const calls:Array<{action:string;payload:Record<string,unknown>}> = [];
 const providers:Array<{key:string|null;email:NotificationEmail}> = [];
 const fetcher=vi.fn<typeof fetch>(async (input,init)=>{
  expect(init?.redirect).toBe('manual'); // workerd supports manual/follow; never forward private headers on redirects.
  const path=new URL(String(input)).pathname;
  if(path==='/emails'){
   providers.push({key:new Headers(init?.headers).get('Idempotency-Key'),email:JSON.parse(String(init?.body))});
   if(options.timeout)throw new DOMException('upstream private text','TimeoutError');
   return Response.json(options.providerBody??{id:'provider-id'}, {status:options.providerStatus??200});
  }
  expect(new Headers(init?.headers).get('apikey')).toBe(env.SUPABASE_SERVICE_ROLE_KEY);
  expect(new Headers(init?.headers).has('Authorization')).toBe(false);
  const operation=JSON.parse(String(init?.body));
  expect(operation.p_workspace_id).toBe(workspace);
  calls.push({action:operation.p_action,payload:operation.p_payload});
  if(operation.p_action==='claim')return Response.json(claims++===0?(options.claimed??batch):null);
  if(operation.p_action==='begin-send')return Response.json({send:options.send??true,email:options.frozen??operation.p_payload.email});
  if(operation.p_action==='sent'&&options.ackLost)return new Response('private failure',{status:503});
  return Response.json({ok:true});
 });
 return {fetcher,calls,providers};
}

describe('notification dispatch with provider mocked',()=>{
 it('disabled performs no database or email network calls',async()=>{
  const fetcher=vi.fn<typeof fetch>();
  expect(await dispatchNotifications({...env,NOTIFICATION_EMAIL_ENABLED:'false'},fetcher)).toEqual({enabled:false,sent:0,failed:0});
  expect(fetcher).not.toHaveBeenCalled();
 });
 it.each([{NOTIFICATION_FROM:'sender@example.test\r\nBcc: victim@example.test'},{NOTIFICATION_APP_URL:'http://unsafe.test'},{RESEND_API_KEY:''},{SUPABASE_URL:'https://user:password@db.test'}])('rejects invalid sender configuration without network',async overrides=>{
  const fetcher=vi.fn<typeof fetch>();
  await expect(dispatchNotifications({...env,...overrides},fetcher)).rejects.toMatchObject({code:'notification_configuration_missing'});
  expect(fetcher).not.toHaveBeenCalled();
 });
 it('escapes task content, carries return reason and links through authenticated app',()=>{
  const email=renderNotificationEmail({...batch,items:[{...batch.items[0],client:'<script>private()</script>',title:'Texto & "imagen"',kind:'returned',reason:'Cambiar <b>inicio</b>'}]},'Aramis <sender@example.test>',env.NOTIFICATION_APP_URL!);
  expect(email.html).toContain('&lt;script&gt;');expect(email.html).not.toContain('<script>');
  expect(email.html).toContain('Cambios solicitados: Cambiar &lt;b&gt;inicio&lt;/b&gt;');
  expect(email.text).toContain('Volvió a producción');expect(email.html).toContain(`/?piece=${batch.items[0].pieceId}`);
  expect(email.to).toEqual([batch.recipient]);expect(email.html).not.toContain('drive.google');
  const review=renderNotificationEmail({...batch,audience:'marketing',items:[{...batch.items[0],kind:'review'}]},'sender@example.test',env.NOTIFICATION_APP_URL!);
  expect(review.subject).toContain('revisión');expect(review.text).toContain('Nueva entrega para revisar');
 });
 it('freezes payload before sending and acknowledges provider acceptance',async()=>{
  const mock=service();expect(await dispatchNotifications(env,mock.fetcher)).toMatchObject({sent:1,failed:0});
  expect(mock.calls.map(c=>c.action)).toEqual(['claim','begin-send','sent','claim']);
  expect(mock.providers[0].key).toBe(`aramis-notification/${batch.id}`);
  expect(mock.calls[2].payload).toEqual({id:batch.id,lease:batch.lease,providerId:'provider-id'});
 });
 it('does not contact Resend if SQL invalidates the pending work',async()=>{
  const mock=service({send:false});await dispatchNotifications(env,mock.fetcher);expect(mock.providers).toEqual([]);
 });
 it('uses database frozen body even if rendering or sender settings change on retry',async()=>{
  const frozen=renderNotificationEmail(batch,'old-sender@example.test','https://old.example.test');
  const mock=service({claimed:{...batch,payload:frozen},frozen});await dispatchNotifications(env,mock.fetcher);
  expect(mock.providers[0].email).toEqual(frozen);expect(mock.providers[0].key).toBe(`aramis-notification/${batch.id}`);
 });
 it.each([[429,false,'provider_unavailable'],[503,false,'provider_unavailable'],[403,true,'provider_rejected']])('classifies provider %s without exposing its body',async(status,permanent,code)=>{
  const mock=service({providerStatus:status as number,providerBody:{message:'upstream secret detail'}});
  expect(await dispatchNotifications(env,mock.fetcher)).toMatchObject({failed:1,sent:0});
  expect(mock.calls.find(c=>c.action==='failed')?.payload).toMatchObject({code,permanent});
  expect(JSON.stringify(mock.calls)).not.toContain('upstream secret detail');
 });
 it('a timeout retries the same batch instead of assuming no email was sent',async()=>{
  const mock=service({timeout:true});await dispatchNotifications(env,mock.fetcher);
  expect(mock.calls.find(c=>c.action==='failed')?.payload).toMatchObject({code:'unknown_result',permanent:false});
 });
 it('lost provider acceptance acknowledgment leaves the lease for same-key retry',async()=>{
  const mock=service({ackLost:true});await expect(dispatchNotifications(env,mock.fetcher)).rejects.toMatchObject({code:'notification_store_unavailable'});
  expect(mock.providers).toHaveLength(1);expect(mock.calls.filter(c=>c.action==='failed')).toEqual([]);
 });
});

describe('own notification preference endpoint',()=>{
 const settings={preferences:{audience:'design',cadence:'daily',enabled:true,dailyTime:'09:00',revision:1},lastEmail:null};
 const op={requestId:batch.id,preferences:{...settings.preferences,expectedRevision:1}};
 function preferencesFetch(status=200,data:unknown=settings){return vi.fn<typeof fetch>(async(input)=>String(input).includes('/auth/v1/user')?Response.json({id:workspace}):Response.json(data,{status}));}
 const req=(body?:unknown,origin?:string)=>new Request('https://gestor.example.test/api/notifications/preferences',{method:body?'POST':'GET',headers:{Authorization:'Bearer user-token',...(body?{'Content-Type':'application/json'}:{}),...(origin?{Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{})});
 it('requires authentication and rejects foreign origin',async()=>{
  const fetcher=preferencesFetch();expect((await handleRequest(new Request(req().url),env,fetcher)).status).toBe(401);
  expect((await handleRequest(req(undefined,'https://foreign.test'),env,fetcher)).status).toBe(403);expect(fetcher).not.toHaveBeenCalled();
 });
 it('forwards only user JWT and server-fixed workspace, never admin key',async()=>{
  const fetcher=preferencesFetch();const response=await handleRequest(req(),{...env,NOTIFICATION_EMAIL_ENABLED:'false'},fetcher);
  expect(await response.json()).toEqual({...settings,sendingEnabled:false});
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  const init=fetcher.mock.calls[1][1]!;expect(new Headers(init.headers).get('Authorization')).toBe('Bearer user-token');
  expect(JSON.parse(String(init.body))).toEqual({p_workspace_id:workspace});
 });
 it('rejects recipient, workspace or member injection and streamed oversized JSON',async()=>{
  for(const extra of [{recipient:'victim@example.test'},{workspaceId:batch.id},{memberId:batch.id}]){
   const fetcher=preferencesFetch();expect((await handleRequest(req({...op,...extra}),env,fetcher)).status).toBe(400);expect(fetcher).toHaveBeenCalledTimes(1);
  }
  const fetcher=preferencesFetch();expect((await handleRequest(req({...op,padding:'x'.repeat(3000)}),env,fetcher)).status).toBe(413);expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it.each([[403,{code:'42501',message:'private body'},403],[400,{code:'P0001',message:'CONFLICT'},409],[500,{message:'secret database detail'},503]])('maps store %s to safe result %s',async(status,data,expected)=>{
  const response=await handleRequest(req(op),env,preferencesFetch(status as number,data));expect(response.status).toBe(expected);
  expect(await response.text()).not.toContain('private body');
 });
});
