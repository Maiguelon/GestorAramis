import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, ExternalLink, Link2, MessageCircle, RefreshCw } from 'lucide-react';
import type { Client, Piece } from '../../contracts/domain';
import type { PilotAction, PilotStaffView } from '../../contracts/client-pilot';
import { PilotError, pilotReviewLink, pilotWhatsApp, staffPilot } from '../lib/client-pilot';
import { sharedWorkspace } from '../lib/shared-api';
import { latestDelivery } from './PieceDelivery';
import { isMultiClient } from '../../contracts/piece-clients';
import './client-pilot.css';

const labels={pending:'Pendiente',approved:'Aprobado',changes:'Cambios pedidos',superseded:'Cerrada'};
/** One explicit publication surface; private notes and source material are never serialized. */
export default function ClientPilot({client,piece,disabled=false,onDirty,onBusy}:{client:Client;piece?:Piece;disabled?:boolean;onDirty?:(dirty:boolean)=>void;onBusy?:(busy:boolean)=>void}){
  const [view,setView]=useState<PilotStaffView|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false),[script,setScript]=useState('');
  const [pending,setPending]=useState<(PilotAction&{key:string})|null>(null);
  const [message,setMessage]=useState('');
  const readSerial=useRef(0);
  const refresh=useCallback(async()=>{const serial=++readSerial.current;try{const data=await staffPilot({action:'staff-view',clientId:client.id});if(serial===readSerial.current){setView(data);setError('');}}catch(error){if(serial===readSerial.current)setError(error instanceof Error?error.message:'No pudimos cargar el acceso.');}},[client.id]);
  useEffect(()=>{void refresh();},[refresh,piece?.revision]);
  useEffect(()=>{onDirty?.(!!script.trim());return()=>onDirty?.(false);},[script,onDirty]);
  useEffect(()=>{onBusy?.(busy||!!pending);return()=>onBusy?.(false);},[busy,pending,onBusy]);
  useEffect(()=>{const update=()=>{if(document.visibilityState==='visible')void refresh();};const timer=setInterval(update,30_000);window.addEventListener('focus',update);return()=>{clearInterval(timer);window.removeEventListener('focus',update);};},[refresh]);
  const shared=piece&&isMultiClient(piece);
  if(shared)return <p className="notice-banner">Las piezas multicliente se gestionan sólo dentro del equipo.</p>;
  async function act(action:PilotAction,retry?:PilotAction&{key:string}){
    if(busy)return;const payload=retry??{...action,key:crypto.randomUUID()};setBusy(true);setPending(payload);setError('');setNotice('');
    try{const data=await staffPilot(payload);readSerial.current++;setView(data);setPending(null);if(payload.action==='publish')setScript('');setNotice('Cambio guardado.');void sharedWorkspace.refresh();}
    catch(error){setError(error instanceof Error?error.message:'No pudimos confirmar el cambio.');if(error instanceof PilotError&&['VALIDATION','CONFLICT','INVALID_TRANSITION','NOT_FOUND','forbidden'].includes(error.code)){setPending(null);void sharedWorkspace.refresh();}}
    finally{setBusy(false);}
  }
  async function copy(text:string){try{await navigator.clipboard.writeText(text);setNotice('Copiado.');}catch{setNotice('No pudimos copiar. Seleccioná el enlace o el mensaje de abajo.');}}
  const requests=view?.requests.filter(r=>!piece||r.pieceId===piece.id)??[];
  const count=view?.requests.filter(r=>r.canRespond).length??0;
  const visible=!!view?.pieces.some(p=>p.id===piece?.id),delivery=piece?latestDelivery(piece):undefined;
  const link=view?.linkUrl;
  return <section className="client-pilot-controls"><div className="subsection-heading"><h3>{piece?'Revisión del cliente':'Acceso del cliente'}</h3><button type="button" className="text-button" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={14}/>Actualizar</button></div>
    <p className="form-hint">Piloto por enlace privado. Quien tenga el enlace puede ver lo compartido y responder por este cliente. Las notas internas y el material de producción quedan dentro del equipo.</p>
    {error&&<div role="alert" className="error-banner">{error}{pending&&<button type="button" className="button secondary" disabled={busy} onClick={()=>void act(pending,pending)}>Reintentar la misma operación</button>}</div>}{notice&&<p role="status" className="notice-banner">{notice}</p>}
    <fieldset className="save-fieldset" disabled={busy||!!pending||disabled||!view}>
      {!link?<button className="button secondary" type="button" onClick={()=>void act({action:'link-ensure',clientId:client.id})}><Link2 size={16}/>Crear enlace del cliente</button>:<div className="pilot-link-tools"><label>Enlace privado<input aria-label="Enlace privado del cliente" value={link} readOnly onFocus={e=>e.target.select()}/></label><div className="detail-bottom-actions"><button type="button" className="button secondary" onClick={()=>void copy(link)}><Copy size={15}/>Copiar enlace</button><a className="button secondary" href={link} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Ver como cliente</a><button type="button" className="button primary" onClick={()=>{const wa=pilotWhatsApp(client.contactName||client.name,link,count,client.phone);setMessage(wa.text);window.open(wa.url,'_blank','noopener,noreferrer');}}><MessageCircle size={15}/>Preparar WhatsApp{count>0?` (${count})`:''}</button></div><details><summary>Administrar enlace</summary><p className="form-hint">Renovarlo invalida el anterior. Revocarlo cierra el acceso hasta que crees otro. No cambia las piezas ni sus respuestas.</p><div className="detail-bottom-actions"><button className="text-button" type="button" onClick={()=>{if(confirm('¿Renovar el enlace? El anterior dejará de funcionar.'))void act({action:'link-rotate',clientId:client.id});}}>Renovar enlace</button><button className="text-button muted" type="button" onClick={()=>{if(confirm('¿Revocar el acceso del cliente?'))void act({action:'link-revoke',clientId:client.id});}}>Revocar enlace</button></div></details></div>}
      {message&&<label className="pilot-message">Mensaje preparado<textarea value={message} rows={4} readOnly/><button type="button" className="text-button" onClick={()=>void copy(message)}>Copiar mensaje</button><small>El mensaje se envía cuando vos pulses Enviar en WhatsApp.</small></label>}
      {piece&&<><label className="visibility-field"><input type="checkbox" checked={visible} onChange={()=>{if(visible&&!confirm('¿Ocultar del calendario? También se retiran las revisiones pendientes de esta pieza.'))return;void act({action:visible?'calendar-hide':'calendar-show',clientId:client.id,pieceId:piece.id,expectedRevision:piece.revision});}}/><span><strong>Mostrar en el calendario del cliente</strong><small>Comparte título, formato, fecha y estado. Los textos y entregas se publican abajo.</small></span></label>
        {piece.status==='planned'&&<div className="form-stack pilot-publish"><h4>Guion / texto para revisar</h4><p className="form-hint">Prepará sólo el texto para el cliente. Aprobarlo no cambia el estado ni envía la pieza a Diseño.</p><button type="button" className="text-button" onClick={()=>{if(script&&!confirm('¿Reemplazar el texto que estás preparando?'))return;setScript(piece.script?.trim()||piece.caption);}}>Copiar texto guardado para editar</button><label>Texto que verá el cliente<textarea aria-label="Texto que verá el cliente" rows={7} value={script} maxLength={100000} onChange={e=>setScript(e.target.value)} placeholder="Pegá el guion o texto para aprobación. Quitá las instrucciones internas antes de publicar."/></label><button type="button" className="button primary" disabled={!script.trim()} onClick={()=>{if(confirm('¿Publicar este texto para el cliente? Revisá que no incluya instrucciones internas. Reemplaza la solicitud anterior de guion y muestra la pieza en su calendario.'))void act({action:'publish',clientId:client.id,pieceId:piece.id,expectedRevision:piece.revision,kind:'script',text:script.trim()});}}>Publicar guion para revisión</button></div>}
        {piece.status==='review'&&delivery?.status==='pending'&&!delivery.invalidatedAt&&<div className="pilot-publish"><h4>Entrega final · versión {delivery.version}</h4><p className="form-hint">Comparte la versión exacta de Entrega: {delivery.assets.length} archivo(s) y su caption. Si el cliente pide cambios, vuelve a producción con el motivo.</p><p className="preserve-lines">{delivery.caption||'Sin caption'}</p><ul>{delivery.assets.map(a=><li key={a.id}>{a.name}</li>)}</ul><button className="button primary" type="button" onClick={()=>{if(confirm('¿Publicar esta entrega exacta para revisión del cliente? También aparecerá en su calendario.'))void act({action:'publish',clientId:client.id,pieceId:piece.id,expectedRevision:piece.revision,kind:'delivery',deliveryId:delivery.id});}}>Publicar entrega para revisión</button></div>}
        {disabled&&<p className="form-hint">Guardá los cambios de la pieza antes de publicar o cambiar lo que ve el cliente.</p>}
      </>}
      {requests.length>0&&<div className="pilot-staff-requests"><h4>{piece?'Solicitudes publicadas':'Revisiones compartidas'}</h4>{requests.map(r=><article key={r.id}><div><strong>{r.kind==='script'?'Guion':'Entrega'} v{r.version} · {labels[r.status]}</strong>{!piece&&<p>{view?.pieces.find(p=>p.id===r.pieceId)?.title}</p>}{r.comment&&<p className="preserve-lines">{r.comment}</p>}{r.comments.map((c,i)=><p key={i}><strong>{c.author}:</strong> {c.text}</p>)}<details><summary>Ver texto publicado</summary><p className="preserve-lines">{r.text||'Sin caption'}</p></details></div><div>{link&&<button type="button" className="text-button" onClick={()=>void copy(pilotReviewLink(link,r.id))}>Copiar enlace de revisión</button>}{r.canRespond&&<button type="button" className="text-button muted" onClick={()=>{if(confirm('¿Retirar esta revisión? El enlace general del cliente se conserva.'))void act({action:'withdraw',clientId:client.id,requestId:r.id});}}>Retirar revisión</button>}</div></article>)}</div>}
    </fieldset>
  </section>;
}
