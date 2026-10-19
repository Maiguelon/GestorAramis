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
 await page.getByRole('button',{name:'Calendario',exact:true}).click();await page.getByLabel('Mes del calendario').fill('2026-10');await page.getByLabel('Vista del calendario').selectOption('month');
 await page.locator('.pilot-month-grid details').filter({hasText:'1 pieza'}).first().locator('summary').click();await expect(page.getByText('Cuidados de primavera',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 service.revoke();await page.getByLabel('Actualizar contenidos').click();await expect(page.getByRole('heading',{name:'Este enlace no está disponible'})).toBeVisible();
 await expect(page.getByText('Cuidados de primavera',{exact:true})).toHaveCount(0);
});
test('final review uses only client media routes and requires a comment for changes',async({page,context})=>{
 const service=await publicMock(context);Object.assign(service.view.requests[0],{kind:'delivery',text:'Caption de la entrega',assets:[{id:'50000000-0000-4000-8000-000000000001',name:'final.png',mimeType:'image/png',size:12}]});
 await context.route('**/api/client/media/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6pAAAAABJRU5ErkJggg==','base64')}));
 await page.goto(`/cliente#${token}/${R}`);await expect(page.getByRole('img',{name:'final.png'})).toBeVisible();
 await page.getByRole('button',{name:'Pedir cambios',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Escribí un comentario');expect(service.writes).toHaveLength(0);
 await page.screenshot({path:'work/client-pilot-review.png',fullPage:true});
});

