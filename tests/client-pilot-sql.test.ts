// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import type { PilotStaffView, PilotView } from '../contracts/client-pilot';
const W='10000000-0000-4000-8000-000000000001',U='00000000-0000-4000-8000-000000000001',C='20000000-0000-4000-8000-000000000001',B='20000000-0000-4000-8000-000000000002',P='40000000-0000-4000-8000-000000000001';
const hash='a'.repeat(64),cipher={iv:Array(12).fill(1),ciphertext:Array(40).fill(2)};
describe('client pilot private PostgreSQL boundary',()=>{
 let db:PGlite;
 const rpc=async(action:string,payload:unknown={},user:string|null=U,token:string|null=null)=>{
   await db.exec('set role service_role');
   try{return (await db.query<{v:PilotStaffView}>('select public.aramis_client_pilot($1,$2,$3,$4,$5) v',[W,user,token,action,JSON.stringify(payload)])).rows[0].v;}
   finally{await db.exec('reset role');}
 };
 const staff=(action:string,extra:Record<string,unknown>={})=>rpc(action,{clientId:C,key:randomUUID(),...extra});
 const view=()=>rpc('view',{},null,hash);
 const publish=(text='Guion expresamente público')=>staff('publish',{pieceId:P,expectedRevision:1,kind:'script',text});
 const respond=(requestId:string,decision='approved',comment='',key=randomUUID())=>rpc('respond',{requestId,decision,comment,author:'Cliente de prueba',key},null,hash);
 beforeAll(async()=>{
   db=new PGlite();await db.exec(await readFile('supabase/tests/bootstrap.sql','utf8'));
   for(const file of (await readdir('supabase/migrations')).sort()){
     await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
     if(file==='202609060001_initial.sql')await db.exec(await readFile('supabase/tests/fixtures.sql','utf8'));
   }
 },30_000);
 afterAll(async()=>{await db?.close();});
 it('denies anonymous, authenticated, client and foreign staff access to the service bridge',async()=>{
   for(const role of ['anon','authenticated']){
     await db.exec(`set role ${role}`);
     await expect(db.query('select public.aramis_client_pilot($1,$2,null,\'staff-view\',$3)',[W,U,JSON.stringify({clientId:C})])).rejects.toMatchObject({code:'42501'});
     await db.exec('reset role');
   }
   for(const user of ['00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000005'])await expect(rpc('staff-view',{clientId:C},user)).rejects.toMatchObject({code:'42501'});
   await expect(view()).rejects.toThrow('INVALID_ACCESS');
 });
 it('issues a revocable link without publishing any existing internal data',async()=>{
   const key=randomUUID();await staff('link-ensure',{tokenHash:hash,encryptedToken:cipher,key});
   await staff('link-ensure',{tokenHash:'b'.repeat(64),encryptedToken:cipher,key});
   const value=await view();expect(value.pieces).toEqual([]);expect(value.requests).toEqual([]);
   expect(value).not.toHaveProperty('encryptedToken');expect(value).not.toHaveProperty('linkActive');
 });
 it('publishes a curated script, excludes private notes and leaves the piece in planning after approval',async()=>{
   let value=await publish();const id=value.requests[0].id;
   const raw=JSON.stringify(await view());for(const forbidden of ['Privado del equipo','BORRADOR PRIVADO','internalNote','encryptedToken','driveFileId','ownerId'])expect(raw).not.toContain(forbidden);
   expect(value.pieces).toHaveLength(1);expect(value.requests[0].text).toBe('Guion expresamente público');
   const key=randomUUID();await respond(id,'approved','',key);value=await respond(id,'approved','',key);
   expect(value.requests[0].status).toBe('approved');
   expect((await db.query<{status:string}>('select status from public.pieces where id=$1',[P])).rows[0].status).toBe('planned');
   await expect(respond(id,'changes','Cambio con misma clave',key)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
 });
 it('records comments independently; a replacement or withdrawn request cannot approve',async()=>{
   let value=await publish('Segundo guion');const old=value.requests[0].id;
   value=await respond(old,'comment','¿Se puede acortar?');expect(value.requests[0].status).toBe('pending');expect(value.requests[0].comments[0].text).toBe('¿Se puede acortar?');
   await publish('Tercer guion');await expect(respond(old)).rejects.toThrow('CONFLICT');
   const next=(await view()).requests[0];await expect(respond(next.id,'changes','')).rejects.toThrow('VALIDATION');
   await staff('withdraw',{requestId:next.id});await expect(respond(next.id)).rejects.toThrow('CONFLICT');
 });
 it('isolates clients, rejects shared pieces and handles calendar visibility independently',async()=>{
   await expect(staff('calendar-show',{clientId:B,pieceId:P,expectedRevision:1})).rejects.toThrow('NOT_FOUND');
   await db.query('insert into app_private.piece_clients(workspace_id,piece_id,client_id,position) values($1,$2,$3,1),($1,$2,$4,2)',[W,P,C,B]);
   await expect(publish()).rejects.toThrow('VALIDATION');expect((await view()).pieces).toEqual([]);
   await db.query('delete from app_private.piece_clients where piece_id=$1',[P]);
   await staff('calendar-hide',{pieceId:P,expectedRevision:1});expect((await view()).pieces).toEqual([]);
 });
 it('returns final changes to Design once, attributed to the client; stale final versions are denied',async()=>{
   const id=randomUUID();
   await db.query("update public.pieces set status='review' where id=$1",[P]);
   await db.query("insert into app_private.deliveries(id,workspace_id,piece_id,version,caption,assets,status,created_by) values($1,$2,$3,1,'Final exacto','[]','pending','Diseño')",[id,W,P]);
   let value=await staff('publish',{pieceId:P,expectedRevision:1,kind:'delivery',deliveryId:id});const request=value.requests.find(r=>r.kind==='delivery')!;
   const key=randomUUID();await respond(request.id,'changes','Cambiar el cierre',key);await respond(request.id,'changes','Cambiar el cierre',key);
   const row=(await db.query<{status:string;work_area:string}>('select p.status,pp.work_area from public.pieces p join public.piece_production pp on pp.piece_id=p.id where p.id=$1',[P])).rows[0];
   expect(row).toEqual({status:'production',work_area:'design'});
   const delivery=(await db.query<{source:string;comment:string}>('select source,comment from app_private.deliveries where id=$1',[id])).rows[0];expect(delivery).toEqual({source:'client',comment:'Cambiar el cierre'});
   await db.query("update public.pieces set status='review' where id=$1",[P]);
   await db.query("insert into app_private.deliveries(workspace_id,piece_id,version,caption,assets,status,created_by) values($1,$2,2,'Otra','[]','pending','Diseño')",[W,P]);
   await expect(respond(request.id,'approved')).rejects.toThrow('CONFLICT');
 });
 it('archive withdraws publication; restoring does not expose it again',async()=>{
   await db.query('update public.pieces set archived=true where id=$1',[P]);expect((await view()).pieces).toEqual([]);
   await db.query('update public.pieces set archived=false where id=$1',[P]);expect((await view()).pieces).toEqual([]);
 });
 it('revocation and rotation disable the previous capability',async()=>{
   await staff('link-revoke');await expect(view()).rejects.toThrow('INVALID_ACCESS');
   await staff('link-rotate',{tokenHash:'b'.repeat(64),encryptedToken:cipher});await expect(view()).rejects.toThrow('INVALID_ACCESS');
   expect((await rpc('view',{},null,'b'.repeat(64)) as PilotView).client.id).toBe(C);
 });
});

