import { useEffect, useState } from 'react';
import { Copy, ExternalLink, Link2, MessageCircle, RefreshCw } from 'lucide-react';
import type { Client, Piece } from '../../contracts/domain';
import type { PilotAction } from '../../contracts/client-pilot';
import { pilotReviewLink, pilotWhatsApp } from '../lib/client-pilot';
import { latestDelivery } from './PieceDelivery';
import { isMultiClient } from '../../contracts/piece-clients';
import { ClientPilotFeedback, ClientPilotProvider, useClientPilot } from './ClientPilotContext';
import './client-pilot.css';

const labels={pending:'Pendiente',approved:'Aprobado',changes:'Cambios pedidos',superseded:'Cerrada'};
/** One explicit publication surface; private notes and source material are never serialized. */
type Props = {client:Client;piece?:Piece;disabled?:boolean;onDirty?:(dirty:boolean)=>void};
export default function ClientPilot(props:Props) {
  const inherited = useClientPilot();
  return inherited ? <ClientPilotPanel {...props} embedded/> : <ClientPilotProvider clientId={props.client.id} revision={props.piece?.revision}><ClientPilotPanel {...props}/></ClientPilotProvider>;
}
function ClientPilotPanel({client,piece,disabled=false,onDirty,embedded=false}:Props&{embedded?:boolean}) {
  const controller=useClientPilot()!;
  const {view,busy,pending,refresh}=controller;
  const [script,setScript]=useState(piece?.script??''),[baseline,setBaseline]=useState(piece?.script??''),[notice,setNotice]=useState(''),[message,setMessage]=useState('');
  useEffect(()=>{onDirty?.(script!==baseline);return()=>onDirty?.(false);},[script,baseline,onDirty]);
  useEffect(()=>{if(!pending&&view?.requests.some(r=>r.pieceId===piece?.id&&r.separateParts&&r.kind==='script'&&r.text===script.trim()))setBaseline(script);},[view,pending,piece?.id,script]);
  const shared=piece&&isMultiClient(piece);
  if(shared)return <p className="notice-banner">Las piezas multicliente se gestionan sólo dentro del equipo.</p>;
  async function act(action:PilotAction){
    setNotice('');
    if(await controller.save(action)&&action.action==='publish')setBaseline(script);
  }
  async function copy(text:string){try{await navigator.clipboard.writeText(text);setNotice('Copiado.');}catch{setNotice('No pudimos copiar. Seleccioná el enlace o el mensaje de abajo.');}}
  const requests=view?.requests.filter(r=>!piece||r.pieceId===piece.id)??[];
  const count=view?.requests.filter(r=>r.canRespond).length??0;
  const delivery=piece?latestDelivery(piece):undefined;
  const final=delivery&&!delivery.invalidatedAt&&((piece?.status==='review'&&delivery.status==='pending')||(['approved','scheduled','published'].includes(piece?.status??'')&&delivery.status==='approved'))?delivery:undefined;
  const caption=final?.caption??piece?.caption??'';
  const visible=!!view?.pieces.some(p=>p.id===piece?.id);
  const canPublish=!!final||['planned','production'].includes(piece?.status??'');
  const link=view?.linkUrl;
  return <section className="client-pilot-controls"><div className="subsection-heading"><h3>{piece?'Revisión del cliente':'Acceso del cliente'}</h3><button type="button" className="text-button" disabled={busy||!!pending} onClick={()=>void refresh()}><RefreshCw size={14}/>Recargar estado</button></div>
    <p className="form-hint">Piloto por enlace privado. Quien tenga el enlace puede ver lo compartido y responder por este cliente. Las notas internas y el material de producción quedan dentro del equipo.</p>
    {!embedded&&<ClientPilotFeedback/>}{notice&&<p role="status" className="notice-banner">{notice}</p>}
    <fieldset className="save-fieldset" disabled={busy||!!pending||disabled||!view}>
      {piece&&<div className="pilot-publish form-stack">
        <div><h4>Vista del cliente</h4><p className="form-hint">{visible?'Ya está en su calendario.':'Se incluirá en su calendario.'} Una actualización comparte la entrega disponible o el guion, junto con el caption. Reemplaza la revisión anterior.</p></div>
        {final?<div><h4>Entrega v{final.version}</h4><ul>{final.assets.map(a=><li key={a.id}>{a.name}</li>)}</ul><p className="form-hint">{final.status==='approved'?'Entrega ya aprobada: se comparte para consulta.':'El cliente podrá aceptar la entrega y el caption por separado. Los cambios vuelven a Diseño con su motivo.'}</p></div>:<label>Guion que verá el cliente<textarea aria-label="Texto que verá el cliente" rows={6} value={script} maxLength={100000} onChange={e=>setScript(e.target.value)} placeholder="Sin guion. Podés compartir sólo el caption o el calendario."/><small>Revisá y quitá las instrucciones internas antes de actualizar.</small><button type="button" className="text-button" onClick={()=>setScript(piece.script??'')}>Usar guion guardado</button></label>}
        {caption.trim()&&<div><h4>Caption</h4><p className="preserve-lines">{caption}</p><p className="form-hint">{final?'Caption exacto de esta entrega.':'Se comparte la versión guardada en Detalles.'}</p></div>}
        {!final&&!script.trim()&&!caption.trim()&&<p className="form-hint">Sin contenido para revisar: se mostrarán título, formato, fecha y estado en el calendario.</p>}
        <div className="detail-bottom-actions"><button type="button" className="button primary" disabled={!canPublish} onClick={()=>{
          if(confirm('¿Actualizar la vista del cliente con lo que ves aquí? Se incluirá en su calendario y se reemplazará la revisión anterior. Revisá que el guion no contenga instrucciones internas.'))void act({action:'publish',clientId:client.id,pieceId:piece.id,expectedRevision:piece.revision,kind:final?'delivery':'script',...(final?{deliveryId:final.id}:{text:script.trim()}),separateParts:true});
        }}>Actualizar vista del cliente</button>{visible&&<button type="button" className="text-button muted" onClick={()=>{if(confirm('¿Ocultar la pieza del cliente? Se retiran también sus revisiones pendientes.'))void act({action:'calendar-hide',clientId:client.id,pieceId:piece.id,expectedRevision:piece.revision});}}>Ocultar del cliente</button>}</div>
        {!canPublish&&<p className="form-hint">Prepará la entrega desde Entrega antes de compartir esta etapa.</p>}
        {disabled&&<p className="form-hint">Guardá los cambios de la pieza antes de actualizar la vista del cliente.</p>}
      </div>}
      {!link?<button className="button secondary" type="button" onClick={()=>void act({action:'link-ensure',clientId:client.id})}><Link2 size={16}/>Crear enlace del cliente</button>:<div className="pilot-link-tools"><label>Enlace privado<input aria-label="Enlace privado del cliente" value={link} readOnly onFocus={e=>e.target.select()}/></label><div className="detail-bottom-actions"><button type="button" className="button secondary" onClick={()=>void copy(link)}><Copy size={15}/>Copiar enlace</button><a className="button secondary" href={link} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Ver como cliente</a><button type="button" className="button primary" onClick={()=>{const wa=pilotWhatsApp(client.contactName||client.name,link,count,client.phone);setMessage(wa.text);window.open(wa.url,'_blank','noopener,noreferrer');}}><MessageCircle size={15}/>Preparar WhatsApp{count>0?` (${count})`:''}</button></div><details><summary>Administrar enlace</summary><p className="form-hint">Renovarlo invalida el anterior. Revocarlo cierra el acceso hasta que crees otro. No cambia las piezas ni sus respuestas.</p><div className="detail-bottom-actions"><button className="text-button" type="button" onClick={()=>{if(confirm('¿Renovar el enlace? El anterior dejará de funcionar.'))void act({action:'link-rotate',clientId:client.id});}}>Renovar enlace</button><button className="text-button muted" type="button" onClick={()=>{if(confirm('¿Revocar el acceso del cliente?'))void act({action:'link-revoke',clientId:client.id});}}>Revocar enlace</button></div></details></div>}
      {message&&<label className="pilot-message">Mensaje preparado<textarea value={message} rows={4} readOnly/><button type="button" className="text-button" onClick={()=>void copy(message)}>Copiar mensaje</button><small>El mensaje se envía cuando vos pulses Enviar en WhatsApp.</small></label>}
      {requests.length>0&&<div className="pilot-staff-requests"><h4>{piece?'Solicitudes publicadas':'Revisiones compartidas'}</h4>{requests.map(r=><article key={r.id}><div><strong>{r.kind==='script'?'Guion':'Entrega'} v{r.version} · {labels[r.status]}</strong>{r.separateParts&&<p className="form-hint">{r.contentStatus&&`${r.kind==='script'?'Guion':'Entrega'}: ${labels[r.contentStatus]}`}{r.contentStatus&&r.captionStatus?' · ':''}{r.captionStatus&&`Caption: ${labels[r.captionStatus]}`}</p>}{!piece&&<p>{view?.pieces.find(p=>p.id===r.pieceId)?.title}</p>}{r.comment&&<p className="preserve-lines">{r.comment}</p>}{r.comments.map((c,i)=><p key={i}><strong>{c.author}:</strong> {c.text}</p>)}<details><summary>Ver texto publicado</summary><p className="preserve-lines">{r.text||'Sin guion'}{r.separateParts&&r.caption?`\n\nCaption\n${r.caption}`:''}</p></details></div><div>{link&&<button type="button" className="text-button" onClick={()=>void copy(pilotReviewLink(link,r.id))}>Copiar enlace de revisión</button>}{r.canRespond&&<button type="button" className="text-button muted" onClick={()=>{if(confirm('¿Retirar esta revisión? El enlace general del cliente se conserva.'))void act({action:'withdraw',clientId:client.id,requestId:r.id});}}>Retirar revisión</button>}</div></article>)}</div>}
    </fieldset>
  </section>;
}
