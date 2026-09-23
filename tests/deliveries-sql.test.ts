// @vitest-environment node
import {beforeAll,afterAll,it,expect,describe} from 'vitest';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import type {Piece,WorkspaceState} from '../contracts/domain';
const W='10000000-0000-4000-8000-000000000001',U='00000000-0000-4000-8000-000000000001',C='20000000-0000-4000-8000-000000000001',G=randomUUID();
type Envelope={state:WorkspaceState;entityId:string};
describe('delivery workflow in PostgreSQL (real SQL, synthetic Drive metadata)',()=>{
 let db:PGlite;
 beforeAll(async()=>{
   db=new PGlite();await db.exec(await readFile('supabase/tests/bootstrap.sql','utf8'));
   for(const path of (await readdir('supabase/migrations')).sort()){
     await db.exec(await readFile('supabase/migrations/'+path,'utf8'));
     if(path==='202609060001_initial.sql')await db.exec(await readFile('supabase/tests/fixtures.sql','utf8'));
   }
   await rpc('connection-save',{expectedGeneration:null,generation:G,encryptedTokens:{iv:Array(12).fill(1),ciphertext:Array(32).fill(2)},accountEmail:'fixture@example.test',accountPermissionId:'fixture',rootFolderId:null});
 },30000);
 afterAll(async()=>{await db?.close();});
 async function rpc(action:string,payload:unknown){return (await db.query<{value:any}>('select public.aramis_drive($1,$2,$3,$4) value',[W,U,action,JSON.stringify(payload)])).rows[0].value;}
 async function command(value:unknown,requestId=randomUUID(),user=U){
   await db.exec(`set role authenticated; set request.jwt.claim.sub='${user}'`);
   try{return (await db.query<{value:Envelope}>('select public.aramis_command($1,$2,$3) value',[W,JSON.stringify(value),requestId])).rows[0].value;}
   finally{await db.exec('reset role;reset request.jwt.claim.sub');}
 }
 const piece=(r:Envelope)=>r.state.pieces.find(p=>p.id===r.entityId)!;
 async function setup(){
   const created=piece(await command({type:'create-piece',input:{clientId:C,title:'Fixture entrega'}}));
   let p=piece(await command({type:'update-piece',pieceId:created.id,expectedRevision:created.revision,patch:{status:'production',workArea:'design',caption:'Texto v1'}}));
   const folder='delivery-'+p.id;
   await rpc('folder-put',{logicalKey:`piece:${p.id}:delivery`,folderId:folder});
   const ids:string[]=[];
   for(const name of ['slide-1.png','slide-2.png']){
     const u=await rpc('upload-put',{uploadId:randomUUID(),pieceId:p.id,name,mimeType:'image/png',size:12,fingerprint:'a'.repeat(64),driveFileId:'file-'+randomUUID(),folderId:folder,generation:G,encryptedSession:null});
     expect(u.purpose).toBe('delivery');
     const a=await rpc('upload-complete',{uploadId:u.uploadId,asset:{driveFileId:u.driveFileId,mimeType:u.mimeType,size:u.size,checksum:'a'.repeat(32),driveRevisionId:'pinned-revision'}});
     expect(a.purpose).toBe('delivery'); ids.push(a.id);
   }
   p={...p,revision:p.revision+2};return {p,ids};
 }
 const submit=(p:Piece,ids:string[])=>({type:'submit-delivery',pieceId:p.id,expectedRevision:p.revision,assetIds:ids});
 const decision=(p:Piece,kind='changes',comment='Corregir cierre',source='team')=>({type:'review-delivery',pieceId:p.id,expectedRevision:p.revision,deliveryId:p.deliveries![0].id,decision:kind,comment,source});
 it('sends a multi-file snapshot, preserves order/text, returns with a reason and retains earlier versions',async()=>{
   let {p,ids}=await setup();const original=p;
   const request=submit(p,[ids[1],ids[0]]),key=randomUUID();
   p=piece(await command(request,key));
   expect(p).toMatchObject({status:'review',workArea:'marketing'});
   expect(p.deliveries![0]).toMatchObject({version:1,caption:'Texto v1',status:'pending'});
   expect(p.deliveries![0].assets.map(a=>a.id)).toEqual([ids[1],ids[0]]);
   expect(piece(await command(request,key)).deliveries).toHaveLength(1);
   await expect(command(submit(original,ids))).rejects.toThrow('CONFLICT');
   await expect(command(decision(p,'changes','   '))).rejects.toThrow('CHANGE_REASON_REQUIRED');
   p=piece(await command(decision(p,'changes','Cambiar título','client')));
   expect(p).toMatchObject({status:'production',workArea:'design',productionStage:'ready'});
   expect(p.deliveries![0]).toMatchObject({comment:'Cambiar título',source:'client',status:'changes'});
   p=piece(await command({type:'update-piece',pieceId:p.id,expectedRevision:p.revision,patch:{caption:'Texto v2'}}));
   p=piece(await command(submit(p,ids)));
   expect(p.deliveries?.map(d=>[d.version,d.caption,d.status])).toEqual([[2,'Texto v2','pending'],[1,'Texto v1','changes']]);
 });
 it('approves current version, permits scheduling, and returns approved work for client changes',async()=>{
   let {p,ids}=await setup();p=piece(await command(submit(p,ids)));
   await expect(command({type:'update-piece',pieceId:p.id,expectedRevision:p.revision,patch:{caption:'Bypass'}})).rejects.toThrow('DELIVERY_LOCKED');
   await expect(command({type:'update-piece',pieceId:p.id,expectedRevision:p.revision,patch:{status:'production'}})).rejects.toThrow('DELIVERY_LOCKED');
   p=piece(await command(decision(p,'approved','')));
   p=piece(await command({type:'update-piece',pieceId:p.id,expectedRevision:p.revision,patch:{status:'scheduled'}}));
   expect(p.status).toBe('scheduled');
   p=piece(await command(decision(p,'changes','Cliente pide otro cierre','client')));
   await expect(command({type:'update-piece',pieceId:p.id,expectedRevision:p.revision,patch:{status:'published'}})).rejects.toThrow('APPROVAL_REQUIRED');
   p=piece(await command(submit(p,ids)));p=piece(await command(decision(p,'approved','')));
   p=piece(await command({type:'update-piece',pieceId:p.id,expectedRevision:p.revision,patch:{status:'published'}}));
   expect(p.status).toBe('published');
   await expect(command(decision(p,'changes','Late change'))).rejects.toThrow('INVALID_TRANSITION');
 });
 it('rejects empty, foreign, unverified, duplicate assets and invalid review IDs',async()=>{
   const {p,ids}=await setup();const other=await setup();
   for(const list of [[],[randomUUID()],[ids[0],ids[0]],[other.ids[0]]])await expect(command(submit(p,list))).rejects.toThrow('DELIVERY_FILES_REQUIRED');
   const pending=piece(await command(submit(p,ids)));
   await expect(command({...decision(pending),deliveryId:randomUUID()})).rejects.toThrow('CONFLICT');
   await expect(command({...decision(pending),source:'unknown'})).rejects.toThrow('VALIDATION');
 });
 it('denies customer commands and direct reads of internal delivery feedback',async()=>{
   const {p,ids}=await setup();await expect(command(submit(p,ids),randomUUID(),'00000000-0000-4000-8000-000000000002')).rejects.toThrow('forbidden');
   for(const role of ['anon','authenticated']){
     await db.exec(`set role ${role}`);
     try{await expect(db.query('select * from app_private.deliveries')).rejects.toMatchObject({code:'42501'});await expect(db.query('select app_private.piece_deliveries($1)',[p.id])).rejects.toMatchObject({code:'42501'});}
     finally{await db.exec('reset role');}
   }
 });
});
