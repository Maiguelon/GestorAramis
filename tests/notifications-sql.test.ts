// @vitest-environment node
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import type {NotificationBatch,NotificationSettings} from '../contracts/notifications';
const W='10000000-0000-4000-8000-000000000001', U='00000000-0000-4000-8000-000000000001';
const D='00000000-0000-4000-8000-000000000006', M='30000000-0000-4000-8000-000000000006';
const C='20000000-0000-4000-8000-000000000001';
const t='2030-01-02T12:00:00Z'; // 09:00 Argentina; isolated fixture clock, never used against hosted services.

describe('transactional notification outbox (isolated PostgreSQL)',()=>{
 let db:PGlite;
 beforeAll(async()=>{
  db=new PGlite();await db.exec(await readFile('supabase/tests/bootstrap.sql','utf8'));
  await db.exec('alter table auth.users add column email text; alter table auth.users add column email_confirmed_at timestamptz');
  for(const file of (await readdir('supabase/migrations')).sort()){
   await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
   if(file==='202609060001_initial.sql')await db.exec(await readFile('supabase/tests/fixtures.sql','utf8'));
  }
  await db.query("update auth.users set email='marketing@example.test',email_confirmed_at=now() where id=$1",[U]);
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'design@example.test',now());",[D]);
  await db.query("insert into public.profiles(user_id,display_name) values($1,'Design fixture')",[D]);
  await db.query("insert into public.members(id,workspace_id,user_id,role) values($1,$2,$3,'staff')",[M,W,D]);
 },30_000);
 afterAll(async()=>{await db?.close();});
 async function asUser<T>(user:string,sql:string,args:unknown[]=[]){
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${user}'`);
  try{return (await db.query<{value:T}>(sql,args)).rows[0]?.value;}finally{await db.exec('reset role; reset request.jwt.claim.sub');}
 }
 const prefs=(user=U,payload:unknown=null,key:string|null=null)=>asUser<NotificationSettings>(user,'select public.aramis_notification_preferences($1,$2,$3) value',[W,payload?JSON.stringify(payload):null,key]);
 async function save(user:string,audience:string,cadence='immediate',enabled=true){
  const current=await prefs(user);
  return prefs(user,{audience,cadence,enabled,dailyTime:'09:00',expectedRevision:current.preferences.revision},randomUUID());
 }
 async function dispatch(action:string,payload:unknown={},now=t){
  await db.exec('set role service_role');
  try{return (await db.query<{value:any}>('select public.aramis_notification_dispatch($1,$2,$3,$4) value',[W,action,JSON.stringify(payload),now])).rows[0].value;}finally{await db.exec('reset role');}
 }
 async function piece(){
  const result=await asUser<any>(U,'select public.aramis_command($1,$2,$3) value',[W,JSON.stringify({type:'create-piece',input:{clientId:C,title:'Aviso sintético',planMonth:'2030-01'}}),randomUUID()]);
  return result.state.pieces.find((p:any)=>p.id===result.entityId);
 }
 async function edit(p:any,patch:unknown,key=randomUUID()){
  const result=await asUser<any>(U,'select public.aramis_command($1,$2,$3) value',[W,JSON.stringify({type:'update-piece',pieceId:p.id,expectedRevision:p.revision,patch}),key]);
  return result.state.pieces.find((item:any)=>item.id===p.id);
 }
 async function count(sql='select count(*)::int n from app_private.notification_queue where state=\'pending\''){
  return (await db.query<{n:number}>(sql)).rows[0].n;
 }
 async function reset(){await db.exec("delete from app_private.notification_queue; delete from app_private.notification_batches; delete from app_private.notification_events; update app_private.notification_preferences set last_sent_at=null;");await save(U,'marketing');await save(D,'design');}
 const begin=(b:NotificationBatch)=>dispatch('begin-send',{id:b.id,lease:b.lease,email:{from:'Aramis <avisos@example.test>',to:[b.recipient],subject:'Test',html:'<p>Test</p>',text:'Test'}});

 it('private preferences are independent from roles and enforce self, revision and idempotency',async()=>{
  const defaults=await prefs();expect(defaults.preferences).toMatchObject({audience:'unassigned',cadence:'daily',dailyTime:'09:00',enabled:true});
  const payload={audience:'marketing',cadence:'daily',enabled:true,dailyTime:'09:30',expectedRevision:defaults.preferences.revision},key=randomUUID();
  const saved=await prefs(U,payload,key);expect(await prefs(U,payload,key)).toEqual(saved);
  await expect(prefs(U,{...payload,audience:'design'},key)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  await expect(prefs(U,payload,randomUUID())).rejects.toThrow('CONFLICT');
  await expect(prefs('00000000-0000-4000-8000-000000000002')).rejects.toThrow('FORBIDDEN');
  await expect(asUser(U,'select public.aramis_notification_preferences($1,$2,$3) value',['10000000-0000-4000-8000-000000000002',null,null])).rejects.toThrow();
  await expect(asUser(U,'select public.aramis_notification_dispatch($1,$2) value',[W,'claim'])).rejects.toThrow('permission denied');
  await expect(asUser(U,'select count(*) value from app_private.notification_events')).rejects.toThrow('permission denied');
 });
 it('capture observes final production state and command replay/editing do not duplicate alerts',async()=>{
  await reset();let p=await piece();
  p=await edit(p,{status:'production',workArea:'marketing',productionStage:'recording'});expect(await count()).toBe(0);
  const original=p,key=randomUUID(),patch={workArea:'design',productionStage:'ready'};
  p=await edit(p,patch,key);expect(await count()).toBe(1);
  await edit(original,patch,key);expect(await count()).toBe(1);
  p=await edit(p,{productionStage:'editing',script:'Updated instructions'});expect(await count()).toBe(1);
  const b=await dispatch('claim');expect(b).toMatchObject({recipient:'design@example.test',audience:'design'});expect(b.items).toHaveLength(1);
  expect(await dispatch('claim')).toBeNull(); // active lease prevents concurrent execution
 });
 it('resolved, archived and old-cycle events are suppressed; review returns one new event for marketing',async()=>{
  await reset();let p=await piece();p=await edit(p,{status:'production',workArea:'design'});
  await db.query("update public.pieces set status='review',revision=revision+1 where id=$1",[p.id]);
  const b=await dispatch('claim');expect(b.audience).toBe('marketing');expect(b.items[0].kind).toBe('review');
  await begin(b);await dispatch('sent',{id:b.id,lease:b.lease,providerId:'test-provider'});
  await db.query("update public.pieces set status='production',revision=revision+1 where id=$1",[p.id]);
  await db.query("update public.pieces set archived=true,revision=revision+1 where id=$1",[p.id]);
  expect(await dispatch('claim')).toBeNull();
 });
 it('waiting for material does not notify until it is complete, and reason is the exact latest return',async()=>{
  await reset();let p=await piece();
  await db.query("insert into public.material_requests(workspace_id,client_id,piece_id,instructions,status) values($1,$2,$3,'Fixture','pending')",[W,C,p.id]);
  p=await edit(p,{status:'production',workArea:'design'});expect(await count()).toBe(0);
  await db.query("update public.material_requests set status='complete' where piece_id=$1",[p.id]);expect(await count()).toBe(1);
  await db.query("update public.pieces set status='review' where id=$1",[p.id]);
  await db.query("insert into app_private.deliveries(workspace_id,piece_id,version,caption,assets,status,created_by,comment,source) values($1,$2,1,'','[]','changes','Fixture','Cambiar slide 2','team')",[W,p.id]);
  await db.query("update public.pieces set status='production' where id=$1",[p.id]);
  const b=await dispatch('claim');expect(b.audience).toBe('design');expect(b.items).toMatchObject([{kind:'returned',reason:'Cambiar slide 2'}]);
 });
 it('daily digest sends at Argentina cutoff, avoids empty/second emails and respects hourly/six-hour buckets',async()=>{
  await reset();await save(D,'design','daily');let p=await piece();p=await edit(p,{status:'production',workArea:'design'});
  await db.query("update app_private.notification_queue set queued_at='2030-01-02T11:55:00Z'");
  expect(await dispatch('claim',{},'2030-01-02T11:59:00Z')).toBeNull();
  const b=await dispatch('claim');expect(b.audience).toBe('design');await begin(b);await dispatch('sent',{id:b.id,lease:b.lease,providerId:'provider'});
  let next=await piece();next=await edit(next,{status:'production',workArea:'design'});
  await db.query("update app_private.notification_queue set queued_at='2030-01-02T12:01:00Z' where state='pending'");
  expect(await dispatch('claim',{},'2030-01-02T15:00:00Z')).toBeNull();
  await save(D,'design','hourly');expect(await dispatch('claim',{},'2030-01-02T12:30:00Z')).toBeNull();
  const hourly=await dispatch('claim',{},'2030-01-02T13:00:00Z');expect(hourly.items).toHaveLength(1);
  await dispatch('failed',{id:hourly.id,lease:hourly.lease,permanent:true,code:'provider_rejected'},'2030-01-02T13:00:00Z');
  await reset();await save(D,'design','six_hours');p=await piece();await edit(p,{status:'production',workArea:'design'});
  await db.query("update app_private.notification_queue set queued_at='2030-01-02T13:01:00Z'");
  expect(await dispatch('claim',{},'2030-01-02T14:00:00Z')).toBeNull();
  expect(await dispatch('claim',{},'2030-01-02T15:00:00Z')).not.toBeNull(); // 12:00 Argentina
 });
 it('a digest groups multiple pieces, excludes unassigned recipients and never reuses an old return reason',async()=>{
  await reset();await save(D,'unassigned');let p=await piece();p=await edit(p,{status:'production',workArea:'design'});
  expect(await count()).toBe(0);await save(D,'design');expect(await dispatch('claim')).toBeNull();
  await db.query("update public.pieces set status='review' where id=$1",[p.id]);
  await db.query("insert into app_private.deliveries(workspace_id,piece_id,version,caption,assets,status,created_by,comment,source) values($1,$2,1,'','[]','changes','Fixture','Motivo antiguo','team'),($1,$2,2,'','[]','pending','Fixture','','team')",[W,p.id]);
  await db.query("update public.pieces set status='production' where id=$1",[p.id]);
  let second=await piece();await edit(second,{status:'production',workArea:'design'});
  const b=await dispatch('claim');expect(b.audience).toBe('design');expect(b.items).toHaveLength(2);
  expect(b.items.every((item:any)=>item.kind==='ready'&&item.reason==='')).toBe(true);
 });
 it('retry keeps its immutable payload and stops after provider idempotency window; lease tokens fence stale acknowledgements',async()=>{
  await reset();const p=await piece();await edit(p,{status:'production',workArea:'design'});
  const b=await dispatch('claim');const frozen=await begin(b);
  await dispatch('failed',{id:b.id,lease:b.lease,code:'unknown_result'});
  const retry=await dispatch('claim',{},'2030-01-02T12:02:00Z');expect(retry.id).toBe(b.id);expect(retry.payload).toEqual(frozen.email);
  await expect(dispatch('sent',{id:b.id,lease:b.lease,providerId:'late-response'},'2030-01-02T12:02:00Z')).rejects.toThrow('CONFLICT');
  await dispatch('failed',{id:b.id,lease:retry.lease,code:'unknown_result'},'2030-01-02T12:02:00Z');
  expect(await dispatch('claim',{},'2030-01-03T11:01:00Z')).toBeNull();
  expect((await prefs(D)).lastEmail?.status).toBe('needs_review');
 });
 it('pausing or account revocation prevents a prepared email, and an uncertain old batch is not rebatched',async()=>{
  await reset();let p=await piece();await edit(p,{status:'production',workArea:'design'});
  const b=await dispatch('claim');await save(D,'design','immediate',false);expect(await begin(b)).toEqual({send:false});
  expect(await dispatch('claim')).toBeNull();
  await reset();p=await piece();await edit(p,{status:'production',workArea:'design'});const uncertain=await dispatch('claim');
  await begin(uncertain);await dispatch('failed',{id:uncertain.id,lease:uncertain.lease,code:'unknown_result'});
  await db.query('update public.members set active=false where id=$1',[M]);
  const retry=await dispatch('claim',{},'2030-01-02T12:02:00Z');
  expect(await dispatch('begin-send',{id:retry.id,lease:retry.lease},'2030-01-02T12:02:00Z')).toEqual({send:false});
  await db.query('update public.members set active=true where id=$1',[M]);
  expect((await prefs(D)).lastEmail?.status).toBe('needs_review');expect(await dispatch('claim',{},'2030-01-02T12:03:00Z')).toBeNull();
 });
 it('the hosted verification script rolls back every synthetic entity and preference change',async()=>{
  await reset();await save(D,'unassigned');const before=await prefs(U),pieces=await count('select count(*)::int n from public.pieces');
  const sql=(await readFile('supabase/tests/notifications_hosted.sql','utf8'))
   .replaceAll('cc7761e3-36af-4558-9aa9-116a165be3e3',W).replaceAll('miguel_carretero@outlook.com','marketing@example.test');
  await db.exec(sql);expect(await prefs(U)).toEqual(before);
  expect(await count('select count(*)::int n from public.pieces')).toBe(pieces);expect(await count()).toBe(0);
 });
 it('the live probe isolates two synthetic pieces to Miguel and archives them after one accepted digest',async()=>{
  await reset();await save(U,'unassigned');await save(D,'unassigned');
  const operator=async(file:string)=>(await readFile('supabase/operator/'+file,'utf8')).replaceAll('cc7761e3-36af-4558-9aa9-116a165be3e3',W).replaceAll('miguel_carretero@outlook.com','marketing@example.test');
  await db.exec(await operator('notification_probe_setup.sql'));
  expect(await count()).toBe(2);const batch=await dispatch('claim');
  expect(batch.recipient).toBe('marketing@example.test');expect(batch.items).toHaveLength(2);
  expect(batch.items.every((item:any)=>item.client==='Prueba controlada de avisos 2026-10-01')).toBe(true);
  await begin(batch);await dispatch('sent',{id:batch.id,lease:batch.lease,providerId:'test-probe-provider'});
  await db.exec(await operator('notification_probe_cleanup.sql'));
  expect((await prefs(U)).preferences).toMatchObject({audience:'marketing',cadence:'daily',dailyTime:'09:00'});
  expect(await count("select count(*)::int n from public.pieces p join public.clients c on c.id=p.client_id where c.name='Prueba controlada de avisos 2026-10-01' and (not p.archived or c.archived_at is null)")).toBe(0);
  expect(await dispatch('claim')).toBeNull();
 });
});
