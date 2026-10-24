// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import type { PilotStaffView } from '../contracts/client-pilot';
const W='10000000-0000-4000-8000-000000000001',U='00000000-0000-4000-8000-000000000001',C='20000000-0000-4000-8000-000000000001',P='40000000-0000-4000-8000-000000000001';
const hash='a'.repeat(64),cipher={iv:Array(12).fill(1),ciphertext:Array(40).fill(2)};
describe('atomic batched client reviews',()=>{
 let db:PGlite;
 const rpc=async(action:string,payload:Record<string,unknown>={},client=false)=>{
   await db.exec('savepoint request; set role service_role');
   try{return (await db.query<{v:PilotStaffView}>('select public.aramis_client_pilot($1,$2,$3,$4,$5) v',[W,client?null:U,client?hash:null,action,JSON.stringify(client?payload:{clientId:C,key:randomUUID(),...payload})])).rows[0].v;}
   catch(error){await db.exec('rollback to savepoint request');throw error;}
   finally{await db.exec('reset role; release savepoint request');}
 };
 const publish=(extra:Record<string,unknown>={})=>rpc('publish',{pieceId:P,expectedRevision:1,kind:'script',text:'Guion público',separateParts:true,...extra});
 const respond=(id:string,part:string,decision='approved',comment='',key=randomUUID())=>rpc('respond',{requestId:id,part,decision,comment,author:'Cliente',key},true);
 const status=async()=> (await db.query<{status:string}>('select status from public.pieces where id=$1',[P])).rows[0].status;
 async function final(caption='Caption final exacto'){
   const id=randomUUID();await db.query("update public.pieces set status='review' where id=$1",[P]);
   await db.query("insert into app_private.deliveries(id,workspace_id,piece_id,version,caption,assets,status,created_by) values($1,$2,$3,1,$4,$5,'pending','Diseño')",[id,W,P,caption,JSON.stringify([{id:randomUUID(),name:'final.mp4',mimeType:'video/mp4',size:100}])]);
   return (await publish({kind:'delivery',deliveryId:id})).requests[0];
 }
 beforeAll(async()=>{
   db=new PGlite();await db.exec(await readFile('supabase/tests/bootstrap.sql','utf8'));
   await db.exec('alter table auth.users add column email text; alter table auth.users add column email_confirmed_at timestamptz');
   for(const file of (await readdir('supabase/migrations')).sort()){
     await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
     if(file==='202609060001_initial.sql')await db.exec(await readFile('supabase/tests/fixtures.sql','utf8'));
   }
 },30_000);
 beforeEach(async()=>{await db.exec('begin');await rpc('link-ensure',{tokenHash:hash,encryptedToken:cipher});await db.query("update public.piece_drafts set caption='Caption público' where piece_id=$1",[P]);});
 afterEach(async()=>{await db.exec('rollback');});afterAll(async()=>{await db?.close();});

 const batch=(r:{id:string;version:number},answers:unknown[],key=randomUUID())=>rpc('respond-batch',{requestId:r.id,version:r.version,key,author:'Cliente',answers},true);
 const answer=(part:string,decision='approved',comment='')=>({part,decision,comment});
 const area=async()=> (await db.query<{work_area:string}>('select work_area from public.piece_production where piece_id=$1',[P])).rows[0].work_area;
 it('sends both decisions atomically and replays the exact receipt once',async()=>{
   const r=await final(),key=randomUUID(),answers=[answer('content'),answer('caption')];
   await batch(r,answers,key);await batch(r,answers,key);expect(await status()).toBe('approved');
   expect((await db.query('select * from app_private.client_pilot_responses')).rows).toHaveLength(1);
   await expect(batch(r,[answer('content','changes','Other')],key)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
 });
 it('rejects an invalid second section without recording the valid first one',async()=>{
   const r=await final();await expect(batch(r,[answer('content'),answer('caption','changes')])).rejects.toThrow('VALIDATION');
   expect((await rpc('view',{},true)).requests[0].contentStatus).toBe('pending');expect(await status()).toBe('review');
   expect((await db.query('select * from app_private.client_pilot_responses')).rows).toHaveLength(0);
   await expect(batch(r,[answer('caption'),answer('caption')])).rejects.toThrow('VALIDATION');
 });
 it('routes caption-only changes to Marketing and keeps material pending for a later response',async()=>{
   const r=await final();let v=await batch(r,[answer('caption','changes','Acortar')]);
   expect(await area()).toBe('marketing');expect(await status()).toBe('production');expect(v.requests[0]).toMatchObject({canRespond:true,status:'changes',contentStatus:'pending',captionStatus:'changes'});
   v=await batch(r,[answer('content')]);expect(v.requests[0]).toMatchObject({canRespond:false,status:'changes',contentStatus:'approved'});expect(await status()).toBe('production');expect(await area()).toBe('marketing');
   const latest=(await db.query<{kind:string;reason:string}>("select kind,reason from app_private.notification_events e where client_request_id=$1 and audience='marketing' and app_private.notification_event_current(e)",[r.id])).rows;
   expect(latest).toHaveLength(1);expect(latest[0].kind).toBe('client_changes');expect(latest[0].reason).toContain('Caption: Cambios pedidos · Acortar');
 });
 it('routes mixed changes to both email audiences and only material reasons to Design',async()=>{
   const r=await final();await batch(r,[answer('content','changes','Recortar video'),answer('caption','changes','Acortar texto')]);
   expect(await area()).toBe('design');
   const events=(await db.query<{audience:string;reason:string;source:string}>("select audience,reason,source from app_private.notification_events where client_request_id=$1 order by audience",[r.id])).rows;
   expect(events).toHaveLength(2);expect(events[0]).toMatchObject({audience:'design',source:'client'});expect(events[0].reason).toContain('Recortar video');expect(events[0].reason).not.toContain('Acortar texto');expect(events[1].reason).toContain('Acortar texto');
   await db.exec('set constraints all immediate');
   expect((await db.query("select * from app_private.notification_events where piece_id=$1 and sequence>0 and kind='returned'",[P])).rows).toHaveLength(0);
 });
 it('preserves partial material changes while accepting caption later, then invalidates on a new snapshot',async()=>{
   const r=await final();let v=await batch(r,[answer('content','changes','Recortar')]);expect(v.requests[0].canRespond).toBe(true);
   v=await batch(r,[answer('caption')]);expect(v.requests[0]).toMatchObject({status:'changes',canRespond:false});expect(await area()).toBe('design');
   const events=(await db.query<{ok:boolean}>('select app_private.notification_event_current(e) ok from app_private.notification_events e where client_request_id=$1',[r.id])).rows;expect(events.every(e=>e.ok)).toBe(true);
   await db.query("update app_private.client_pilot_requests set status='superseded' where id=$1",[r.id]);
   await expect(batch(r,[answer('caption')])).rejects.toThrow('CONFLICT');
   expect((await db.query<{ok:boolean}>('select app_private.notification_event_current(e) ok from app_private.notification_events e where client_request_id=$1',[r.id])).rows.every(e=>!e.ok)).toBe(true);
 });
 it('comments do not approve and script changes belong to Marketing',async()=>{
   const r=(await publish()).requests[0];let v=await batch(r,[answer('content','comment','Una consulta')]);expect(v.requests[0].comments[0].text).toBe('Una consulta');expect(v.requests[0].contentStatus).toBe('pending');
   v=await batch(r,[answer('content','changes','Reescribir')]);expect(await status()).toBe('planned');expect(await area()).toBe('marketing');expect(v.requests[0].captionStatus).toBe('pending');
 });
 it('publishes one staff-only aggregate without exposing drafts or private notes',async()=>{
   expect((await db.query<{s:Record<string,unknown>|null}>('select app_private.client_review_summary($1) s',[P])).rows[0].s).toBeNull();const r=await final();
   await batch(r,[answer('content')]);const summary=(await db.query<{s:Record<string,unknown>|null}>('select app_private.client_review_summary($1) s',[P])).rows[0].s;expect(summary).toMatchObject({status:'pending',contentStatus:'approved'});
   expect(JSON.stringify(await rpc('view',{},true))).not.toMatch(/internalNote|contentComment|marketing_response_key/);
 });
 it('uses the existing cadence queue for client text responses and revalidates before sending',async()=>{
   await db.query("update auth.users set email='marketing@example.test',email_confirmed_at=now() where id=$1",[U]);
   await db.query("update app_private.notification_preferences set audience='marketing',cadence='immediate'");
   const r=await final();await db.exec('set constraints all immediate; delete from app_private.notification_queue; delete from app_private.notification_events');
   await batch(r,[answer('caption','changes','Acortar el cierre')]);
   const b=(await db.query<{v:{id:string;lease:string;items:{kind:string;source:string}[]}}>("select public.aramis_notification_dispatch($1,'claim','{}','2030-01-02T12:00:00Z') v",[W])).rows[0].v;
   expect(b.items).toMatchObject([{kind:'client_changes',source:'client'}]);
   await rpc('withdraw',{requestId:r.id});
   const result=(await db.query<{v:{send:boolean}}>("select public.aramis_notification_dispatch($1,'begin-send',$2,'2030-01-02T12:00:01Z') v",[W,JSON.stringify({id:b.id,lease:b.lease,email:{to:['marketing@example.test']}})])).rows[0].v;
   expect(result.send).toBe(false);
 });
 it('keeps the source when staff record a client correction using the existing delivery action',async()=>{
   const r=await final();await db.exec('set constraints all immediate');await respond(r.id,'caption','changes','Recorded by staff flow');
   const e=(await db.query<{source:string}>("select source from app_private.notification_events where piece_id=$1 and kind='returned' order by sequence desc limit 1",[P])).rows[0];expect(e.source).toBe('client');
 });
 it('rejects wrong versions, revoked links, archived pieces and non-service callers',async()=>{
   const r=await final();await expect(batch({...r,version:r.version+1},[answer('content')])).rejects.toThrow('CONFLICT');
   await rpc('link-revoke');await expect(batch(r,[answer('content')])).rejects.toThrow('INVALID_ACCESS');
   await db.exec('savepoint denied; set role anon');await expect(db.query("select public.aramis_client_pilot($1,null,$2,'view','{}')",[W,hash])).rejects.toThrow();await db.exec('rollback to savepoint denied; reset role; release savepoint denied');
 });
});
