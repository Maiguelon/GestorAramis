import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import type {Command,Piece,WorkspaceState} from '../../contracts/domain';
const U='f0000000-0000-4000-8000-000000000001',M='10000000-0000-4000-8000-000000000001',P='20000000-0000-4000-8000-000000000001',C='30000000-0000-4000-8000-000000000001';
async function setup(context:BrowserContext){
 const encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const token=`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:U,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})}.FAKE_SIGNATURE`;
 const user={id:U,aud:'authenticated',role:'authenticated',email:'editor@example.test',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:new Date().toISOString()};
 const piece:Piece={id:P,clientId:C,title:'Texto de prueba ficticia',format:'reel',status:'planned',ownerId:M,plannedDate:'2026-11-02',visibleToClient:false,caption:'Caption guardado',script:'Guion guardado',internalNote:'Nota interna intacta',archived:false,revision:1,createdAt:'2026-10-27T12:00:00Z',updatedAt:'2026-10-27T12:00:00Z'};
 const state:WorkspaceState={schemaVersion:1,clients:[{id:C,name:'Estudio Horizonte · ficticio',initials:'EH',color:'#8b2634',contactName:'Ana',phone:''}],members:[{id:M,name:'Miguel',initials:'M'}],pieces:[piece],reviews:[],materials:[],responses:[],activities:[],shares:[]};
 const operations:{command:Command;requestId:string}[]=[],receipts=new Map<string,unknown>();let lose=false;
 const snapshot=()=>({state,memberId:M,workspaceId:'fixture',workspaceName:'Aramis pruebas'});
 await context.route('https://shared-ui-test.supabase.co/auth/v1/**',r=>r.fulfill({json:r.request().url().includes('/token')?{access_token:token,refresh_token:'FAKE',token_type:'bearer',expires_in:3600,user}:user}));
 await context.route('**/api/workspace',r=>r.fulfill({json:snapshot()}));
 await context.route('**/api/commands',r=>{
   const data=r.request().postDataJSON();operations.push(data);
   if(receipts.has(data.requestId))return r.fulfill({json:receipts.get(data.requestId)});
   const c=data.command;if(c.type!=='update-piece')throw new Error('Unexpected command');
   if(c.expectedRevision!==piece.revision)return r.fulfill({status:409,json:{code:'CONFLICT'}});
   Object.assign(piece,c.patch,{revision:piece.revision+1});const result=structuredClone({...snapshot(),entityId:P});receipts.set(data.requestId,result);
   if(lose){lose=false;return r.abort('failed');}return r.fulfill({json:result});
 });
 return {piece,operations,loseOnce(){lose=true;}};
}
async function open(page:Page){await page.goto(`/text/${P}`);await page.getByLabel('Correo',{exact:true}).fill('editor@example.test');await page.getByLabel('Contraseña',{exact:true}).fill('fixture-password');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page.getByRole('heading',{name:'Texto de prueba ficticia',exact:true})).toBeVisible();}
test('wide editor saves only changed text with Ctrl S, stays visible on long content and survives reload',async({page,context})=>{
 const s=await setup(context);await open(page);await expect(page.getByRole('textbox')).toHaveCount(0);await page.getByRole('button',{name:'Editar',exact:true}).click();
 const script=page.getByLabel('Guion e instrucciones',{exact:true});await expect(script).toBeFocused();await script.fill(Array.from({length:60},(_,i)=>`Escena ${i+1}: texto para grabar.`).join('\n'));await page.getByLabel('Caption',{exact:true}).fill('Caption actualizado');await page.keyboard.press('ControlOrMeta+s');
 await expect(page.getByText('Cambios guardados.',{exact:true})).toBeVisible();expect(s.operations).toHaveLength(1);expect(s.operations[0].command).toMatchObject({expectedRevision:1,patch:{caption:'Caption actualizado'}});expect(Object.keys((s.operations[0].command as Extract<Command,{type:'update-piece'}>).patch).sort()).toEqual(['caption','script']);expect(s.piece.internalNote).toBe('Nota interna intacta');
 await script.press('ControlOrMeta+End');const button=page.getByRole('button',{name:'Guardar cambios',exact:true});const rect=await button.boundingBox();expect(rect!.y).toBeGreaterThanOrEqual(0);expect(rect!.y+rect!.height).toBeLessThanOrEqual(720);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'work/piece-text-editor-mobile.png',fullPage:false});
 await page.reload();await expect(page.getByRole('textbox')).toHaveCount(0);await expect(page.getByText('Caption actualizado',{exact:true})).toBeVisible();expect(s.operations).toHaveLength(1);
});
test('concurrent edits keep the local draft and require explicit reload before another save',async({page,context})=>{
 const s=await setup(context);await open(page);await page.getByRole('button',{name:'Editar',exact:true}).click();const script=page.getByLabel('Guion e instrucciones',{exact:true});await script.fill('Mi borrador local');s.piece.script='Versión de otra persona';s.piece.revision++;
 await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await expect(page.getByRole('button',{name:'Cargar datos actuales',exact:true})).toBeVisible();await expect(script).toHaveValue('Mi borrador local');expect(s.piece.script).toBe('Versión de otra persona');await expect(page.getByRole('button',{name:'Guardar cambios',exact:true})).toBeDisabled();
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Cargar datos actuales',exact:true}).click();await expect(script).toHaveValue('Mi borrador local');
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Cargar datos actuales',exact:true}).click();await expect(script).toHaveValue('Versión de otra persona');expect(s.operations).toHaveLength(1);
});
test('lost confirmation recovers the exact saved operation after reload and blocks conflicting edits',async({page,context})=>{
 const s=await setup(context);s.loseOnce();await open(page);await page.getByRole('button',{name:'Editar',exact:true}).click();await page.getByLabel('Guion e instrucciones',{exact:true}).fill('Texto con respuesta perdida');await page.keyboard.press('ControlOrMeta+s');
 await expect(page.getByRole('button',{name:'Reintentar guardado',exact:true})).toBeVisible();await expect(page.getByLabel('Guion e instrucciones',{exact:true})).toBeDisabled();
 page.once('dialog',d=>d.accept());await page.reload();await page.getByRole('button',{name:'Reintentar guardado',exact:true}).click();await expect(page.getByText('Cambios guardados.',{exact:true})).toBeVisible();expect(s.operations).toHaveLength(2);expect(s.operations[0]).toEqual(s.operations[1]);expect(s.piece.revision).toBe(2);await expect(page.getByLabel('Guion e instrucciones',{exact:true})).toHaveValue('Texto con respuesta perdida');
});
test('reviewed captions stay read-only, script edits preserve the exact delivery and story has one text field',async({page,context})=>{
 const s=await setup(context);s.piece.status='review';s.piece.deliveries=[{id:'final',version:1,caption:s.piece.caption,assets:[],status:'pending',createdBy:'Diseño',createdAt:'2026-10-27T12:00:00Z',comment:'',source:null,decidedBy:null,decidedAt:null}];await open(page);await page.getByRole('button',{name:'Editar',exact:true}).click();await expect(page.getByLabel('Caption',{exact:true})).toHaveAttribute('readonly','');await page.getByLabel('Guion e instrucciones',{exact:true}).fill('Sólo las instrucciones cambian');await page.keyboard.press('ControlOrMeta+s');await expect(page.getByText('Cambios guardados.',{exact:true})).toBeVisible();expect(s.piece.deliveries[0].caption).toBe('Caption guardado');expect((s.operations[0].command as Extract<Command,{type:'update-piece'}>).patch).toEqual({script:'Sólo las instrucciones cambian'});
 s.piece.format='story';s.piece.status='planned';s.piece.deliveries=[];s.piece.revision++;await page.reload();await page.getByRole('button',{name:'Editar',exact:true}).click();await expect(page.getByRole('textbox')).toHaveCount(1);await page.getByLabel('Contenido de la historia',{exact:true}).fill('Slide 1\nSlide 2');await page.keyboard.press('ControlOrMeta+s');await expect(page.getByText('Cambios guardados.',{exact:true})).toBeVisible();expect(s.piece.caption).toBe('Slide 1\nSlide 2');expect((s.operations[1].command as Extract<Command,{type:'update-piece'}>).patch).toEqual({caption:'Slide 1\nSlide 2'});
});
test('cancel and leaving protect unsaved text; archiving keeps a dirty draft available to copy',async({page,context})=>{
 const s=await setup(context);await open(page);await page.getByRole('button',{name:'Editar',exact:true}).click();const script=page.getByLabel('Guion e instrucciones',{exact:true});await script.fill('No perder este texto');
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(script).toHaveValue('No perder este texto');
 page.once('dialog',d=>d.dismiss());await page.getByRole('link',{name:'Panel',exact:true}).click();await expect(script).toHaveValue('No perder este texto');
 const closing=page.waitForEvent('dialog');await page.close({runBeforeUnload:true});const prompt=await closing;expect(prompt.type()).toBe('beforeunload');await prompt.dismiss();await expect(script).toHaveValue('No perder este texto');
 s.piece.archived=true;s.piece.revision++;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByText('La pieza fue archivada. Podés copiar tu borrador, pero no guardar cambios.',{exact:true})).toBeVisible();await expect(script).toHaveValue('No perder este texto');await expect(page.getByRole('button',{name:'Guardar cambios',exact:true})).toBeDisabled();expect(s.operations).toHaveLength(0);
});
