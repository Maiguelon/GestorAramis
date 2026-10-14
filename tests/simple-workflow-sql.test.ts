// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import type { Piece, WorkspaceState } from '../contracts/domain';

const W='10000000-0000-4000-8000-000000000001',U='00000000-0000-4000-8000-000000000001',C='20000000-0000-4000-8000-000000000001';
type Envelope={state:WorkspaceState;entityId:string};
const target=(value:Envelope)=>value.state.pieces.find(piece=>piece.id===value.entityId)!;

describe('simple workflow migration and undo approval in isolated PostgreSQL',()=>{
  let db:PGlite, waiting:Piece, archived:Piece, design:Piece, eventsBefore:number;
  async function command(value:unknown,key=randomUUID(),user=U,workspace=W){
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${user}'`);
    try{return (await db.query<{value:Envelope}>('select public.aramis_command($1,$2,$3) value',[workspace,JSON.stringify(value),key])).rows[0].value;}
    finally{await db.exec('reset role; reset request.jwt.claim.sub');}
  }
  async function snapshot(){
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${U}'`);
    try{return (await db.query<{value:Envelope}>('select public.aramis_workspace($1) value',[W])).rows[0].value.state;}
    finally{await db.exec('reset role; reset request.jwt.claim.sub');}
  }
  const create=async()=>target(await command({type:'create-piece',input:{clientId:C,title:'Fixture workflow',planMonth:'2026-10'}}));
  const edit=async(p:Piece,patch:unknown)=>target(await command({type:'update-piece',pieceId:p.id,expectedRevision:p.revision,patch}));
  const eventCount=async()=>(await db.query<{n:number}>('select count(*)::int n from app_private.notification_events')).rows[0].n;
  beforeAll(async()=>{
    db=new PGlite();await db.exec(await readFile('supabase/tests/bootstrap.sql','utf8'));
    for(const file of (await readdir('supabase/migrations')).sort()){
      if(file==='202610130001_simple_production_undo_approval.sql')continue;
      await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
      if(file==='202609060001_initial.sql')await db.exec(await readFile('supabase/tests/fixtures.sql','utf8'));
    }
    waiting=await edit(await create(),{status:'production',workArea:'marketing',productionStage:'recording',caption:'Texto anterior',script:'Grabar tomas'});
    archived=await edit(await create(),{status:'production',workArea:'marketing',productionStage:'recording',archived:true});
    design=await edit(await create(),{status:'production',workArea:'design',productionStage:'ready'});
    eventsBefore=await eventCount();
    await db.exec(await readFile('supabase/migrations/202610130001_simple_production_undo_approval.sql','utf8'));
  },30_000);
  afterAll(async()=>{await db?.close();});

  it('moves legacy preparation to Planning once and preserves archived work, dates and content',async()=>{
    const state=await snapshot();
    expect(state.pieces.find(p=>p.id===waiting.id)).toEqual({...waiting,status:'planned',workArea:'marketing',productionStage:'ready',revision:waiting.revision+1,updatedAt:expect.any(String)});
    expect(state.pieces.find(p=>p.id===archived.id)).toEqual(archived);
    expect(state.pieces.find(p=>p.id===design.id)).toEqual(design);
    expect(await eventCount()).toBe(eventsBefore);
    expect(state.activities.filter(item=>item.pieceId===waiting.id&&item.text.includes('integradas a Planificación'))).toHaveLength(1);
    expect((await snapshot()).pieces).toEqual(state.pieces);
  });

  it('enters Design directly, returns to Marketing and maps old recording commands to Planning',async()=>{
    let p=await create();
    p=await edit(p,{status:'production'});expect(p).toMatchObject({status:'production',workArea:'design',productionStage:'ready'});
    p=await edit(p,{status:'planned'});expect(p).toMatchObject({status:'planned',workArea:'marketing',productionStage:'ready'});
    p=await edit(p,{productionStage:'recording'});expect(p).toMatchObject({status:'planned',workArea:'marketing',productionStage:'ready'});
  });

  async function approved(){
    let p=await create();p=await edit(p,{caption:'Caption exacto',script:'Guion privado'});
    const id=randomUUID(),assets=[{id:randomUUID(),name:'final.mov',mimeType:'video/quicktime',size:12,source:'drive'}];
    // Trusted synthetic snapshot metadata; this test never contacts Google or claims a real upload.
    await db.query("insert into app_private.deliveries(id,workspace_id,piece_id,version,caption,assets,status,created_by,comment,source,decided_by,decided_at) values($1,$2,$3,1,$4,$5,'approved','Eliana','OK original','team','Eric',now())",[id,W,p.id,p.caption,JSON.stringify(assets)]);
    await db.query("update public.pieces set status='approved',revision=revision+1 where id=$1",[p.id]);
    await db.query("insert into public.activity(workspace_id,client_id,piece_id,text,actor) values($1,$2,$3,'Entrega aprobada en v1 (equipo): OK original','Eric')",[W,C,p.id]);
    return (await snapshot()).pieces.find(item=>item.id===p.id)!;
  }
  const undo=(p:Piece)=>({type:'undo-approval',pieceId:p.id,expectedRevision:p.revision,approvalId:p.deliveries![0].id});
  it('undoes exactly once without changing the snapshot, keeps audit and permits another explicit review',async()=>{
    const original=await approved(),payload=undo(original),key=randomUUID();
    let p=target(await command(payload,key));
    expect(p).toMatchObject({status:'review',workArea:'marketing',revision:original.revision+1,caption:original.caption,script:original.script});
    expect(p.deliveries).toEqual([{...original.deliveries![0],status:'pending',comment:'',source:null,decidedBy:null,decidedAt:null}]);
    expect(target(await command(payload,key))).toEqual(p);
    const log=(await snapshot()).activities.filter(item=>item.pieceId===p.id);
    expect(log.some(item=>item.text.includes('OK original'))).toBe(true);
    expect(log.filter(item=>item.text.includes('deshecha'))).toHaveLength(1);
    await expect(edit(p,{caption:'Bypass'})).rejects.toThrow('DELIVERY_LOCKED');
    await expect(edit(p,{status:'scheduled'})).rejects.toThrow('APPROVAL_REQUIRED');
    await expect(command({...payload,expectedRevision:p.revision})).rejects.toThrow('INVALID_TRANSITION');
    p=target(await command({type:'review-delivery',pieceId:p.id,expectedRevision:p.revision,deliveryId:payload.approvalId,decision:'approved',comment:'Revisado otra vez',source:'team'}));
    expect(p.status).toBe('approved');expect(p.deliveries).toHaveLength(1);expect(p.deliveries![0].assets).toEqual(original.deliveries![0].assets);
  });

  it('rejects stale, wrong-version, customer and foreign-workspace corrections without changing approval',async()=>{
    const p=await approved(),payload=undo(p);
    await expect(command({...payload,expectedRevision:p.revision-1})).rejects.toThrow('CONFLICT');
    await expect(command({...payload,approvalId:randomUUID()})).rejects.toThrow('CONFLICT');
    await expect(command(payload,randomUUID(),'00000000-0000-4000-8000-000000000002')).rejects.toMatchObject({code:'42501'});
    await expect(command(payload,randomUUID(),U,'10000000-0000-4000-8000-000000000002')).rejects.toMatchObject({code:'42501'});
    expect((await snapshot()).pieces.find(item=>item.id===p.id)).toEqual(p);
    await db.exec('set role authenticated');
    try{await expect(db.query('select app_private.undo_approval_command($1,$2,$3)',[W,JSON.stringify(payload),'Fake actor'])).rejects.toMatchObject({code:'42501'});}
    finally{await db.exec('reset role');}
  });
});
