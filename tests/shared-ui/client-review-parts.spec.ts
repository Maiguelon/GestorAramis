import { expect, test, type BrowserContext } from '@playwright/test';
import type { PilotRequest, PilotView } from '../../contracts/client-pilot';
const token='a'.repeat(43),C='20000000-0000-4000-8000-000000000001',P='30000000-0000-4000-8000-000000000001',R='40000000-0000-4000-8000-000000000001';
async function setup(context:BrowserContext){
 const request:PilotRequest={id:R,pieceId:P,kind:'delivery',version:2,text:'',caption:'Un nuevo espacio para acompañarte.\nConsultanos para conocer más.',separateParts:true,contentStatus:'pending',captionStatus:'pending',assets:[{id:'50000000-0000-4000-8000-000000000001',name:'entrega.webm',mimeType:'video/webm',size:100}],status:'pending',canRespond:true,comment:'',comments:[],createdAt:'2026-10-19T12:00:00Z'};
 const view:PilotView={client:{id:C,name:'Estudio Horizonte · ficticio',initials:'EH',color:'#8b2634'},pieces:[{id:P,title:'Presentación del estudio · prueba ficticia',format:'reel',plannedDate:'2026-10-28',status:'review'}],requests:[request]};
 const writes:any[]=[],receipts=new Map<string,PilotView>();let lose=false,reads=0;
 await context.route('**/api/client/view',route=>{reads++;return route.fulfill({json:view});});
 await context.route('**/api/client/media/**',route=>route.fulfill({status:404}));
 await context.route('**/api/client/respond',route=>{
   const data=route.request().postDataJSON();writes.push(data);
   if(!receipts.has(data.key)){
     for(const a of data.answers){
       if(a.decision==='comment')request.comments.push({text:a.comment,author:data.author,createdAt:'2026-10-24T12:00:00Z'});
       else {if(a.part==='content')request.contentStatus=a.decision;else request.captionStatus=a.decision;if(a.decision==='changes')request.comment=`${a.part==='caption'?'Caption':'Entrega'}: ${a.comment}`;}
     }
     request.status=request.contentStatus==='changes'||request.captionStatus==='changes'?'changes':request.contentStatus==='approved'&&request.captionStatus==='approved'?'approved':'pending';
     request.canRespond=request.contentStatus==='pending'||request.captionStatus==='pending';
     if(request.status==='changes')view.pieces[0].status='production';else if(request.status==='approved'&&request.kind==='delivery')view.pieces[0].status='approved';
     receipts.set(data.key,structuredClone(view));
     if(lose){lose=false;return route.abort('failed');}
   }
   return route.fulfill({json:receipts.get(data.key)});
 });
 return {request,view,writes,get reads(){return reads;},loseOnce(){lose=true;}};
}

const region=(page:import('@playwright/test').Page,label:string)=>page.getByRole('region',{name:label,exact:true});
test('both approvals stay local until one Send review; the server receives one exact batch',async({page,context})=>{
 const s=await setup(context);await page.goto(`/cliente#${token}/${R}`);
 await region(page,'Entrega').getByRole('button',{name:'Aceptar entrega',exact:true}).click();await region(page,'Caption').getByRole('button',{name:'Aceptar caption',exact:true}).click();
 await expect(region(page,'Caption')).toContainText('Aprobado · sin enviar');expect(s.writes).toHaveLength(0);
 await page.getByRole('button',{name:'Enviar revisión',exact:true}).click();await expect(page.getByText(/Revisión enviada al equipo/)).toBeVisible();expect(s.writes).toHaveLength(1);expect(s.writes[0].answers.map((a:any)=>a.part)).toEqual(['content','caption']);expect(s.view.pieces[0].status).toBe('approved');
});
test('saved correction survives reload, warns about untouched video and can finish that video later',async({page,context})=>{
 const s=await setup(context);await page.setViewportSize({width:390,height:844});await page.goto(`/cliente#${token}/${R}`);
 const caption=region(page,'Caption');await caption.getByRole('button',{name:'Solicitar cambios',exact:true}).click();await caption.getByLabel('Cambios en caption').fill('Acortar el cierre');await caption.getByRole('button',{name:'Guardar corrección',exact:true}).click();expect(s.writes).toHaveLength(0);
 await page.reload();await expect(caption).toContainText('Corrección guardada · sin enviar');await page.getByRole('button',{name:'Enviar revisión',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Entrega sigue sin revisar');expect(s.writes).toHaveLength(0);
 await page.getByRole('button',{name:'Seguir revisando',exact:true}).click();await page.getByRole('button',{name:'Enviar revisión',exact:true}).click();await page.getByRole('button',{name:'Enviar de todos modos',exact:true}).click();await expect(page.getByText(/Revisión enviada al equipo/)).toBeVisible();expect(s.request.canRespond).toBe(true);
 await region(page,'Entrega').getByRole('button',{name:'Aceptar entrega',exact:true}).click();await page.getByRole('button',{name:'Enviar revisión',exact:true}).click();await expect(page.getByRole('button',{name:'Aceptar entrega',exact:true})).toHaveCount(0);expect(s.request.status).toBe('changes');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'work/client-review-batch-mobile.png',fullPage:true});
});
test('an uncertain response recovers the exact UUID and body after reload even when the server closed the review',async({page,context})=>{
 const s=await setup(context);s.loseOnce();await page.goto(`/cliente#${token}/${R}`);
 await region(page,'Entrega').getByRole('button',{name:'Aceptar entrega',exact:true}).click();await region(page,'Caption').getByRole('button',{name:'Aceptar caption',exact:true}).click();await page.getByRole('button',{name:'Enviar revisión',exact:true}).click();
 await expect(page.getByRole('button',{name:'Reintentar la misma respuesta',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Volver a mis contenidos',exact:true})).toBeDisabled();
 await page.reload();await page.getByRole('button',{name:'Reintentar la misma respuesta',exact:true}).click();await expect(page.getByText(/Revisión enviada al equipo/)).toBeVisible();expect(s.writes).toHaveLength(2);expect(s.writes[0]).toEqual(s.writes[1]);
});
test('comments remain distinct, unfinished edits block sending and a new version does not inherit a draft',async({page,context})=>{
 const s=await setup(context);Object.assign(s.request,{kind:'script',text:'Guion público',assets:[]});await page.goto(`/cliente#${token}/${R}`);
 const script=region(page,'Guion');await script.getByRole('button',{name:'Sólo comentar',exact:true}).click();await script.getByLabel('Comentario',{exact:true}).fill('¿Usamos un ejemplo?');await expect(page.getByRole('button',{name:'Enviar revisión',exact:true})).toBeDisabled();await script.getByRole('button',{name:'Guardar comentario',exact:true}).click();
 await region(page,'Caption').getByRole('button',{name:'Aceptar caption',exact:true}).click();await page.getByRole('button',{name:'Enviar revisión',exact:true}).click();await expect(page.getByText(/Revisión enviada al equipo/)).toBeVisible();expect(s.request.contentStatus).toBe('pending');expect(s.request.captionStatus).toBe('approved');
 await script.getByRole('button',{name:'Aceptar guion',exact:true}).click();s.request.version++;await page.reload();await expect(script).not.toContainText('Aprobado · sin enviar');await expect(page.getByRole('button',{name:'Enviar revisión',exact:true})).toBeDisabled();
});
