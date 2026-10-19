import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import type { PilotStaffView } from '../../contracts/client-pilot';
import type { Piece, WorkspaceState } from '../../contracts/domain';

const token='a'.repeat(43), C='20000000-0000-4000-8000-000000000001', P='30000000-0000-4000-8000-000000000001';
async function setup(context:BrowserContext) {
  const U='f0000000-0000-4000-8000-000000000001', M='10000000-0000-4000-8000-000000000001';
  const encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
  const jwt=`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:U,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})}.FAKE_SIGNATURE`;
  const user={id:U,aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:new Date().toISOString()};
  const piece:Piece={id:P,clientId:C,title:'Guion del piloto',format:'reel',status:'planned',ownerId:M,plannedDate:'2026-10-28',visibleToClient:false,caption:'Caption privado',script:'Indicaciones privadas para Diseño',internalNote:'No compartir',archived:false,revision:1,createdAt:'2026-10-19T12:00:00Z',updatedAt:'2026-10-19T12:00:00Z'};
  const client={id:C,name:'Estudio Horizonte · ficticio',initials:'EH',color:'#8b2634',contactName:'Ana',phone:'5491112345678'};
  const state:WorkspaceState={schemaVersion:1,clients:[client],members:[{id:M,name:'Miguel',initials:'M'}],pieces:[piece],reviews:[],materials:[],responses:[],activities:[],shares:[]};
  let view:PilotStaffView={client,pieces:[],requests:[],linkActive:false},lose=false;
  const actions:Record<string,unknown>[]=[], receipts=new Map<string,PilotStaffView>();
  const calendarPiece=()=>({id:piece.id,title:piece.title,format:piece.format,plannedDate:piece.plannedDate,status:piece.status});
  await context.route('https://shared-ui-test.supabase.co/auth/v1/**',route=>route.fulfill({json:route.request().url().includes('/token')?{access_token:jwt,refresh_token:'FAKE',token_type:'bearer',expires_in:3600,user}:user}));
  await context.route('**/api/workspace',route=>route.fulfill({json:{state,memberId:M,workspaceId:'fixture',workspaceName:'Aramis piloto'}}));
  await context.route('**/api/client-pilot/staff',route=>{
    const data=route.request().postDataJSON();actions.push(data);
    if(data.key&&receipts.has(data.key))return route.fulfill({json:receipts.get(data.key)});
    if(data.action==='calendar-show')view={...view,pieces:[calendarPiece()]};
    if(data.action==='calendar-hide')view={...view,pieces:[],requests:[]};
    if(data.action==='publish')view={...view,pieces:[calendarPiece()],requests:[{id:'request',pieceId:P,kind:'script',version:1,text:data.text,separateParts:true,caption:piece.caption,contentStatus:data.text?'pending':null,captionStatus:piece.caption?'pending':null,assets:[],status:'pending',canRespond:true,comment:'',comments:[],createdAt:'2026-10-19T12:00:00Z'}]};
    if(data.key)receipts.set(data.key,structuredClone(view));
    if(data.action==='publish'&&lose){lose=false;return route.abort('failed');}
    return route.fulfill({json:view});
  });
  await context.route('**/api/client/view',route=>route.fulfill({json:{client:view.client,pieces:view.pieces,requests:view.requests}}));
  return {piece,state,actions,loseOnce(){lose=true;}};
}
async function login(page:Page) {
  await page.goto('/');await page.getByLabel('Correo',{exact:true}).fill('fixture@example.test');await page.getByLabel('Contraseña',{exact:true}).fill('test-password');await page.getByRole('button',{name:'Ingresar',exact:true}).click();
}

test('one publication button below the tabs shares the curated script and caption with the calendar',async({page,context})=>{
  const service=await setup(context);await login(page);
  await page.getByRole('button',{name:'Abrir Guion del piloto',exact:true}).click();const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('checkbox',{name:/Mostrar en el calendario del cliente/})).toHaveCount(0);
  await dialog.getByRole('tab',{name:'Cliente',exact:true}).click();await expect(dialog.getByLabel('Texto que verá el cliente')).toHaveValue(service.piece.script!);
  const publish=dialog.getByRole('button',{name:'Actualizar vista del cliente',exact:true});
  expect((await publish.boundingBox())!.y).toBeGreaterThan((await dialog.getByRole('tablist').boundingBox())!.y);
  await dialog.getByLabel('Texto que verá el cliente').fill('Guion preparado sólo para el cliente');page.on('dialog',d=>d.accept());await publish.click();
  await expect(dialog.getByText('Guion v1 · Pendiente',{exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:'Ocultar del cliente',exact:true})).toBeVisible();
  expect(service.actions.find(a=>a.action==='publish')).toMatchObject({text:'Guion preparado sólo para el cliente',separateParts:true,kind:'script'});expect(service.piece.status).toBe('planned');
  await dialog.screenshot({path:'work/client-review-unified-staff.png'});
});

