import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, CalendarDays, Check, ChevronRight, Download, MessageSquare, RefreshCw } from 'lucide-react';
import type { PilotPiece, PilotRequest, PilotView } from '../../contracts/client-pilot';
import { PilotError, readPilot, respondPilot, type PilotResponse } from '../lib/client-pilot';
import { dateLabel } from './shared';
import ClientMonthCalendar from './ClientMonthCalendar';
import './client-portal.css';

const reviewLabel={pending:'Para revisar',approved:'Aprobado',changes:'Cambios pedidos',superseded:'Revisión cerrada'};

export default function ClientPortal(){
  const [token,direct]=location.hash.slice(1).split('/');
  const [view,setView]=useState<PilotView|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const readSerial=useRef(0), responsePending=useRef(false);
  const [responding,setResponding]=useState(false);
  const [tab,setTab]=useState<'pending'|'calendar'|null>(null),[selected,setSelected]=useState(direct??'');
  const refresh=useCallback(async(signal?:AbortSignal)=>{
    if(responsePending.current)return;
    const serial=++readSerial.current;
    if(!/^[A-Za-z0-9_-]{43}$/.test(token??'')){setError('Pedile al equipo de Aramis un enlace actualizado.');setLoading(false);return;}
    try{const data=await readPilot(token,signal);if(serial===readSerial.current&&!responsePending.current){setView(data);setError('');}}
    catch(error){if(!signal?.aborted&&serial===readSerial.current){setError(error instanceof Error?error.message:'No pudimos abrir el enlace.');if(error instanceof PilotError&&['INVALID_ACCESS','invalid_access'].includes(error.code))setView(null);}}
    finally{if(!signal?.aborted&&serial===readSerial.current)setLoading(false);}
  },[token]);
  useEffect(()=>{
    const controller=new AbortController();void refresh(controller.signal);
    const onFocus=()=>void refresh(controller.signal),timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh(controller.signal);},60_000);
    window.addEventListener('focus',onFocus);return()=>{controller.abort();clearInterval(timer);window.removeEventListener('focus',onFocus);};
  },[refresh]);
  const pending=view?.requests.filter(r=>r.canRespond)??[];
  const activeTab=tab??(pending.length?'pending':'calendar');
  const request=view?.requests.find(r=>r.id===selected);
  function openRequest(id:string){setSelected(id);window.scrollTo({top:0,behavior:'smooth'});}
  return <div className="pilot-app"><header className="pilot-header"><img src="/brand/aramis-ink.svg" alt="Aramis" width="150" height="50"/><div><strong>{view?.client.name??'Tu espacio'}</strong><span>Calendario y revisiones</span></div></header><main className="pilot-main">
    {loading?<p role="status">Abriendo tu espacio…</p>:!view?<section className="pilot-card"><h1>Este enlace no está disponible</h1><p>{error}</p><button className="button secondary" onClick={()=>void refresh()}>Reintentar</button><p>Podés responder al WhatsApp del equipo para pedir otro enlace.</p></section>:<>
      {error&&<div className="pilot-error" role="alert">{error} <button onClick={()=>void refresh()} className="text-button">Actualizar</button></div>}
      {selected?<><button className="button secondary pilot-back" disabled={responding} onClick={()=>{setSelected('');window.scrollTo({top:0});}}><ArrowLeft size={19}/>Volver a mis contenidos</button>{request?<Review key={request.id} request={request} piece={view.pieces.find(p=>p.id===request.pieceId)} clientId={view.client.id} token={token} onPending={value=>{responsePending.current=value;setResponding(value);readSerial.current++;}} onResult={data=>{readSerial.current++;setView(data);}}/>:<section className="pilot-card"><h1>Esta revisión ya no está disponible</h1><p>Volvé a tus contenidos para consultar los pedidos vigentes.</p></section>}</>:<>
        <div className="pilot-heading"><h1>Tus contenidos</h1><button className="text-button" aria-label="Actualizar contenidos" onClick={()=>void refresh()}><RefreshCw size={16}/></button></div>
        <nav className="pilot-tabs" aria-label="Tu espacio"><button aria-current={activeTab==='pending'?'page':undefined} onClick={()=>setTab('pending')}>Para revisar <span>{pending.length}</span></button><button aria-current={activeTab==='calendar'?'page':undefined} onClick={()=>setTab('calendar')}><CalendarDays size={17}/>Calendario</button></nav>
        {activeTab==='pending'?<><p className="pilot-hint">{pending.length?'Revisá cada pedido para aprobarlo, pedir cambios o dejar un comentario.':'No tenés revisiones pendientes. Podés consultar el calendario.'}</p>{!pending.length&&view.pieces.length>0&&<button className="button secondary" onClick={()=>setTab('calendar')}>Ver calendario ({view.pieces.length})</button>}<div className="pilot-list">{pending.sort((a,b)=>(view.pieces.find(p=>p.id===a.pieceId)?.plannedDate??'9999').localeCompare(view.pieces.find(p=>p.id===b.pieceId)?.plannedDate??'9999')).map(r=><RequestRow key={r.id} request={r} piece={view.pieces.find(p=>p.id===r.pieceId)} open={()=>openRequest(r.id)}/>)}</div>{view.requests.some(r=>!r.canRespond)&&<details className="pilot-previous"><summary>Respuestas y revisiones anteriores</summary>{view.requests.filter(r=>!r.canRespond).map(r=><RequestRow key={r.id} request={r} piece={view.pieces.find(p=>p.id===r.pieceId)} open={()=>openRequest(r.id)}/>)}</details>}</>:<ClientMonthCalendar view={view} open={openRequest}/>}
      </>}
    </>}
  </main><footer className="pilot-footer">Aramis · Enlace privado. Compartilo sólo con quienes puedan revisar tus contenidos.</footer></div>;
}
function RequestRow({request:r,piece,open}:{request:PilotRequest;piece?:PilotPiece;open:()=>void}){
  return <button className="pilot-request-row" onClick={open}><div><small>{r.kind==='script'?'Guion / texto':'Entrega final'} · v{r.version}</small><strong>{piece?.title||'Contenido'}</strong><span>{dateLabel(piece?.plannedDate??null)} · {reviewLabel[r.status]}</span></div><ChevronRight size={20}/></button>;
}
function Review({request:r,piece,clientId,token,onResult,onPending}:{request:PilotRequest;piece?:PilotPiece;clientId:string;token:string;onResult:(view:PilotView)=>void;onPending:(value:boolean)=>void}){
  const [author,setAuthor]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const busyRef=useRef(false);
  // One shared retry boundary prevents different parts from racing after a lost response.
  const [pending,setPending]=useState<PilotResponse|null>(null);
  async function send(decision:PilotResponse['decision'],comment='',part?:PilotResponse['part'],retry?:PilotResponse):Promise<boolean>{
    if(busyRef.current||pending&&!retry)return false;
    if(!retry&&decision!=='approved'&&!comment.trim()){setError('Escribí un comentario para continuar.');return false;}
    const label=part==='caption'?'este caption':r.kind==='script'?'este guion':'esta entrega';
    if(!retry&&decision==='approved'&&!confirm(`¿Aceptar ${label} (versión ${r.version})?`))return false;
    const payload=retry??{requestId:r.id,key:crypto.randomUUID(),decision,comment:comment.trim(),author:author.trim()||'Cliente',...(part?{part}:{})};
    busyRef.current=true;setBusy(true);setPending(payload);onPending(true);setError('');
    try{onResult(await respondPilot(token,payload));setPending(null);onPending(false);setNotice(decision==='comment'?'Comentario enviado. La revisión sigue pendiente.':decision==='approved'?'Aprobación registrada.':'Cambios enviados al equipo.');return true;}
    catch(error){setError(error instanceof Error?error.message:'No pudimos confirmar la respuesta.');if(error instanceof PilotError&&['VALIDATION','CONFLICT','INVALID_TRANSITION','INVALID_ACCESS','invalid_access'].includes(error.code)){setPending(null);onPending(false);}return false;}
    finally{busyRef.current=false;setBusy(false);}
  }
  const media=<>{r.assets.map(a=>{const url=`/api/client/media/${clientId}/${r.id}/${a.id}`;return <section className="pilot-asset" key={a.id}>{a.mimeType.startsWith('image/')?<img src={url} alt={a.name} loading="lazy"/>:a.mimeType.startsWith('video/')?<><video src={url} controls playsInline preload="metadata"/><p className="pilot-hint">Si tu navegador no reproduce este formato, descargalo para verlo.</p></>:null}<a className="text-button" href={`${url}?download=1`} download={a.name}><Download size={15}/>{a.name}</a></section>;})}</>;
  const blocked=busy||!!pending;
  return <article className="pilot-card pilot-review"><small>{r.kind==='script'?'REVISIÓN DE GUION / TEXTO':'REVISIÓN DE ENTREGA FINAL'} · VERSIÓN {r.version}</small><h1>{piece?.title||'Contenido'}</h1><p className="pilot-hint">{dateLabel(piece?.plannedDate??null)} · {reviewLabel[r.status]}</p>
    {r.kind==='script'?<p className="pilot-notice">Esta aprobación corresponde al guion o texto. La pieza terminada se revisa por separado.</p>:r.separateParts&&r.canRespond&&<p className="pilot-hint">Revisá cada parte. La entrega queda aprobada cuando aceptás también el caption, si lo hay.</p>}
    {notice&&<p role="status" className="pilot-notice">{notice}</p>}{error&&<div role="alert" className="pilot-error">{error}{pending&&<button className="button secondary" disabled={busy} onClick={()=>void send(pending.decision,pending.comment,pending.part,pending)}>Reintentar la misma respuesta</button>}</div>}
    {r.separateParts?<>
      {r.contentStatus&&<ReviewPart label={r.kind==='script'?'Guion':'Entrega'} status={r.contentStatus} canRespond={r.canRespond} blocked={blocked} send={(decision,comment)=>send(decision,comment,'content')}>
        {r.kind==='delivery'?media:<p className="preserve-lines">{r.text}</p>}
      </ReviewPart>}
      {r.captionStatus&&r.caption&&<ReviewPart label="Caption" status={r.captionStatus} canRespond={r.canRespond} blocked={blocked} send={(decision,comment)=>send(decision,comment,'caption')}><p className="preserve-lines">{r.caption}</p></ReviewPart>}
    </>:<ReviewPart label={r.kind==='script'?'Guion':'Entrega'} status={r.status==='superseded'?'pending':r.status} canRespond={r.canRespond} blocked={blocked} send={(decision,comment)=>send(decision,comment)}>{media}{r.text&&<div className="pilot-text">{r.kind==='delivery'&&<h3>Caption</h3>}<p>{r.text}</p></div>}</ReviewPart>}
    {r.comment&&<p className="pilot-notice">{r.comment}</p>}{r.comments.length>0&&<section className="pilot-comments"><h2>Comentarios</h2>{r.comments.map((c,i)=><p key={i}><strong>{c.author}</strong><br/>{c.text}</p>)}</section>}
    {r.canRespond?<details className="pilot-author"><summary>Agregar mi nombre (opcional)</summary><label>Tu nombre<input disabled={blocked} value={author} maxLength={120} onChange={e=>setAuthor(e.target.value)}/></label></details>:<p className="pilot-hint">Esta revisión está cerrada. Volvé a tus contenidos para consultar las versiones vigentes.</p>}
  </article>;
}
function ReviewPart({label,status,canRespond,blocked,send,children}:{label:string;status:'pending'|'approved'|'changes';canRespond:boolean;blocked:boolean;send:(decision:PilotResponse['decision'],comment:string)=>Promise<boolean>;children:ReactNode}){
  const [form,setForm]=useState<'changes'|'comment'|null>(null),[comment,setComment]=useState('');
  return <section className="pilot-review-part" aria-label={label}><div className="pilot-part-heading"><h2>{label}</h2>{status!=='pending'&&<span className={`pilot-part-status ${status}`}>{status==='approved'?'Aceptado':'Cambios solicitados'}</span>}</div>
    <div className="pilot-part-content">{children}</div>
    {canRespond&&status==='pending'&&<fieldset disabled={blocked} className="pilot-feedback">
      <div className="pilot-actions"><button type="button" className="button primary" onClick={()=>void send('approved','')}><Check size={17}/>Aceptar {label.toLowerCase()}</button><button type="button" className="button secondary" aria-expanded={form==='changes'} onClick={()=>{if(form!=='changes'){setForm('changes');setComment('');}}}>Solicitar cambios</button><button type="button" className="text-button" aria-expanded={form==='comment'} onClick={()=>{if(form!=='comment'){setForm('comment');setComment('');}}}><MessageSquare size={15}/>Sólo comentar</button></div>
      {form&&<form className="pilot-change-form" onSubmit={async e=>{e.preventDefault();if(await send(form,comment)){setForm(null);setComment('');}}}>
        <label>{form==='changes'?`Cambios en ${label.toLowerCase()}`:'Comentario'}<textarea autoFocus value={comment} required maxLength={10000} rows={4} onChange={e=>setComment(e.target.value)} placeholder={form==='changes'?'Contanos qué querés ajustar…':'Escribí tu consulta…'}/></label>
        <div className="pilot-actions"><button className="button primary" type="submit" disabled={!comment.trim()}>{form==='changes'?'Enviar cambios':'Enviar comentario'}</button><button className="text-button" type="button" onClick={()=>{setForm(null);setComment('');}}>Cancelar</button></div>
      </form>}
    </fieldset>}
  </section>;
}
