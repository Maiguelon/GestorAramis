// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import type { Piece, WorkspaceState } from '../contracts/domain';

const W='10000000-0000-4000-8000-000000000001', U='00000000-0000-4000-8000-000000000001';
const A='20000000-0000-4000-8000-000000000001', B='20000000-0000-4000-8000-000000000002', FOREIGN='20000000-0000-4000-8000-000000000003';
type Envelope = {state:WorkspaceState;entityId:string};
const piece = (value:Envelope) => value.state.pieces.find(piece => piece.id === value.entityId)!;
describe('multiclient pieces in isolated PostgreSQL', () => {
  let db:PGlite, prior:WorkspaceState;
  async function asUser<T>(sql:string,params:unknown[]=[],user=U) {
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${user}'`);
    try { return (await db.query<{value:T}>(sql,params)).rows[0]?.value; }
    finally { await db.exec('reset role; reset request.jwt.claim.sub'); }
  }
  const command = (value:unknown,key=randomUUID(),user=U) => asUser<Envelope>('select public.aramis_command($1,$2,$3) value',[W,JSON.stringify(value),key],user);
  const snapshot = async () => (await asUser<Envelope>('select public.aramis_workspace($1) value',[W])).state;
  const create = (extra:Record<string,unknown>={}) => command({type:'create-piece',input:{clientId:A,clientIds:[A,B],title:'Efeméride sintética',format:'post',planMonth:'2028-01',...extra}});
  beforeAll(async () => {
    db=new PGlite();await db.exec(await readFile('supabase/tests/bootstrap.sql','utf8'));
    for (const file of (await readdir('supabase/migrations')).sort()) {
      if(file === '202610180001_multi_client_pieces.sql') prior = await snapshot();
      await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
      if(file === '202609060001_initial.sql') await db.exec(await readFile('supabase/tests/fixtures.sql','utf8'));
    }
  },30_000);
  afterAll(async () => { await db?.close(); });

  it('preserves every old piece and has no recipient backfill or workflow mutation', async () => {
    expect(await snapshot()).toEqual(prior);
    expect((await db.query('select * from app_private.piece_clients')).rows).toHaveLength(0);
  });
  it('creates a single piece with ordered recipients and idempotent replay', async () => {
    const payload={type:'create-piece',input:{clientId:B,clientIds:[B,A],title:'Una tarea compartida'}};
    const key=randomUUID(), result=await command(payload,key), p=piece(result);
    expect(p).toMatchObject({clientId:B,clientIds:[B,A],status:'planned',visibleToClient:false});
    expect(piece(await command(payload,key))).toEqual(p);
    expect(result.state.pieces.filter(row=>row.id===p.id)).toHaveLength(1);
    expect(result.state.activities.filter(row=>row.pieceId===p.id)).toHaveLength(1);
    expect((await db.query('select * from app_private.piece_clients where piece_id=$1',[p.id])).rows).toHaveLength(2);
    await expect(command({...payload,input:{...payload.input,clientIds:[A,B]}},key)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  });
  it('rejects duplicate, missing, malformed, retired and foreign clients without partial inserts', async () => {
    const retired=randomUUID();
    await db.query("insert into public.clients(id,workspace_id,name,archived_at) values($1,$2,'Retirado',now())",[retired,W]);
    const before=(await snapshot()).pieces.length;
    for (const clientIds of [[],null,{},[A,A],[B,A],[A,FOREIGN],[A,retired],[A,'invalid'],[A,12],[A,randomUUID()]]) {
      await expect(create({clientIds})).rejects.toThrow('VALIDATION');
    }
    expect((await snapshot()).pieces).toHaveLength(before);
  });
  it('shares one status and one notification event, with all names available for the digest', async () => {
    const p=piece(await create());
    const result=await command({type:'update-piece',pieceId:p.id,expectedRevision:p.revision,patch:{status:'production'}});
    expect(piece(result)).toMatchObject({clientIds:[A,B],status:'production',workArea:'design',revision:p.revision+1});
    expect((await db.query('select * from app_private.notification_events where piece_id=$1',[p.id])).rows).toHaveLength(1);
    expect((await db.query<{names:string}>('select app_private.piece_client_names($1) names',[p.id])).rows[0].names).toBe('Cliente A, Cliente B');
    await expect(command({type:'update-piece',pieceId:p.id,expectedRevision:piece(result).revision,patch:{visibleToClient:true}})).rejects.toThrow('FEATURE_UNAVAILABLE');
  });
  it('keeps shared extras from reducing the generated monthly base for either client', async () => {
    await create({planMonth:'2028-02'});
    for(const clientId of [A,B]) {
      await db.query('update public.client_plans set posts=1,reels=0 where client_id=$1',[clientId]);
      const result=await command({type:'generate-month',clientId,month:'2028-02'});
      expect(result.state.pieces.filter(p=>p.clientId===clientId&&p.planMonth==='2028-02'&&!p.clientIds)).toHaveLength(1);
    }
  });
  it('denies client users and direct table or helper access', async () => {
    await expect(command({type:'create-piece',input:{clientId:A,clientIds:[A,B]}},randomUUID(),'00000000-0000-4000-8000-000000000002')).rejects.toMatchObject({code:'42501'});
    await expect(asUser('select count(*) value from app_private.piece_clients')).rejects.toMatchObject({code:'42501'});
    await expect(asUser('select app_private.check_piece_clients($1,$2) value',[W,JSON.stringify({clientId:A,clientIds:[A,B]})])).rejects.toMatchObject({code:'42501'});
  });
});
