// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import type { PilotStaffView } from '../contracts/client-pilot';
const W='10000000-0000-4000-8000-000000000001',U='00000000-0000-4000-8000-000000000001',C='20000000-0000-4000-8000-000000000001',P='40000000-0000-4000-8000-000000000001';
const hash='a'.repeat(64),cipher={iv:Array(12).fill(1),ciphertext:Array(40).fill(2)};
describe('unified client publication and independent exact-version decisions',()=>{
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
   for(const file of (await readdir('supabase/migrations')).sort()){
     await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
     if(file==='202609060001_initial.sql')await db.exec(await readFile('supabase/tests/fixtures.sql','utf8'));
   }
 },30_000);
 beforeEach(async()=>{await db.exec('begin');await rpc('link-ensure',{tokenHash:hash,encryptedToken:cipher});await db.query("update public.piece_drafts set caption='Caption público' where piece_id=$1",[P]);});
 afterEach(async()=>{await db.exec('rollback');});afterAll(async()=>{await db?.close();});
 it('snapshots the curated script and caption, replacing both older kinds without exposing internal fields',async()=>{
   const original=(await publish()).requests[0];
   await db.query("update public.piece_drafts set caption='Borrador posterior' where piece_id=$1",[P]);
   const read=await rpc('view',{},true);expect(read.requests[0]).toMatchObject({text:'Guion público',caption:'Caption público',separateParts:true,contentStatus:'pending',captionStatus:'pending'});
   expect(JSON.stringify(read)).not.toMatch(/INSTRUCCIONES PRIVADAS|OTRO PRIVADO|Borrador posterior|internalNote/);
   const next=await final();expect((await rpc('view',{},true)).requests).toHaveLength(1);expect(next.text).toBe('');expect(next.caption).toBe('Caption final exacto');
   await expect(respond(original.id,'content')).rejects.toThrow('CONFLICT');
 });
 it('allows scripts during production; accepting both parts does not change the internal stage',async()=>{
   await db.query("update public.pieces set status='production' where id=$1",[P]);const r=(await publish()).requests[0];
   let v=await respond(r.id,'caption');expect(v.requests[0]).toMatchObject({status:'pending',canRespond:true,contentStatus:'pending',captionStatus:'approved'});
   v=await respond(r.id,'content');expect(v.requests[0].status).toBe('approved');expect(await status()).toBe('production');
 });
 it('requires both content and caption before approving the exact delivery, with idempotent partial and final responses',async()=>{
   const r=await final(),key=randomUUID();let v=await respond(r.id,'content','approved','',key);await respond(r.id,'content','approved','',key);
   expect(v.requests[0]).toMatchObject({status:'pending',canRespond:true,contentStatus:'approved',captionStatus:'pending'});expect(await status()).toBe('review');
   await expect(respond(r.id,'content')).rejects.toThrow('CONFLICT');
   v=await respond(r.id,'caption');expect(v.requests[0].status).toBe('approved');expect(await status()).toBe('approved');
   await expect(respond(r.id,'caption','changes','Otro',key)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
 });
 it('returns caption changes to Design exactly once with a useful reason and closes the other decision',async()=>{
   const r=await final(),key=randomUUID();await respond(r.id,'content');await respond(r.id,'caption','changes','Acortar el cierre',key);await respond(r.id,'caption','changes','Acortar el cierre',key);
   expect(await status()).toBe('production');
   const d=(await db.query<{source:string;comment:string}>('select source,comment from app_private.deliveries where piece_id=$1',[P])).rows[0];expect(d).toEqual({source:'client',comment:'Caption: Acortar el cierre'});
   await expect(respond(r.id,'content','changes','Más cambios')).rejects.toThrow('CONFLICT');
 });
 it('supports caption-only, content-only and calendar-only updates without empty approval targets',async()=>{
   let r=(await publish({text:''})).requests[0];expect(r.contentStatus).toBeNull();expect((await respond(r.id,'caption')).requests[0].status).toBe('approved');
   await db.query("update public.piece_drafts set caption='' where piece_id=$1",[P]);r=(await publish()).requests[0];expect(r.captionStatus).toBeNull();await expect(respond(r.id,'caption')).rejects.toThrow('CONFLICT');expect((await respond(r.id,'content')).requests[0].status).toBe('approved');
   const v=await publish({text:''});expect(v.pieces).toHaveLength(1);expect(v.requests).toHaveLength(0);
 });
 it('requires the target part and change reason; comments do not accept anything',async()=>{
   const r=await final();await expect(respond(r.id,'caption','changes')).rejects.toThrow('VALIDATION');await expect(respond(r.id,'notes')).rejects.toThrow('VALIDATION');
   await expect(rpc('respond',{requestId:r.id,decision:'approved',comment:'',author:'Cliente',key:randomUUID()},true)).rejects.toThrow('VALIDATION');
   const v=await respond(r.id,'caption','comment','¿Podemos acortarlo?');expect(v.requests[0]).toMatchObject({status:'pending',contentStatus:'pending',captionStatus:'pending'});expect(await status()).toBe('review');
 });
});
