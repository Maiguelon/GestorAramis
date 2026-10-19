import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Download, MessageSquare, RefreshCw } from 'lucide-react';
import type { PilotPiece, PilotRequest, PilotView } from '../../contracts/client-pilot';
import { FORMAT_LABELS } from '../../contracts/domain';
import { PilotError, readPilot, respondPilot, type PilotResponse } from '../lib/client-pilot';
import { dateLabel } from './shared';
import './client-portal.css';

const stateLabel:Record<string,string>={planned:'Planificado',production:'En producción',review:'En revisión',approved:'Aprobado',scheduled:'Programado',published:'Publicado'};
const reviewLabel={pending:'Para revisar',approved:'Aprobado',changes:'Cambios pedidos',superseded:'Revisión cerrada'};
function currentMonth(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Argentina/Buenos_Aires'}).format(new Date()).slice(0,7);}

export default function ClientPortal(){
  const [token,direct]=location.hash.slice(1).split('/');
  const [view,setView]=useState<PilotView|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const readSerial=useRef(0);
  const [tab,setTab]=useState<'pending'|'calendar'>('pending'),[selected,setSelected]=useState(direct??'');
  const refresh=useCallback(async(signal?:AbortSignal)=>{
    const serial=++readSerial.current;
    if(!/^[A-Za-z0-9_-]{43}$/.test(token??'')){setError('Pedile al equipo de Aramis un enlace actualizado.');setLoading(false);return;}
    try{const data=await readPilot(token,signal);if(serial===readSerial.current){setView(data);setError('');}}
    catch(error){if(!signal?.aborted&&serial===readSerial.current){setError(error instanceof Error?error.message:'No pudimos abrir el enlace.');if(error instanceof PilotError&&['INVALID_ACCESS','invalid_access'].includes(error.code))setView(null);}}
    finally{if(!signal?.aborted&&serial===readSerial.current)setLoading(false);}
  },[token]);
  useEffect(()=>{
    const controller=new AbortController();void refresh(controller.signal);
    const onFocus=()=>void refresh(controller.signal),timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh(controller.signal);},60_000);
    window.addEventListener('focus',onFocus);return()=>{controller.abort();clearInterval(timer);window.removeEventListener('focus',onFocus);};
  },[refresh]);
  const pending=view?.requests.filter(r=>r.canRespond)??[];
  const request=view?.requests.find(r=>r.id===selected);
  function openRequest(id:string){setSelected(id);window.scrollTo({top:0,behavior:'smooth'});}
  return <div className="pilot-app"><header className="pilot-header"><img src="/brand/aramis-ink.svg" alt="Aramis" width="150" height="50"/><div><strong>{view?.client.name??'Tu espacio'}</strong><span>Calendario y revisiones</span></div></header><main className="pilot-main">
    {loading?<p role="status">Abriendo tu espacio…</p>:!view?<section className="pilot-card"><h1>Este enlace no está disponible</h1><p>{error}</p><button className="button secondary" onClick={()=>void refresh()}>Reintentar</button><p>Podés responder al WhatsApp del equipo para pedir otro enlace.</p></section>:<>
      {error&&<div className="pilot-error" role="alert">{error} <button onClick={()=>void refresh()} className="text-button">Actualizar</button></div>}
      {selected?<><button className="text-button pilot-back" onClick={()=>setSelected('')}>← Volver a mis contenidos</button>{request?<Review key={request.id} request={request} piece={view.pieces.find(p=>p.id===request.pieceId)} clientId={view.client.id} token={token} onResult={data=>{readSerial.current++;setView(data);}}/>:<section className="pilot-card"><h1>Esta revisión ya no está disponible</h1><p>Volvé a tus contenidos para consultar los pedidos vigentes.</p></section>}</>:<>
        <div className="pilot-heading"><h1>Tus contenidos</h1><button className="text-button" aria-label="Actualizar contenidos" onClick={()=>void refresh()}><RefreshCw size={16}/></button></div>
        <nav className="pilot-tabs" aria-label="Tu espacio"><button aria-current={tab==='pending'?'page':undefined} onClick={()=>setTab('pending')}>Para revisar <span>{pending.length}</span></button><button aria-current={tab==='calendar'?'page':undefined} onClick={()=>setTab('calendar')}><CalendarDays size={17}/>Calendario</button></nav>
        {tab==='pending'?<><p className="pilot-hint">{pending.length?'Revisá cada pedido para aprobarlo, pedir cambios o dejar un comentario.':'No tenés revisiones pendientes. Podés consultar el calendario.'}</p><div className="pilot-list">{pending.sort((a,b)=>(view.pieces.find(p=>p.id===a.pieceId)?.plannedDate??'9999').localeCompare(view.pieces.find(p=>p.id===b.pieceId)?.plannedDate??'9999')).map(r=><RequestRow key={r.id} request={r} piece={view.pieces.find(p=>p.id===r.pieceId)} open={()=>openRequest(r.id)}/>)}</div>{view.requests.some(r=>!r.canRespond)&&<details className="pilot-previous"><summary>Respuestas y revisiones anteriores</summary>{view.requests.filter(r=>!r.canRespond).map(r=><RequestRow key={r.id} request={r} piece={view.pieces.find(p=>p.id===r.pieceId)} open={()=>openRequest(r.id)}/>)}</details>}</>:<Calendar view={view} open={openRequest}/>}
      </>}
    </>}
  </main><footer className="pilot-footer">Aramis · Enlace privado. Compartilo sólo con quienes puedan revisar tus contenidos.</footer></div>;
}
function RequestRow({request:r,piece,open}:{request:PilotRequest;piece?:PilotPiece;open:()=>void}){
  return <button className="pilot-request-row" onClick={open}><div><small>{r.kind==='script'?'Guion / texto':'Entrega final'} · v{r.version}</small><strong>{piece?.title||'Contenido'}</strong><span>{dateLabel(piece?.plannedDate??null)} · {reviewLabel[r.status]}</span></div><ChevronRight size={20}/></button>;
}
function Review({request:r,piece,clientId,token,onResult}:{request:PilotRequest;piece?:PilotPiece;clientId:string;token:string;onResult:(view:PilotView)=>void}){
  const [comment,setComment]=useState(''),[author,setAuthor]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  // Preserve exact payload/key after an uncertain network result. A retry cannot become another decision.
  const [pending,setPending]=useState<PilotResponse|null>(null);
  async function send(decision:PilotResponse['decision'],retry?:PilotResponse){
    if(busy)return;if(!retry&&decision!=='approved'&&!comment.trim()){setError('Escribí un comentario para continuar.');return;}
    if(!retry&&decision==='approved'&&!confirm(`¿Aprobar ${r.kind==='script'?'este guion':'esta entrega final'} (versión ${r.version})?`))return;
    const payload=retry??{requestId:r.id,key:crypto.randomUUID(),decision,comment:comment.trim(),author:author.trim()||'Cliente'};
    setBusy(true);setPending(payload);setError('');
    try{onResult(await respondPilot(token,payload));setPending(null);setComment('');setNotice(decision==='comment'?'Comentario enviado. La revisión sigue pendiente.':decision==='approved'?'Aprobación registrada.':'Cambios enviados al equipo.');}
    catch(error){setError(error instanceof Error?error.message:'No pudimos confirmar la respuesta.');if(error instanceof PilotError&&['VALIDATION','CONFLICT','INVALID_TRANSITION','INVALID_ACCESS','invalid_access'].includes(error.code))setPending(null);}
    finally{setBusy(false);}
  }
  return <article className="pilot-card pilot-review"><small>{r.kind==='script'?'REVISIÓN DE GUION / TEXTO':'REVISIÓN DE ENTREGA FINAL'} · VERSIÓN {r.version}</small><h1>{piece?.title||'Contenido'}</h1><p className="pilot-hint">{dateLabel(piece?.plannedDate??null)} · {reviewLabel[r.status]}</p>
    {r.kind==='script'&&<p className="pilot-notice">Esta aprobación corresponde al guion o texto. La pieza terminada se revisa por separado.</p>}
    {r.assets.map(a=>{const url=`/api/client/media/${clientId}/${r.id}/${a.id}`;return <section className="pilot-asset" key={a.id}>{a.mimeType.startsWith('image/')?<img src={url} alt={a.name} loading="lazy"/>:a.mimeType.startsWith('video/')?<><video src={url} controls playsInline preload="metadata"/><p className="pilot-hint">Si tu navegador no reproduce este formato, descargalo para verlo.</p></>:null}<a className="text-button" href={`${url}?download=1`} download={a.name}><Download size={15}/>{a.name}</a></section>;})}
    {r.text&&<section className="pilot-text"><h2>{r.kind==='script'?'Texto para revisar':'Caption'}</h2><p>{r.text}</p></section>}
    {r.comment&&<p className="pilot-notice">{r.comment}</p>}{r.comments.length>0&&<section className="pilot-comments"><h2>Comentarios</h2>{r.comments.map((c,i)=><p key={i}><strong>{c.author}</strong><br/>{c.text}</p>)}</section>}
    {notice&&<p role="status" className="pilot-notice">{notice}</p>}{error&&<div role="alert" className="pilot-error">{error}{pending&&<button className="button secondary" disabled={busy} onClick={()=>void send(pending.decision,pending)}>Reintentar la misma respuesta</button>}</div>}
    {r.canRespond?<fieldset disabled={busy||!!pending} className="pilot-feedback"><label>Comentario<textarea value={comment} maxLength={10000} rows={4} onChange={e=>setComment(e.target.value)} placeholder="Escribí qué necesitás ajustar o dejá una consulta…"/></label><label>Tu nombre (opcional)<input value={author} maxLength={120} onChange={e=>setAuthor(e.target.value)}/></label><div className="pilot-actions"><button className="button primary" onClick={()=>void send('approved')}><Check size={17}/>{r.kind==='script'?'Aprobar guion':'Aprobar entrega'}</button><button className="button secondary" onClick={()=>void send('changes')}>Pedir cambios</button><button className="text-button" onClick={()=>void send('comment')}><MessageSquare size={15}/>Sólo comentar</button></div></fieldset>:<p className="pilot-hint">Esta revisión está cerrada. Consultá tus contenidos para ver si hay una nueva versión.</p>}
  </article>;
}
function Calendar({view,open}:{view:PilotView;open:(id:string)=>void}){
  const [month,setMonth]=useState(currentMonth),[mode,setMode]=useState<'agenda'|'month'>('agenda');
  const pieces=view.pieces.filter(p=>p.plannedDate?.startsWith(month)),undated=view.pieces.filter(p=>!p.plannedDate);
  const date=new Date(`${month}-01T12:00:00`),days=new Date(date.getFullYear(),date.getMonth()+1,0).getDate(),offset=(date.getDay()+6)%7;
  function move(delta:number){const next=new Date(date.getFullYear(),date.getMonth()+delta,1,12);setMonth(`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}`);}
  const row=(p:PilotPiece)=>{const request=view.requests.find(r=>r.pieceId===p.id&&r.canRespond)??view.requests.find(r=>r.pieceId===p.id);return <div className="pilot-calendar-row" key={p.id}><div><small>{dateLabel(p.plannedDate)} · {FORMAT_LABELS[p.format]}</small><strong>{p.title}</strong><span>{stateLabel[p.status]??p.status}</span></div>{request&&<button className="text-button" onClick={()=>open(request.id)}>{request.canRespond?'Revisar':'Ver revisión'}<ChevronRight size={15}/></button>}</div>;};
  return <section><div className="pilot-calendar-toolbar"><div><button className="icon-button" aria-label="Mes anterior" onClick={()=>move(-1)}><ChevronLeft/></button><label><span className="sr-only">Mes del calendario</span><input type="month" value={month} onChange={e=>{if(e.target.value)setMonth(e.target.value);}}/></label><button className="icon-button" aria-label="Mes siguiente" onClick={()=>move(1)}><ChevronRight/></button></div><select aria-label="Vista del calendario" value={mode} onChange={e=>setMode(e.target.value as 'agenda'|'month')}><option value="agenda">Agenda</option><option value="month">Mes</option></select></div>
    <p className="pilot-hint">Fechas previstas, sujetas a ajustes. Mostramos los contenidos compartidos por Aramis.</p>
    {mode==='agenda'?pieces.length?<div className="pilot-card">{pieces.map(row)}</div>:<p className="pilot-card">No hay contenidos compartidos para este mes.</p>:<div className="pilot-month"><div className="pilot-weekdays">{['L','M','M','J','V','S','D'].map((x,i)=><span key={i}>{x}</span>)}</div><div className="pilot-month-grid">{Array.from({length:offset},(_,i)=><div key={`blank${i}`}/>)}{Array.from({length:days},(_,i)=>{const day=`${month}-${String(i+1).padStart(2,'0')}`,items=pieces.filter(p=>p.plannedDate===day);return <details key={day}><summary><span>{i+1}</span>{items.length>0&&<strong>{items.length} {items.length===1?'pieza':'piezas'}</strong>}</summary>{items.length>0&&<div className="pilot-day-popover">{items.map(row)}</div>}</details>;})}</div></div>}
    {undated.length>0&&<details className="pilot-previous"><summary>Fecha por definir ({undated.length})</summary>{undated.map(row)}</details>}
  </section>;
}
