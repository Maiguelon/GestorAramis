import { useState } from 'react';
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
type Props = {client:Client;piece?:Piece;disabled?:boolean};
export default function ClientPilot(props:Props) {
  const inherited = useClientPilot();
  return inherited ? <ClientPilotPanel {...props} embedded/> : <ClientPilotProvider clientId={props.client.id} revision={props.piece?.revision}><ClientPilotPanel {...props}/></ClientPilotProvider>;
}
function ClientPilotPanel({client,piece,disabled=false,embedded=false}:Props&{embedded?:boolean}) {
  const controller=useClientPilot()!;
  const {view,busy,pending,refresh}=controller;
  const script=piece?.script??'';
  const [notice,setNotice]=useState(''),[message,setMessage]=useState('');
  const shared=piece&&isMultiClient(piece);
  if(shared)return <p className="notice-banner">Las piezas multicliente se gestionan sólo dentro del equipo.</p>;
  async function act(action:PilotAction){
    setNotice('');
    await controller.save(action);
  }
  async function copy(text:string){try{await navigator.clipboard.writeText(text);setNotice('Copiado.');}catch{setNotice('No pudimos copiar. Seleccioná el enlace o el mensaje de abajo.');}}
  const requests=view?.requests.filter(r=>!piece||r.pieceId===piece.id)??[];
  const count=view?.requests.filter(r=>r.canRespond).length??0;
  const delivery=piece?latestDelivery(piece):undefined;
  const final=delivery&&!delivery.invalidatedAt&&((piece?.status==='review'&&delivery.status==='pending')||(['approved','scheduled','published'].includes(piece?.status??'')&&delivery.status==='approved'))?delivery:undefined;
  const canPublish=!!final||['planned','production'].includes(piece?.status??'');
  const link=view?.linkUrl;
  return <section className="client-pilot-controls">{!piece&&<><div className="subsection-heading"><h3>Acceso del cliente</h3><button type="button" className="text-button" disabled={busy||!!pending} onClick={()=>void refresh()}><RefreshCw size={14}/>Recargar estado</button></div>
    <p className="form-hint">Piloto por enlace privado. Quien tenga el enlace puede ver lo compartido y responder por este cliente. Las notas internas y el material de producción quedan dentro del equipo.</p></>}
    {!embedded&&<ClientPilotFeedback/>}{notice&&<p role="status" className="notice-banner">{notice}</p>}
    <fieldset className="save-fieldset" disabled={busy||!!pending||disabled||!view}>
      {piece&&<div className="pilot-publish form-stack">
        <div className="detail-bottom-actions"><button type="button" className="button primary" disabled={!canPublish} onClick={()=>{
          if(confirm('¿Actualizar la vista del cliente con la entrega vigente o el guion y caption guardados? Se incluirá en su calendario y se reemplazará la revisión anterior.'))void act({action:'publish',clientId:client.id,pieceId:piece.id,expectedRevision:piece.revision,kind:final?'delivery':'script',...(final?{deliveryId:final.id}:{text:script.trim()}),separateParts:true});
        }}>Actualizar vista del cliente</button></div>
        {!canPublish&&<p className="form-hint">Prepará la entrega desde Entrega antes de compartir esta etapa.</p>}
        {disabled&&<p className="form-hint">Guardá los cambios de la pieza antes de actualizar la vista del cliente.</p>}
      </div>}
      {!link?<button className="button secondary" type="button" onClick={()=>void act({action:'link-ensure',clientId:client.id})}><Link2 size={16}/>Crear enlace del cliente</button>:<div className="pilot-link-tools"><label>Enlace privado<input aria-label="Enlace privado del cliente" value={link} readOnly onFocus={e=>e.target.select()}/></label><div className="detail-bottom-actions"><button type="button" className="button secondary" onClick={()=>void copy(link)}><Copy size={15}/>Copiar enlace</button><a className="button secondary" href={link} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Ver como cliente</a><button type="button" className="button primary" onClick={()=>{const wa=pilotWhatsApp(client.contactName||client.name,link,count,client.phone);setMessage(wa.text);window.open(wa.url,'_blank','noopener,noreferrer');}}><MessageCircle size={15}/>Preparar WhatsApp{count>0?` (${count})`:''}</button></div><details><summary>Administrar enlace</summary><p className="form-hint">Renovarlo invalida el anterior. Revocarlo cierra el acceso hasta que crees otro. No cambia las piezas ni sus respuestas.</p><div className="detail-bottom-actions"><button className="text-button" type="button" onClick={()=>{if(confirm('¿Renovar el enlace? El anterior dejará de funcionar.'))void act({action:'link-rotate',clientId:client.id});}}>Renovar enlace</button><button className="text-button muted" type="button" onClick={()=>{if(confirm('¿Revocar el acceso del cliente?'))void act({action:'link-revoke',clientId:client.id});}}>Revocar enlace</button></div></details></div>}
      {message&&<label className="pilot-message">Mensaje preparado<textarea value={message} rows={4} readOnly/><button type="button" className="text-button" onClick={()=>void copy(message)}>Copiar mensaje</button><small>El mensaje se envía cuando vos pulses Enviar en WhatsApp.</small></label>}
      {requests.length>0&&<div className="pilot-staff-requests"><h4>{piece?'Solicitudes publicadas':'Revisiones compartidas'}</h4>{requests.map(r=><article key={r.id}><div><strong>{r.kind==='script'?'Guion':'Entrega'} v{r.version} · {labels[r.status]}</strong>{r.separateParts&&<p className="form-hint">{r.contentStatus&&`${r.kind==='script'?'Guion':'Entrega'}: ${labels[r.contentStatus]}`}{r.contentStatus&&r.captionStatus?' · ':''}{r.captionStatus&&`Caption: ${labels[r.captionStatus]}`}</p>}{!piece&&<p>{view?.pieces.find(p=>p.id===r.pieceId)?.title}</p>}{r.comment&&<p className="preserve-lines">{r.comment}</p>}{r.comments.map((c,i)=><p key={i}><strong>{c.author}:</strong> {c.text}</p>)}<details><summary>Ver texto publicado</summary><p className="preserve-lines">{r.text||'Sin guion'}{r.separateParts&&r.caption?`\n\nCaption\n${r.caption}`:''}</p></details></div><div>{link&&<button type="button" className="text-button" onClick={()=>void copy(pilotReviewLink(link,r.id))}>Copiar enlace de revisión</button>}{r.canRespond&&<button type="button" className="text-button muted" onClick={()=>{if(confirm('¿Retirar esta revisión? El enlace general del cliente se conserva.'))void act({action:'withdraw',clientId:client.id,requestId:r.id});}}>Retirar revisión</button>}</div></article>)}</div>}
    </fieldset>
  </section>;
}
