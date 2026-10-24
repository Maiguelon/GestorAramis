import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CalendarDays, ChevronRight, RefreshCw } from 'lucide-react';
import type { PilotPiece, PilotRequest, PilotView } from '../../contracts/client-pilot';
import { PilotError, readPilot } from '../lib/client-pilot';
import { dateLabel } from './shared';
import ClientMonthCalendar from './ClientMonthCalendar';
import './client-portal.css';
import Review from './ClientReview';

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
      {selected?<><button className="button secondary pilot-back" disabled={responding} onClick={()=>{setSelected('');window.scrollTo({top:0});}}><ArrowLeft size={19}/>Volver a mis contenidos</button>{request?<Review key={`${request.id}:${request.version}`} request={request} piece={view.pieces.find(p=>p.id===request.pieceId)} clientId={view.client.id} token={token} onPending={value=>{responsePending.current=value;setResponding(value);readSerial.current++;}} onResult={data=>{readSerial.current++;setView(data);}}/>:<section className="pilot-card"><h1>Esta revisión ya no está disponible</h1><p>Volvé a tus contenidos para consultar los pedidos vigentes.</p></section>}</>:<>
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
