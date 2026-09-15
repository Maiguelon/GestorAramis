// @vitest-environment node
import {describe,it,expect,vi} from 'vitest';
import {listImportFiles} from '../server/drive-import';
import {streamDriveAsset} from '../server/drive';

const file={id:'clip',name:'clip.mp4',mimeType:'video/mp4',size:'10',md5Checksum:'a'.repeat(32),parents:['folder'],trashed:false};
describe('Drive external material, provider contracts (not live Google)',()=>{
  it('reads all pages of 122 clips in the bound folder without copying them',async()=>{
    const fetcher=vi.fn(async(input:RequestInfo|URL)=>{
      const url=new URL(String(input));
      expect(url.searchParams.get('q')).toBe("'folder' in parents and trashed=false");
      return Response.json(url.searchParams.has('pageToken')?{files:Array.from({length:22},(_,i)=>({...file,id:'clip'+(i+100)}))}:{files:Array.from({length:100},(_,i)=>({...file,id:'clip'+i})),nextPageToken:'next'});
    });
    expect((await listImportFiles('token','folder',fetcher)).files).toHaveLength(122);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([{incompleteSearch:true,files:[]},{files:[{...file,parents:['other']}]},{files:[{...file,trashed:true}]}])('rejects incomplete or out-of-folder listings',async body=>{
    await expect(listImportFiles('token','folder',async()=>Response.json(body))).rejects.toThrow();
  });
  it('does not return a partial snapshot after a later page fails',async()=>{
    let calls=0;
    await expect(listImportFiles('token','folder',async()=>++calls===1?Response.json({files:[file],nextPageToken:'next'}):new Response('',{status:503}))).rejects.toThrow();
  });
  it('excludes shortcuts, incomplete uploads and oversized files without following them',async()=>{
    const result=await listImportFiles('token','folder',async()=>Response.json({files:[file,{...file,id:'shortcut',mimeType:'application/vnd.google-apps.shortcut'},{...file,id:'pending',md5Checksum:undefined},{...file,id:'large',size:String(3*1024**3)}]}));
    expect(result.files).toHaveLength(1);expect(result.skipped).toBe(3);
  });
  const asset={driveFileId:'clip',name:'clip.mp4',mimeType:'video/mp4',size:10,workspaceId:'w',clientId:'c',checksum:'a'.repeat(32),folderId:'folder',external:true};
  it('streams an external file without app tags only inside its persisted folder',async()=>{
    const fetcher=vi.fn(async(input:RequestInfo|URL)=>String(input).includes('alt=media')?new Response('0123456789',{headers:{'Content-Type':'video/mp4','Content-Length':'10'}}):Response.json(file));
    expect(await (await streamDriveAsset('token',asset,null,fetcher)).text()).toBe('0123456789');
  });
  it.each([{parents:['outside']},{trashed:true},{md5Checksum:'b'.repeat(32)}])('refuses moved, trashed or changed media before serving bytes',async patch=>{
    const fetcher=vi.fn(async()=>Response.json({...file,...patch}));
    await expect(streamDriveAsset('token',asset,null,fetcher)).rejects.toMatchObject({code:'asset_changed_or_inaccessible'});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not relax original app-owned media authorization',async()=>{
    await expect(streamDriveAsset('token',{...asset,external:false},null,async()=>Response.json(file))).rejects.toMatchObject({code:'asset_changed_or_inaccessible'});
  });
});
