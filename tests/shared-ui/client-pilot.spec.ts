import { test, expect, type BrowserContext } from '@playwright/test';
import type { PilotView, PilotStaffView } from '../../contracts/client-pilot';
import type { Piece, WorkspaceState } from '../../contracts/domain';
const token='a'.repeat(43),C='20000000-0000-4000-8000-000000000001',P='30000000-0000-4000-8000-000000000001',R='40000000-0000-4000-8000-000000000001';
function fixture():PilotView{return {client:{id:C,name:'Estudio Horizonte · ficticio',initials:'EH',color:'#8b2634'},pieces:[{id:P,title:'Cuidados de primavera',format:'reel',plannedDate:'2026-10-28',status:'planned'},{id:P+'2',title:'Otra fecha',format:'post',plannedDate:'2026-11-04',status:'production'}],requests:[{id:R,pieceId:P,kind:'script',version:1,text:'Un consejo simple para esta primavera.\nVisitá nuestro espacio.',assets:[],status:'pending',canRespond:true,comment:'',comments:[],createdAt:'2026-10-19T12:00:00Z'}]};}
async function publicMock(context:BrowserContext){
 let view=fixture(),revoked=false,lose=false;const writes:unknown[]=[];const receipts=new Map<string,unknown>();
 await context.route('**/api/client/view',route=>route.fulfill({status:revoked?403:200,json:revoked?{code:'INVALID_ACCESS'}:view}));
 await context.route('**/api/client/respond',route=>{
   const data=route.request().postDataJSON();writes.push(data);const r=view.requests.find(r=>r.id===data.requestId)!;
   if(!receipts.has(data.key)){
     if(data.decision==='comment')r.comments.push({text:data.comment,author:data.author,createdAt:new Date().toISOString()});
     else {r.status=data.decision;r.canRespond=false;r.comment=data.comment;}
     receipts.set(data.key,structuredClone(view));
     if(lose){lose=false;return route.abort('failed');}
   }
   return route.fulfill({json:receipts.get(data.key)});
 });
 return {get view(){return view;},writes,revoke(){revoked=true;},loseOnce(){lose=true;}};
}
test('client enters without staff login, comments then approves only the script, across calendar months',async({page,context})=>{
 const service=await publicMock(context);await page.goto(`/cliente#${token}`);
 await expect(page.getByRole('heading',{name:'Tus contenidos'})).toBeVisible();await expect(page.getByLabel('Correo',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Calendario',exact:true}).click();await page.getByLabel('Mes del calendario').fill('2026-11');await expect(page.getByText('Otra fecha',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:/Para revisar/}).click();await page.getByRole('button',{name:/Cuidados de primavera/}).click();
 await page.getByLabel('Comentario',{exact:true}).fill('¿Usamos un tono cercano?');await page.getByRole('button',{name:'Sólo comentar',exact:true}).click();
 await expect(page.getByText('Comentario enviado. La revisión sigue pendiente.')).toBeVisible();expect(service.view.requests[0].status).toBe('pending');
 page.on('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Aprobar guion',exact:true}).click();await expect(page.getByText('Aprobación registrada.')).toBeVisible();
 expect(service.view.pieces[0].status).toBe('planned');expect(service.writes).toHaveLength(2);
});
test('lost response retries the identical request and does not duplicate the decision',async({page,context})=>{
 const service=await publicMock(context);service.loseOnce();await page.goto(`/cliente#${token}/${R}`);
 await page.getByLabel('Comentario',{exact:true}).fill('Cambiar el ejemplo final');await page.getByRole('button',{name:'Pedir cambios',exact:true}).click();
 await expect(page.getByRole('button',{name:'Reintentar la misma respuesta',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Reintentar la misma respuesta',exact:true}).click();await expect(page.getByText('Cambios enviados al equipo.')).toBeVisible();
 expect(service.writes).toHaveLength(2);expect(service.writes[0]).toEqual(service.writes[1]);
});
test('mobile pending/calendar stay within the viewport and a revoked link closes on refresh',async({page,context})=>{
 const service=await publicMock(context);await page.setViewportSize({width:390,height:844});await page.goto(`/cliente#${token}`);
 await expect(page.getByRole('heading',{name:'Tus contenidos'})).toBeVisible();await page.screenshot({path:'work/client-pilot-mobile.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Calendario',exact:true}).click();await page.getByLabel('Mes del calendario').fill('2026-10');
 await expect(page.locator('.pilot-month-grid')).toBeVisible();await page.getByRole('button',{name:/28 de octubre, 1 pieza/}).click();await expect(page.getByRole('region',{name:'Contenidos del día'}).getByText('Cuidados de primavera',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 service.revoke();await page.getByLabel('Actualizar contenidos').click();await expect(page.getByRole('heading',{name:'Este enlace no está disponible'})).toBeVisible();
 await expect(page.getByText('Cuidados de primavera',{exact:true})).toHaveCount(0);
});

test('calendar-only pieces appear on entry, with access to other months and undated pieces',async({page,context})=>{
 await page.clock.setFixedTime(new Date('2026-10-19T15:00:00Z'));
 const service=await publicMock(context);service.view.requests=[];
 service.view.pieces[0].plannedDate='2026-09-28';service.view.pieces[1].plannedDate='2026-10-16';
 service.view.pieces.push({id:'undated',title:'Contenido sin fecha',format:'story',status:'planned',plannedDate:null});
 await page.goto(`/cliente#${token}`);
 await expect(page.getByRole('button',{name:'Calendario',exact:true})).toHaveAttribute('aria-current','page');
 await expect(page.locator('.pilot-month-grid')).toBeVisible();await expect(page.getByText('Otra fecha',{exact:true})).toBeVisible();
 await expect(page.getByText('Contenido sin fecha',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'septiembre de 2026 (1)',exact:true}).click();await expect(page.getByText('Cuidados de primavera',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:/Para revisar/}).click();await expect(page.getByText('No tenés revisiones pendientes. Podés consultar el calendario.')).toBeVisible();
 await page.getByRole('button',{name:'Ver calendario (3)',exact:true}).click();await expect(page.locator('.pilot-month-grid')).toBeVisible();expect(service.writes).toHaveLength(0);
});

test('a calendar with only past content opens its populated month; a busy day stays fixed and opens by keyboard on mobile',async({page,context})=>{
 await page.clock.setFixedTime(new Date('2026-10-19T15:00:00Z'));
 const service=await publicMock(context);service.view.requests=[];
 service.view.pieces=Array.from({length:9},(_,i)=>({id:`piece-${i}`,title:`Contenido ${i+1} con título largo para este día`,format:'post',status:'production',plannedDate:'2026-09-28'}));
 await page.setViewportSize({width:390,height:844});await page.goto(`/cliente#${token}`);
 await expect(page.getByLabel('Mes del calendario')).toHaveValue('2026-09');
 const busy=page.getByRole('button',{name:/28 de septiembre, 9 piezas/}),other=page.getByRole('button',{name:/29 de septiembre, 0 piezas/});
 expect((await busy.boundingBox())?.height).toBe((await other.boundingBox())?.height);
 await busy.focus();await page.keyboard.press('Enter');await expect(page.getByRole('region',{name:'Contenidos del día'}).getByText('Contenido 9 con título largo para este día',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'work/client-calendar-mobile-fixed.png',fullPage:true});
});
test('final review uses only client media routes and requires a comment for changes',async({page,context})=>{
 const service=await publicMock(context);Object.assign(service.view.requests[0],{kind:'delivery',text:'Caption de la entrega',assets:[{id:'50000000-0000-4000-8000-000000000001',name:'final.png',mimeType:'image/png',size:12}]});
 await context.route('**/api/client/media/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6pAAAAABJRU5ErkJggg==','base64')}));
 await page.goto(`/cliente#${token}/${R}`);await expect(page.getByRole('img',{name:'final.png'})).toBeVisible();
 await page.getByRole('button',{name:'Pedir cambios',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Escribí un comentario');expect(service.writes).toHaveLength(0);
 await page.screenshot({path:'work/client-pilot-review.png',fullPage:true});
});

test('a delayed refresh cannot overwrite a decision already confirmed by the client',async({page,context})=>{
 const view=fixture();let hold=false,release=()=>{},held=false;
 await context.route('**/api/client/view',async route=>{
   const snapshot=structuredClone(view);
   if(hold){held=true;await new Promise<void>(resolve=>{release=resolve;});}
   await route.fulfill({json:snapshot});
 });
 await context.route('**/api/client/respond',route=>{view.requests[0].status='approved';view.requests[0].canRespond=false;return route.fulfill({json:view});});
 await page.goto(`/cliente#${token}/${R}`);await expect(page.getByRole('button',{name:'Aprobar guion',exact:true})).toBeVisible();
 hold=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>held).toBe(true);
 page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'Aprobar guion',exact:true}).click();await expect(page.getByText('Aprobación registrada.')).toBeVisible();
 release();await expect(page.getByRole('button',{name:'Aprobar guion',exact:true})).toHaveCount(0);
});

