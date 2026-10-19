import type { PilotAction, PilotStaffView, PilotView } from '../../contracts/client-pilot';
import { sharedWorkspace } from './shared-api';

export class PilotError extends Error { constructor(public code:string,message:string){super(message);} }
async function result<T>(response:Response):Promise<T>{
  const value=await response.json().catch(()=>null);
  if(!response.ok){
    const messages:Record<string,string>={CONFLICT:'Esta revisión cambió. Actualizá la página para ver la versión vigente.',INVALID_ACCESS:'El enlace fue renovado o retirado. Pedile uno nuevo a Aramis.',invalid_access:'Este enlace no es válido. Pedile uno nuevo a Aramis.',VALIDATION:'Revisá los datos antes de guardar.',forbidden:'Tu cuenta no tiene acceso a esta operación.',INVALID_TRANSITION:'La pieza ya no está en la etapa de esta revisión.'};
    throw new PilotError(value?.code??'NETWORK',messages[value?.code]??'No pudimos confirmar la operación. Podés reintentar sin duplicarla.');
  }
  return value as T;
}
export async function readPilot(token:string,signal?:AbortSignal):Promise<PilotView>{
  return result(await fetch('/api/client/view',{headers:{Authorization:`Bearer ${token}`},credentials:'same-origin',cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30_000)]):AbortSignal.timeout(30_000)}));
}
export interface PilotResponse {requestId:string;decision:'approved'|'changes'|'comment';comment:string;author:string;key:string;part?:'content'|'caption'}
export async function respondPilot(token:string,payload:PilotResponse):Promise<PilotView>{
  return result(await fetch('/api/client/respond',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(payload),credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(30_000)}));
}
export async function staffPilot(payload:(PilotAction&{key:string})|{action:'staff-view';clientId:string}):Promise<PilotStaffView>{
  return result(await sharedWorkspace.authenticatedFetch('/api/client-pilot/staff',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}));
}
export function pilotReviewLink(base:string,requestId:string){return `${base}/${encodeURIComponent(requestId)}`;}
export function pilotWhatsApp(clientName:string,url:string,count:number,phone=''){
  const text=count?`Hola ${clientName}, tenés ${count} ${count===1?'contenido para revisar':'contenidos para revisar'} de Aramis. Podés verlos y responder acá: ${url}`:`Hola ${clientName}, este es tu calendario de contenidos de Aramis: ${url}`;
  const digits=phone.replace(/\D/g,'');
  return {text,url:`https://wa.me/${digits}?text=${encodeURIComponent(text)}`};
}