test('unified publication retries identically, persists on reload, and does not expose an unsubmitted draft',async({page,context})=>{
  const service=await setup(context);service.loseOnce();await login(page);
  await page.getByRole('button',{name:'Abrir Guion del piloto',exact:true}).click();const dialog=page.getByRole('dialog');
  await dialog.getByRole('tab',{name:'Cliente',exact:true}).click();page.on('dialog',d=>d.accept());
  await dialog.getByLabel('Texto que verá el cliente').fill('Guion para publicar');await dialog.getByRole('button',{name:'Actualizar vista del cliente',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Reintentar la misma operación',exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:'Actualizar vista del cliente',exact:true})).toBeDisabled();
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(dialog.getByRole('button',{name:'Reintentar la misma operación',exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'Reintentar la misma operación',exact:true}).click();await expect(dialog.getByRole('button',{name:'Ocultar del cliente',exact:true})).toBeVisible();
  const writes=service.actions.filter(a=>a.action==='publish');expect(writes).toHaveLength(2);expect(writes[0]).toEqual(writes[1]);
  await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();await page.reload();await page.getByRole('button',{name:'Abrir Guion del piloto',exact:true}).click();await dialog.getByRole('tab',{name:'Cliente',exact:true}).click();
  const client=await context.newPage();await client.goto(`/cliente#${token}`);
  await client.getByRole('button',{name:/Guion del piloto/}).click();await expect(client.getByRole('region',{name:'Guion',exact:true})).toContainText('Guion para publicar');await expect(client.getByRole('region',{name:'Caption',exact:true})).toContainText('Caption privado');
  await dialog.getByLabel('Texto que verá el cliente').fill('Texto aún privado');await client.reload();await client.getByRole('button',{name:/Guion del piloto/}).click();await expect(client.getByText('Texto aún privado',{exact:true})).toHaveCount(0);await client.close();
});

test('a valid final delivery takes precedence over the script and uses the immutable delivery caption',async({page,context})=>{
  const service=await setup(context);service.piece.status='review';service.piece.deliveries=[{id:'60000000-0000-4000-8000-000000000001',version:2,caption:'Caption de entrega exacta',assets:[{id:'video',name:'entrega.mp4',mimeType:'video/mp4',size:100,source:'drive'}],status:'pending',createdAt:'2026-10-19T12:00:00Z',createdBy:'Diseño',comment:'',source:null,decidedBy:null,decidedAt:null}];
  await login(page);await page.getByRole('button',{name:'Abrir Guion del piloto',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('tab',{name:'Cliente',exact:true}).click();
  await expect(dialog.getByLabel('Texto que verá el cliente')).toHaveCount(0);await expect(dialog.getByText('entrega.mp4',{exact:true})).toBeVisible();await expect(dialog.getByText('Caption de entrega exacta',{exact:true})).toBeVisible();
  page.on('dialog',d=>d.accept());await dialog.getByRole('button',{name:'Actualizar vista del cliente',exact:true}).click();expect(service.actions.find(a=>a.action==='publish')).toMatchObject({kind:'delivery',deliveryId:service.piece.deliveries[0].id,separateParts:true});expect(service.actions.find(a=>a.action==='publish')).not.toHaveProperty('text');
});

test('Design omits the client tab and visibility, including pieces opened from Calendar',async({page,context})=>{
  const service=await setup(context);service.piece.status='production';service.piece.workArea='design';service.piece.productionStage='ready';await login(page);
  await page.getByLabel('Vista de trabajo',{exact:true}).selectOption('design');await page.getByRole('button',{name:'Abrir pieza',exact:true}).click();
  const dialog=page.getByRole('dialog');await expect(dialog.getByRole('tab',{name:'Cliente',exact:true})).toHaveCount(0);await expect(dialog.getByRole('checkbox',{name:/Mostrar en el calendario del cliente/})).toHaveCount(0);
  await expect(dialog.getByRole('tab',{name:'Entrega',exact:true})).toBeVisible();await expect(dialog.getByRole('tab',{name:'Material',exact:true})).toBeVisible();
  await dialog.screenshot({path:'work/client-calendar-header-design.png'});await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();
  await page.getByRole('button',{name:'Calendario',exact:true}).click();await page.getByRole('button',{name:'Abrir Guion del piloto',exact:true}).click();
  await expect(dialog.getByRole('tab',{name:'Cliente',exact:true})).toHaveCount(0);expect(service.actions).toHaveLength(0);
});
