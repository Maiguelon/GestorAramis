import { test, expect, type BrowserContext } from '@playwright/test';
import type { PilotView, PilotStaffView } from '../../contracts/client-pilot';
import type { Piece, WorkspaceState } from '../../contracts/domain';
const token='a'.repeat(43),C='20000000-0000-4000-8000-000000000001',P='30000000-0000-4000-8000-000000000001',R='40000000-0000-4000-8000-000000000001';
function fixture():PilotView{return {client:{id:C,name:'Estudio Horizonte · ficticio',initials:'EH',color:'#8b2634'},pieces:[{id:P,title:'Cuidados de primavera',format:'reel',plannedDate:'2026-10-28',status:'planned'},{id:P+'2',title:'Otra fecha',format:'post',plannedDate:'2026-11-04',status:'production'}],requests:[{id:R,pieceId:P,kind:'script',version:1,text:'Un consejo simple para esta primavera.\nVisitá nuestro espacio.',assets:[],status:'pending',canRespond:true,comment:'',comments:[],createdAt:'2026-10-19T12:00:00Z'}]};}
test('staff publishes a curated script and manages a reusable link; Design flow is untouched',async({page,context})=>{
 const U='f0000000-0000-4000-8000-000000000001',M='10000000-0000-4000-8000-000000000001';
 const encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');const jwt=`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:U,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})}.FAKE_SIGNATURE`;
 const user={id:U,aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:new Date().toISOString()};
 const piece:Piece={id:P,clientId:C,title:'Guion del piloto',format:'reel',status:'planned',ownerId:M,plannedDate:null,visibleToClient:false,caption:'Caption privado',script:'Indicaciones privadas para Diseño',internalNote:'No compartir',archived:false,revision:1,createdAt:'2026-10-19T12:00:00Z',updatedAt:'2026-10-19T12:00:00Z'};
 const state:WorkspaceState={schemaVersion:1,clients:[{id:C,name:'Estudio Horizonte · ficticio',initials:'EH',color:'#8b2634',contactName:'Ana',phone:'5491112345678'}],members:[{id:M,name:'Miguel',initials:'M'}],pieces:[piece],reviews:[],materials:[],responses:[],activities:[],shares:[]};
 let view:PilotStaffView={...fixture(),pieces:[],requests:[],linkActive:false};const actions:Record<string,unknown>[]=[];
 await context.route('https://shared-ui-test.supabase.co/auth/v1/**',route=>route.fulfill({json:route.request().url().includes('/token')?{access_token:jwt,refresh_token:'FAKE',token_type:'bearer',expires_in:3600,user}:user}));
 await context.route('**/api/workspace',route=>route.fulfill({json:{state,memberId:M,workspaceId:'fixture',workspaceName:'Aramis piloto'}}));
 await context.route('**/api/client-pilot/staff',route=>{
   const data=route.request().postDataJSON();actions.push(data);
   if(data.action==='link-ensure')view={...view,linkActive:true,linkUrl:`http://127.0.0.1:5175/cliente#${token}`};
   if(data.action==='publish')view={...view,pieces:[fixture().pieces[0]],requests:[{...fixture().requests[0],text:data.text}]};
   return route.fulfill({json:view});
 });
 await page.goto('/');await page.getByLabel('Correo',{exact:true}).fill('fixture@example.test');await page.getByLabel('Contraseña',{exact:true}).fill('test-password');await page.getByRole('button',{name:'Ingresar',exact:true}).click();
 await page.getByRole('button',{name:'Abrir Guion del piloto',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('tab',{name:'Cliente',exact:true}).click();
 await expect(dialog.getByLabel('Texto que verá el cliente')).toHaveValue('Indicaciones privadas para Diseño');
 await dialog.getByRole('button',{name:'Crear enlace del cliente',exact:true}).click();await expect(dialog.getByLabel('Enlace privado del cliente')).toHaveValue(`http://127.0.0.1:5175/cliente#${token}`);
 await dialog.getByLabel('Texto que verá el cliente').fill('Guion preparado sólo para el cliente');page.on('dialog',d=>d.accept());await dialog.getByRole('button',{name:'Actualizar vista del cliente',exact:true}).click();
 await expect(dialog.getByText('Guion v1 · Pendiente',{exact:true})).toBeVisible();expect(actions.find(a=>a.action==='publish')?.text).toBe('Guion preparado sólo para el cliente');expect(piece.status).toBe('planned');
 await dialog.screenshot({path:'work/client-pilot-staff.png'});
});
