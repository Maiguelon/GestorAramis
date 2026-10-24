import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Download, MessageSquare, Send } from 'lucide-react';
import type { PilotAnswer, PilotBatchResponse, PilotPiece, PilotRequest, PilotView } from '../../contracts/client-pilot';
import { PilotError, respondPilot } from '../lib/client-pilot';
import { dateLabel } from './shared';

type Part = PilotAnswer['part'];
type Draft = { author: string; answers: Partial<Record<Part,PilotAnswer>>; editing: Partial<Record<Part,{decision:'changes'|'comment';text:string}>>; pending?: PilotBatchResponse };
const empty = ():Draft=>({author:'',answers:{},editing:{}});
const labels={pending:'Revisión pendiente',approved:'Aprobado',changes:'Cambios pedidos',superseded:'Revisión cerrada'};

/** No capability is written to storage. Drafts belong to this browser and this exact snapshot. */
export default function ClientReview({request:r,piece,clientId,token,onResult,onPending}:{request:PilotRequest;piece?:PilotPiece;clientId:string;token:string;onResult:(view:PilotView)=>void;onPending:(value:boolean)=>void}){
 const [draft,setDraft]=useState<Draft>(empty),[storageKey,setStorageKey]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[warning,setWarning]=useState(false);
 const state=useRef(draft),sending=useRef(false);
 useEffect(()=>{let active=true;void crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)).then(hash=>{
   if(!active)return;const key=`aramis-review:${Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')}:${r.id}:${r.version}`;
   let restored=empty();try{const text=localStorage.getItem(key);if(text){const v=JSON.parse(text);if(v&&typeof v.author==='string'&&v.answers&&v.editing&&(!v.pending||(v.pending.requestId===r.id&&v.pending.version===r.version)))restored=v;}}catch{setError('No pudimos recuperar el borrador de este navegador.');}
   state.current=restored;setDraft(restored);setStorageKey(key);if(restored.pending)onPending(true);
 });return()=>{active=false;};},[token,r.id,r.version]); // callbacks intentionally excluded: parent renders on each poll
 function store(next:Draft){
   if(!storageKey)return false;
   try{localStorage.setItem(storageKey,JSON.stringify(next));state.current=next;setDraft(next);return true;}
   catch{setError('No pudimos guardar el borrador en este navegador. Liberá espacio o habilitá el almacenamiento antes de enviar.');return false;}
 }
 const parts:{part:Part;label:string;status:'pending'|'approved'|'changes';body:ReactNode}[]=[];
 const media=<>{r.assets.map(a=>{const url=`/api/client/media/${clientId}/${r.id}/${a.id}`;return <section className="pilot-asset" key={a.id}>{a.mimeType.startsWith('image/')?<img src={url} alt={a.name} loading="lazy"/>:a.mimeType.startsWith('video/')?<><video src={url} controls playsInline preload="metadata"/><p className="pilot-hint">Si tu navegador no reproduce este formato, descargalo para verlo.</p></>:null}<a className="text-button" href={`${url}?download=1`} download={a.name}><Download size={15}/>{a.name}</a></section>;})}</>;
 if(!r.separateParts||r.contentStatus)parts.push({part:'content',label:r.kind==='script'?'Guion':'Entrega',status:r.separateParts?r.contentStatus!:r.status==='superseded'?'pending':r.status,body:<>{media}{r.text&&<p className="preserve-lines">{r.text}</p>}</>});
 if(r.separateParts&&r.captionStatus&&r.caption)parts.push({part:'caption',label:'Caption',status:r.captionStatus,body:<p className="preserve-lines">{r.caption}</p>});
 const prepared=parts.filter(p=>p.status==='pending'&&draft.answers[p.part]);
 const untouched=parts.filter(p=>p.status==='pending'&&!draft.answers[p.part]);
 const blocked=busy||!!draft.pending||!storageKey;
 const unsaved=parts.some(p=>p.status==='pending'&&!!draft.editing[p.part]);
 async function send(retry?:PilotBatchResponse){
   if(sending.current||(!retry&&(!r.canRespond||!prepared.length||unsaved)))return;
   if(!retry&&untouched.length&&!warning){setWarning(true);return;}
   const payload=retry??{requestId:r.id,version:r.version,key:crypto.randomUUID(),author:draft.author.trim()||'Cliente',answers:prepared.map(p=>draft.answers[p.part]!)};
   if(!retry&&!store({...state.current,pending:payload}))return;
   sending.current=true;setBusy(true);setWarning(false);onPending(true);setError('');
   try{
     const result=await respondPilot(token,payload);
     // Clear locally before unblocking polling; a reload can safely replay if clearing fails.
     const next=empty();next.author=state.current.author;store(next);
     onPending(false);onResult(result);setNotice('Revisión enviada al equipo. Las partes sin responder siguen pendientes.');
   }catch(e){
     setError(e instanceof Error?e.message:'No pudimos confirmar el envío.');
     if(e instanceof PilotError&&['VALIDATION','CONFLICT','INVALID_TRANSITION','INVALID_ACCESS','invalid_access','IDEMPOTENCY_CONFLICT'].includes(e.code)){
       store(empty());onPending(false);
     }
   }finally{sending.current=false;setBusy(false);}
 }
 return <article className="pilot-card pilot-review"><small>{r.kind==='script'?'REVISIÓN DE GUION / TEXTO':'REVISIÓN DE ENTREGA FINAL'} · VERSIÓN {r.version}</small><h1>{piece?.title||'Contenido'}</h1><p className="pilot-hint">{dateLabel(piece?.plannedDate??null)} · {labels[r.status]}</p>
   {r.canRespond&&<p className="pilot-notice">Prepará tu respuesta en cada parte y pulsá <strong>Enviar revisión</strong> al terminar. El borrador queda en este navegador hasta enviarlo.</p>}
   {notice&&<p role="status" className="pilot-notice">{notice}</p>}
   {error&&<div role="alert" className="pilot-error">{error}</div>}
   {draft.pending&&<div className="pilot-notice" role="status">Hay un envío sin confirmar. Reintentá para comprobarlo sin duplicarlo. <button className="button secondary" disabled={busy} onClick={()=>void send(draft.pending)}>Reintentar la misma respuesta</button></div>}
   {parts.map(p=><section className="pilot-review-part" aria-label={p.label} key={p.part}><div className="pilot-part-heading"><h2>{p.label}</h2><span className={`pilot-part-status ${draft.answers[p.part]?.decision??p.status}`}>{p.status!=='pending'?p.status==='approved'?'Aprobado':'Cambios pedidos':draft.answers[p.part]?`${draft.answers[p.part]!.decision==='approved'?'Aprobado':draft.answers[p.part]!.decision==='changes'?'Corrección guardada':'Comentario guardado'} · sin enviar`:'Sin revisar'}</span></div>
    <div className="pilot-part-content">{p.body}</div>
    {r.canRespond&&p.status==='pending'&&<fieldset className="pilot-feedback" disabled={blocked}>
      <div className="pilot-actions"><button className="button secondary" onClick={()=>{const next={...state.current,answers:{...state.current.answers,[p.part]:{part:p.part,decision:'approved',comment:''}},editing:{...state.current.editing}};delete next.editing[p.part];store(next);setWarning(false);}}><Check size={17}/>Aceptar {p.label.toLowerCase()}</button>
       <button className="button secondary" aria-expanded={draft.editing[p.part]?.decision==='changes'} onClick={()=>store({...state.current,editing:{...state.current.editing,[p.part]:{decision:'changes',text:state.current.answers[p.part]?.decision==='changes'?state.current.answers[p.part]!.comment:''}}})}>Solicitar cambios</button>
       <button className="text-button" aria-expanded={draft.editing[p.part]?.decision==='comment'} onClick={()=>store({...state.current,editing:{...state.current.editing,[p.part]:{decision:'comment',text:''}}})}><MessageSquare size={15}/>Sólo comentar</button></div>
      {draft.editing[p.part]&&<form className="pilot-change-form" onSubmit={e=>{e.preventDefault();const edit=state.current.editing[p.part]!;if(!edit.text.trim())return;const next={...state.current,answers:{...state.current.answers,[p.part]:{part:p.part,decision:edit.decision,comment:edit.text.trim()}},editing:{...state.current.editing}};delete next.editing[p.part];store(next);setWarning(false);}}><label>{draft.editing[p.part]!.decision==='changes'?`Cambios en ${p.label.toLowerCase()}`:'Comentario'}<textarea autoFocus required maxLength={10000} rows={4} value={draft.editing[p.part]!.text} onChange={e=>store({...state.current,editing:{...state.current.editing,[p.part]:{...state.current.editing[p.part]!,text:e.target.value}}})}/></label><div className="pilot-actions"><button className="button primary" type="submit" disabled={!draft.editing[p.part]!.text.trim()}>{draft.editing[p.part]!.decision==='changes'?'Guardar corrección':'Guardar comentario'}</button><button className="text-button" type="button" onClick={()=>{const next={...state.current,editing:{...state.current.editing}};delete next.editing[p.part];store(next);}}>Cancelar</button></div></form>}
      {!draft.editing[p.part]&&draft.answers[p.part]?.comment&&<p className="pilot-notice preserve-lines">{draft.answers[p.part]!.comment}</p>}
    </fieldset>}
   </section>)}
   {r.comment&&<p className="pilot-notice preserve-lines">{r.comment}</p>}{r.comments.length>0&&<section className="pilot-comments"><h2>Comentarios</h2>{r.comments.map((c,i)=><p key={i}><strong>{c.author}</strong><br/>{c.text}</p>)}</section>}
   {r.canRespond?<><details className="pilot-author"><summary>Agregar mi nombre (opcional)</summary><label>Tu nombre<input disabled={blocked} value={draft.author} maxLength={120} onChange={e=>store({...state.current,author:e.target.value})}/></label></details>
    <div className="pilot-send"><p className="pilot-hint">{unsaved?'Guardá o cancelá el texto que estás editando antes de enviar.':`${prepared.length} de ${parts.filter(p=>p.status==='pending').length} partes pendientes preparadas para enviar.`}</p>
    {warning&&<div role="alert" className="pilot-notice">{untouched.map(p=>p.label).join(' y ')} sigue sin revisar. ¿Querés enviar sólo lo que preparaste?<div className="pilot-actions"><button className="button secondary" onClick={()=>setWarning(false)}>Seguir revisando</button><button className="button primary" disabled={blocked} onClick={()=>void send()}>Enviar de todos modos</button></div></div>}
    {!warning&&<button className="button primary" disabled={blocked||!prepared.length||unsaved} onClick={()=>void send()}><Send size={17}/>{busy?'Enviando…':'Enviar revisión'}</button>}</div></>:<p className="pilot-hint">Esta revisión está cerrada. Volvé a tus contenidos para consultar las versiones vigentes.</p>}
 </article>;
}
