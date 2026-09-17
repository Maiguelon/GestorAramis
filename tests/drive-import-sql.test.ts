// @vitest-environment node
import {beforeAll,afterAll,it,expect,describe} from 'vitest';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const W='10000000-0000-4000-8000-000000000001',U='00000000-0000-4000-8000-000000000001',P='40000000-0000-4000-8000-000000000001',G='60000000-0000-4000-8000-000000000001';
const f={id:'external-clip',name:'prueba_drive.mp4',mimeType:'video/mp4',size:10,checksum:'a'.repeat(32)};
describe('External material SQL reconciliation, local PostgreSQL',()=>{
  let db:PGlite;let tick=0;
  const time=()=>new Date(Date.now()-100000+(++tick)*1000).toISOString();
  async function sync(files:unknown[],user=U,folder='piece-folder',at=time()){
    await db.exec('set role service_role');
    try{return (await db.query<{value:{changed:boolean}}>('select public.aramis_drive_import($1,$2,$3,$4,$5,$6,$7) value',[W,user,P,folder,G,at,JSON.stringify(files)])).rows[0].value;}
    finally{await db.exec('reset role');}
  }
  const assets=async()=> (await db.query<{value:Record<string,unknown>[]}>('select public.aramis_drive($1,$2,$3,$4) value',[W,U,'list-assets',JSON.stringify({pieceId:P})])).rows[0].value;
  beforeAll(async()=>{
    db=new PGlite();
    for(const path of ['supabase/tests/bootstrap.sql','supabase/migrations/202609060001_initial.sql','supabase/tests/fixtures.sql','supabase/migrations/202609080001_shared_workspace.sql','supabase/migrations/202609100001_drive_team.sql','supabase/migrations/202609140001_drive_import.sql','supabase/migrations/202609160001_drive_trash.sql'])await db.exec(await readFile(path,'utf8'));
    await db.query('select public.aramis_drive($1,$2,$3,$4)',[W,U,'connection-save',JSON.stringify({expectedGeneration:null,generation:G,encryptedTokens:{iv:Array(12).fill(1),ciphertext:Array(32).fill(2)},accountEmail:'test@example.test',accountPermissionId:'account',rootFolderId:null})]);
    await db.query('select public.aramis_drive($1,$2,$3,$4)',[W,U,'folder-put',JSON.stringify({logicalKey:'piece:'+P,folderId:'piece-folder'})]);
  },30000);
  afterAll(async()=>{await db?.close();});
  it('adds external material once without changing production status',async()=>{
    const before=await db.query<{status:string;revision:number}>('select status,revision from public.pieces where id=$1',[P]);
    expect(await sync([f])).toEqual({changed:true});
    const added=await assets();expect(added).toHaveLength(1);expect(added[0]).toMatchObject({external:true,name:f.name,folderId:'piece-folder'});
    expect(await sync([f])).toEqual({changed:false});
    const after=await db.query<{status:string;revision:number}>('select status,revision from public.pieces where id=$1',[P]);
    expect(after.rows[0].status).toBe(before.rows[0].status);expect(after.rows[0].revision).toBe(Number(before.rows[0].revision)+1);
  });
  it('updates names/content, hides removed files and reuses the same asset on restoration',async()=>{
    const original=(await assets())[0].id;
    await sync([{...f,name:'renamed.mp4',size:20,checksum:'b'.repeat(32)}]);
    expect((await assets())[0]).toMatchObject({name:'renamed.mp4',size:20});
    await sync([]);expect(await assets()).toHaveLength(0);
    expect((await db.query<{value:unknown}>('select public.aramis_drive($1,$2,$3,$4) value',[W,U,'get-asset',JSON.stringify({assetId:original})])).rows[0].value).toBeNull();
    await sync([f]);expect((await assets())[0].id).toBe(original);
  });
  it('rejects unrelated folders and users, and rolls back malformed snapshots',async()=>{
    await expect(sync([f],U,'other-folder')).rejects.toThrow('FOLDER_NOT_FOUND');
    await expect(sync([f],'00000000-0000-4000-8000-000000000002')).rejects.toThrow('FORBIDDEN');
    await expect(sync([{...f,name:'should-not-save'}, {...f,id:'bad',size:-1}])).rejects.toThrow('VALIDATION');
    expect((await assets())[0].name).toBe(f.name);
  });
  it('ignores a stale listing rather than undoing a newer synchronization',async()=>{
    const old=time();await sync([f]);expect(await sync([],U,'piece-folder',old)).toEqual({changed:false});expect(await assets()).toHaveLength(1);
  });
  it('is inaccessible to browser database roles',async()=>{
    for(const role of ['anon','authenticated']){
      await db.exec('set role '+role);
      try{await expect(db.query('select public.aramis_drive_import($1,$2,$3,$4,$5,$6,$7)',[W,U,P,'piece-folder',G,time(),'[]'])).rejects.toMatchObject({code:'42501'});}
      finally{await db.exec('reset role');}
    }
  });
  it('trashes idempotently, preserves the piece status and ignores an older folder snapshot',async()=>{
    const id=(await assets())[0].id;
    const before=(await db.query<{status:string;revision:number}>('select status,revision from public.pieces where id=$1',[P])).rows[0];
    const trash=async(user=U)=> (await db.query<{value:{changed:boolean}}>('select public.aramis_drive_trash($1,$2,$3,$4) value',[W,user,id,G])).rows[0].value;
    await expect(trash('00000000-0000-4000-8000-000000000002')).rejects.toThrow('FORBIDDEN');
    expect(await trash()).toEqual({changed:true});expect(await assets()).toHaveLength(0);
    expect(await trash()).toEqual({changed:false});
    await sync([f]);expect(await assets()).toHaveLength(0);
    const after=(await db.query<{status:string;revision:number}>('select status,revision from public.pieces where id=$1',[P])).rows[0];
    expect(after.status).toBe(before.status);expect(after.revision).toBe(before.revision+1);
    for(const role of ['anon','authenticated']){
      await db.exec('set role '+role);
      try{await expect(trash()).rejects.toMatchObject({code:'42501'});}finally{await db.exec('reset role');}
    }
  });

});
