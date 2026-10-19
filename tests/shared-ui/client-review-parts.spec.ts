import { expect, test, type BrowserContext } from '@playwright/test';
import type { PilotRequest, PilotView } from '../../contracts/client-pilot';
const token='a'.repeat(43),C='20000000-0000-4000-8000-000000000001',P='30000000-0000-4000-8000-000000000001',R='40000000-0000-4000-8000-000000000001';
async function setup(context:BrowserContext){
 const request:PilotRequest={id:R,pieceId:P,kind:'delivery',version:2,text:'',caption:'Un nuevo espacio para acompañarte.\nConsultanos para conocer más.',separateParts:true,contentStatus:'pending',captionStatus:'pending',assets:[{id:'50000000-0000-4000-8000-000000000001',name:'entrega.webm',mimeType:'video/webm',size:100}],status:'pending',canRespond:true,comment:'',comments:[],createdAt:'2026-10-19T12:00:00Z'};
 const view:PilotView={client:{id:C,name:'Estudio Horizonte · ficticio',initials:'EH',color:'#8b2634'},pieces:[{id:P,title:'Presentación del estudio · prueba ficticia',format:'reel',plannedDate:'2026-10-28',status:'review'}],requests:[request]};
 const writes:Record<string,string>[]=[],receipts=new Map<string,PilotView>();let lose=false,reads=0;
 await context.route('**/api/client/view',route=>{reads++;return route.fulfill({json:view});});
 await context.route('**/api/client/media/**',route=>route.fulfill({status:404}));
 await context.route('**/api/client/respond',route=>{
   const data=route.request().postDataJSON();writes.push(data);
   if(!receipts.has(data.key)){
     if(data.decision==='comment')request.comments.push({text:data.comment,author:data.author,createdAt:'2026-10-19T12:00:00Z'});
     else{
       if(data.part==='content')request.contentStatus=data.decision;else request.captionStatus=data.decision;
       if(data.decision==='changes'){request.status='changes';request.comment=`${data.part==='caption'?'Caption':'Entrega'}: ${data.comment}`;request.canRespond=false;view.pieces[0].status='production';}
       else if(request.contentStatus==='approved'&&(!request.captionStatus||request.captionStatus==='approved')){request.status='approved';request.canRespond=false;view.pieces[0].status='approved';}
     }
     receipts.set(data.key,structuredClone(view));
     if(lose){lose=false;return route.abort('failed');}
   }
   return route.fulfill({json:receipts.get(data.key)});
 });
 return {request,view,writes,get reads(){return reads;},loseOnce(){lose=true;}};
}
test('video and caption each have actions underneath; both acceptances are needed',async({page,context})=>{
 const s=await setup(context);await page.goto(`/cliente#${token}/${R}`);page.on('dialog',d=>d.accept());
 const delivery=page.getByRole('region',{name:'Entrega',exact:true}),caption=page.getByRole('region',{name:'Caption',exact:true});
 await expect(delivery.locator('video')).toHaveAttribute('controls','');await expect(delivery.locator('video')).toHaveAttribute('src',`/api/client/media/${C}/${R}/${s.request.assets[0].id}`);
 expect((await delivery.getByRole('button',{name:'Aceptar entrega'}).boundingBox())!.y).toBeGreaterThan((await delivery.locator('video').boundingBox())!.y);
 await expect(caption).toContainText(s.request.caption!);await expect(page.getByRole('textbox')).toHaveCount(0);
 await delivery.getByRole('button',{name:'Aceptar entrega',exact:true}).click();await expect(delivery.getByText('Aceptado',{exact:true})).toBeVisible();expect(s.view.pieces[0].status).toBe('review');
 await expect(caption.getByRole('button',{name:'Aceptar caption',exact:true})).toBeVisible();await caption.getByRole('button',{name:'Aceptar caption',exact:true}).click();expect(s.view.pieces[0].status).toBe('approved');
 expect(s.writes.map(w=>w.part)).toEqual(['content','caption']);await expect(page.getByRole('button',{name:'Volver a mis contenidos',exact:true})).toHaveClass(/button secondary/);
 await page.getByRole('button',{name:'Volver a mis contenidos',exact:true}).click();await expect(page.getByRole('heading',{name:'Tus contenidos'})).toBeVisible();
});
test('caption changes open a required text field; an uncertain response blocks other decisions and retries identically',async({page,context})=>{
 const s=await setup(context);s.loseOnce();await page.setViewportSize({width:390,height:844});await page.goto(`/cliente#${token}/${R}`);
 const caption=page.getByRole('region',{name:'Caption',exact:true});await expect(caption.getByRole('textbox')).toHaveCount(0);
 await caption.getByRole('button',{name:'Solicitar cambios',exact:true}).click();await expect(caption.getByLabel('Cambios en caption')).toBeFocused();await expect(caption.getByRole('button',{name:'Enviar cambios',exact:true})).toBeDisabled();
 await caption.getByLabel('Cambios en caption').fill('Cambiar la última frase');await caption.getByRole('button',{name:'Enviar cambios',exact:true}).click();
 await expect(page.getByRole('button',{name:'Reintentar la misma respuesta',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Aceptar entrega',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Volver a mis contenidos',exact:true})).toBeDisabled();
 const reads=s.reads;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));expect(s.reads).toBe(reads);
 await page.getByRole('button',{name:'Reintentar la misma respuesta',exact:true}).click();await expect(page.getByText('Caption: Cambiar la última frase',{exact:true})).toBeVisible();
 expect(s.writes).toHaveLength(2);expect(s.writes[0]).toEqual(s.writes[1]);expect(s.view.pieces[0].status).toBe('production');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'work/client-review-caption-mobile.png',fullPage:true});
});
test('script and caption are shown together; commenting does not accept either part',async({page,context})=>{
 const s=await setup(context);Object.assign(s.request,{kind:'script',text:'Guion público para grabar el reel.',assets:[]});s.view.pieces[0].status='planned';await page.goto(`/cliente#${token}/${R}`);
 const script=page.getByRole('region',{name:'Guion',exact:true});await expect(script).toContainText('Guion público para grabar el reel.');await expect(page.getByRole('region',{name:'Caption',exact:true})).toContainText(s.request.caption!);
 await script.getByRole('button',{name:'Sólo comentar',exact:true}).click();await script.getByLabel('Comentario',{exact:true}).fill('¿Podemos usar un ejemplo?');await script.getByRole('button',{name:'Enviar comentario',exact:true}).click();
 expect(s.request.contentStatus).toBe('pending');expect(s.request.captionStatus).toBe('pending');expect(s.view.pieces[0].status).toBe('planned');expect(s.writes[0]).toMatchObject({part:'content',decision:'comment'});
 await page.screenshot({path:'work/client-review-script-caption.png',fullPage:true});
});
