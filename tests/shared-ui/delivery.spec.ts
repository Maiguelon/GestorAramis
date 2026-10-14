import {test,expect,type BrowserContext} from '@playwright/test';
import type {Piece,WorkspaceState,Delivery} from '../../contracts/domain';
import type {DriveAsset} from '../../src/lib/drive-api';
const userId='f0000000-0000-4000-8000-000000000001',memberId='10000000-0000-4000-8000-000000000001',pieceId='20000000-0000-4000-8000-000000000001';
const encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
const token=`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:userId,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})}.FAKE_SIGNATURE`;
const user={id:userId,aud:'authenticated',role:'authenticated',email:'test@example.test',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:new Date().toISOString()};
async function setup(context:BrowserContext){
 const p:Piece={id:pieceId,clientId:'client',title:'Reel de entrega',format:'reel',status:'production',workArea:'design',productionStage:'editing',ownerId:memberId,plannedDate:'2026-09-30',caption:'Texto de la primera versión',internalNote:'Nota general',script:'Guion',archived:false,visibleToClient:false,revision:1,createdAt:'2026-09-01T12:00:00Z',updatedAt:'2026-09-01T12:00:00Z'};
 const state:WorkspaceState={schemaVersion:1,clients:[{id:'client',name:'Cliente prueba',initials:'CP',color:'#1b2a41',contactName:'',phone:''}],members:[{id:memberId,name:'Eliana',initials:'E'}],pieces:[p],reviews:[],materials:[],responses:[],activities:[],shares:[]};
 const assets:DriveAsset[]=[];let conflict=false;let failUpload=false;let loseUndo=false;
 const undoAttempts:Array<{requestId:string;command:unknown}>=[];
 const undoReceipts=new Map<string,unknown>();
 const snapshot=()=>({state,memberId,workspaceId:'workspace-remote',workspaceName:'Aramis prueba'});
 await context.route('https://shared-ui-test.supabase.co/auth/v1/**',route=>route.fulfill({json:route.request().url().includes('/token')?{access_token:token,refresh_token:'FAKE',token_type:'bearer',expires_in:3600,user}:user}));
 await context.route('**/api/workspace',route=>route.fulfill({json:snapshot()}));
 await context.route('**/api/commands',route=>{
   const {command:c,requestId}=route.request().postDataJSON();
   if(c.type==='undo-approval'){
     undoAttempts.push({requestId,command:c});
     if(undoReceipts.has(requestId))return route.fulfill({json:undoReceipts.get(requestId)});
   }
   if(conflict){conflict=false;return route.fulfill({status:409,json:{code:'CONFLICT'}});}
   if(c.type==='submit-delivery'){
     const d:Delivery={id:crypto.randomUUID(),version:(p.deliveries?.[0]?.version??0)+1,status:'pending',caption:p.caption,assets:c.assetIds.map((id:string)=>assets.find(a=>a.id===id)),createdAt:new Date().toISOString(),createdBy:'Eliana',comment:'',source:null,decidedBy:null,decidedAt:null};
     p.deliveries=[d,...p.deliveries??[]];p.status='review';p.workArea='marketing';
   }else if(c.type==='review-delivery'){
     Object.assign(p.deliveries![0],{status:c.decision,comment:c.comment,source:c.source,decidedBy:'Miguel',decidedAt:new Date().toISOString()});
     p.status=c.decision==='changes'?'production':'approved';p.workArea=c.decision==='changes'?'design':'marketing';p.productionStage='ready';
   }else if(c.type==='undo-approval'){
     if(p.revision!==c.expectedRevision||p.deliveries?.[0]?.id!==c.approvalId)return route.fulfill({status:409,json:{code:'CONFLICT'}});
     if(p.status!=='approved')return route.fulfill({status:409,json:{code:'INVALID_TRANSITION'}});
     Object.assign(p.deliveries![0],{status:'pending',comment:'',source:null,decidedBy:null,decidedAt:null});
     p.status='review';p.workArea='marketing';
   }else if(c.type==='update-piece')Object.assign(p,c.patch);
   p.revision++;const result={...snapshot(),entityId:p.id};
   if(c.type==='undo-approval'){
     undoReceipts.set(requestId,structuredClone(result));
     if(loseUndo){loseUndo=false;return route.abort('failed');}
   }
   return route.fulfill({json:result});
 });
 await context.route('**/api/drive/**',route=>{
   const url=new URL(route.request().url());
   if(url.pathname.endsWith('/status'))return route.fulfill({json:{configured:true,connected:true,canImport:false}});
   if(url.pathname.endsWith('/media-session'))return route.fulfill({json:{ok:true}});
   if(url.pathname.endsWith('/assets')||url.pathname.endsWith('/delivery-assets'))return route.fulfill({json:{assets:url.pathname.endsWith('/delivery-assets')?assets:[],folderUrl:'https://drive.google.com/drive/folders/fixture'}});
   if(url.pathname.endsWith('/uploads')){
     if(failUpload)return route.fulfill({status:503,json:{code:'service_unavailable'}});
     const input=route.request().postDataJSON();expect(input.purpose).toBe('delivery');
     const asset:DriveAsset={id:input.uploadId,name:input.name,size:input.size,mimeType:input.mimeType,source:'drive',purpose:'delivery'};assets.push(asset);return route.fulfill({json:{asset}});
   }
   if(url.pathname.endsWith('/content'))return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6pAAAAABJRU5ErkJggg==','base64')});
   return route.fulfill({status:404,json:{code:'not_found'}});
 });
 return {p,assets,undoAttempts,loseUndoOnce(){loseUndo=true;},rejectOnce(){conflict=true;},failUpload(value:boolean){failUpload=value;}};
}
test('accidental approval can be cancelled or undone and recovers a lost response without another version',async({page,context})=>{
 const service=await setup(context);
 const approved:Delivery={id:'40000000-0000-4000-8000-000000000001',version:1,status:'approved',caption:service.p.caption,assets:[{id:'50000000-0000-4000-8000-000000000001',name:'final.mov',mimeType:'video/quicktime',size:12,source:'drive'}],createdAt:'2026-09-30T12:00:00Z',createdBy:'Eliana',comment:'OK original',source:'team',decidedBy:'Eric',decidedAt:'2026-09-30T14:00:00Z'};
 service.p.status='approved';service.p.workArea='marketing';service.p.deliveries=[approved];
 const original=structuredClone(service.p);
 await page.goto('/?piece='+pieceId);await page.getByLabel('Correo',{exact:true}).fill('test@example.test');await page.getByLabel('Contraseña',{exact:true}).fill('FAKE');await page.getByRole('button',{name:'Ingresar',exact:true}).click();
 const undo=page.getByRole('button',{name:'Deshacer aprobación',exact:true});await expect(undo).toBeVisible();
 page.once('dialog',dialog=>dialog.dismiss());await undo.click();expect(service.undoAttempts).toHaveLength(0);expect(service.p).toEqual(original);
 service.loseUndoOnce();page.once('dialog',dialog=>dialog.accept());await undo.click();
 await expect(page.getByRole('dialog').getByRole('button',{name:'Reintentar guardado',exact:true})).toBeVisible();
 await page.reload();await page.getByRole('dialog').getByRole('button',{name:'Reintentar guardado',exact:true}).click();
 await expect(undo).toHaveCount(0);expect(service.undoAttempts).toHaveLength(2);expect(service.undoAttempts[0]).toEqual(service.undoAttempts[1]);
 expect(service.p).toMatchObject({status:'review',workArea:'marketing',revision:original.revision+1,caption:original.caption});
 expect(service.p.deliveries).toEqual([{...original.deliveries![0],status:'pending',comment:'',source:null,decidedBy:null,decidedAt:null}]);
 await page.getByRole('tab',{name:'Entrega',exact:true}).click();await expect(page.getByRole('heading',{name:'Entrega v1 · En revisión',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Pedir cambios y volver a producción',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Aprobar entrega',exact:true}).click();expect(service.p.status).toBe('approved');expect(service.p.deliveries).toHaveLength(1);
 await page.setViewportSize({width:390,height:844});await expect(undo).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await undo.scrollIntoViewIfNeeded();await page.screenshot({path:'work/undo-approval-mobile.png',fullPage:true});
});

test('delivery upload → review → changes visible in Design → new version → approval; mobile and reload',async({page,context})=>{
 const service=await setup(context);
 await page.goto('/');await page.getByLabel('Correo',{exact:true}).fill('test@example.test');await page.getByLabel('Contraseña',{exact:true}).fill('FAKE');await page.getByRole('button',{name:'Ingresar',exact:true}).click();
 await page.getByLabel('Vista de trabajo',{exact:true}).selectOption('design');
 await page.getByRole('button',{name:'Entrega',exact:true}).click();
 await expect(page.getByRole('tab',{name:'Entrega',exact:true})).toHaveAttribute('data-state','active');
 const send=page.getByRole('button',{name:'Enviar a revisión',exact:true});await expect(send).toBeDisabled();
 await page.getByLabel('Subir archivos terminados',{exact:true}).setInputFiles([{name:'final-1.png',mimeType:'image/png',buffer:Buffer.from('first')},{name:'final-2.png',mimeType:'image/png',buffer:Buffer.from('second')}]);
 await page.getByLabel('Incluir final-1.png en la entrega',{exact:true}).check();await page.getByLabel('Incluir final-2.png en la entrega',{exact:true}).check();
 await page.getByRole('button',{name:'Subir archivo 2',exact:true}).click();
 service.rejectOnce();await send.click();await expect(page.getByRole('alert').first()).toContainText(/cambi|actualiz/i);await expect(send).toBeEnabled();
 await send.click();await expect(page.getByRole('heading',{name:'Entrega v1 · En revisión',exact:true})).toBeVisible();expect(service.p.deliveries![0].assets[0].name).toBe('final-2.png');
 const changes=page.getByRole('button',{name:'Pedir cambios y volver a producción',exact:true});await expect(changes).toBeDisabled();
 await page.getByLabel('Origen de la respuesta').selectOption('client');await page.getByLabel('Comentario / motivo de los cambios').fill('Cambiar el cierre y agregar el logo.');await changes.click();
 await expect(page.locator('.delivery-changes').first()).toContainText('Cambiar el cierre y agregar el logo.');
 await page.getByRole('button',{name:'Cerrar',exact:true}).click();
 await expect(page.locator('.design-task')).toContainText('Cambios solicitados');await expect(page.locator('.design-task')).toContainText('Cambiar el cierre');
 await page.getByRole('button',{name:'Entrega',exact:true}).click();await page.getByLabel('Incluir final-1.png en la entrega',{exact:true}).check();await send.click();
 await expect(page.getByRole('heading',{name:'Entrega v2 · En revisión',exact:true})).toBeVisible();
 await page.getByText('Versiones anteriores (1)',{exact:true}).click();await page.getByText('Entrega v1',{exact:true}).click();await expect(page.getByRole('heading',{name:'Entrega v1 · Cambios solicitados',exact:true})).toBeVisible();
 await page.setViewportSize({width:390,height:844});await expect(page.getByRole('button',{name:'Aprobar entrega',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'work/delivery-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Aprobar entrega',exact:true}).click();expect(service.p.status).toBe('approved');
 await page.getByRole('tab',{name:'Detalles',exact:true}).click();await expect(page.getByRole('textbox',{name:'Caption',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Marcar como programado',exact:true})).toHaveCount(0);expect(service.p.status).toBe('approved');
 await page.reload();expect(service.p.deliveries).toHaveLength(2);
});
