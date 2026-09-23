import { useEffect, useState } from 'react';
import type { Command, CommandResult, Delivery, Piece } from '../../contracts/domain';
import DriveMaterials, { DriveAssetPreview } from './DriveMaterials';

import { drivePost, type DriveAsset } from '../lib/drive-api';
import { sharedWorkspace } from '../lib/shared-api';
import './delivery.css';

type Act = (command: Command) => Promise<CommandResult | undefined>;
export function latestDelivery(piece: Piece) { return [...(piece.deliveries??[])].sort((a,b)=>b.version-a.version)[0]; }
export function ChangeReason({piece, compact=false}:{piece:Piece;compact?:boolean}) {
  const delivery=latestDelivery(piece);
  if(piece.status!=='production'||delivery?.status!=='changes')return null;
  return <aside className={`delivery-changes ${compact?'compact':''}`}><strong>Cambios solicitados · v{delivery.version}</strong><p>{delivery.comment}</p>{!compact&&<small>{delivery.source==='client'?'Devolución del cliente':'Devolución del equipo'} · Registró {delivery.decidedBy}{delivery.decidedAt?` · ${new Date(delivery.decidedAt).toLocaleString('es-AR')}`:''}</small>}</aside>;
}

function DeliveryPreview({delivery}:{delivery:Delivery}) {
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    let active=true;
    const renew=()=>{void drivePost('/api/drive/media-session').then(()=>{if(active){setReady(true);setError('');}}).catch(()=>{if(active){setReady(false);setError('No se pudo abrir el acceso a los archivos. Volvé a abrir Entrega para reintentar.');}});};
    renew(); const timer=setInterval(renew,5*60_000);
    return()=>{active=false;clearInterval(timer);};
  },[]);
  return <section className="delivery-version"><h3>Entrega v{delivery.version} · {({pending:'En revisión',approved:'Aprobada',changes:'Cambios solicitados'})[delivery.status]}</h3><p className="form-hint">{delivery.createdBy} · {new Date(delivery.createdAt).toLocaleString('es-AR')}</p>
    {error&&<p role="alert" className="error-banner">{error}</p>}
    <div className="team-asset-list">{delivery.assets.map(asset=><DriveAssetPreview key={asset.id} asset={{...asset,source:'drive'}} ready={ready} version={0} disabled={false} trashing={false}/>)}</div>
    <h4>Texto de esta versión</h4><p className="preserve-lines">{delivery.caption||'Sin texto de publicación.'}</p>
    {delivery.comment&&<blockquote className="delivery-feedback"><strong>{delivery.source==='client'?'Cliente':'Equipo'} · {delivery.decidedBy}</strong><p>{delivery.comment}</p></blockquote>}

  </section>;
}

export default function PieceDelivery({piece,act,onBusy}:{piece:Piece;act:Act;onBusy:(busy:boolean)=>void}) {
  const [assets,setAssets]=useState<DriveAsset[]>([]);
  const [selected,setSelected]=useState<string[]>([]);
  const [uploadBusy,setUploadBusy]=useState(false);
  const [comment,setComment]=useState('');
  const [source,setSource]=useState<'team'|'client'>('team');
  const [sending,setSending]=useState(false);
  const [reviewRevision,setReviewRevision]=useState(piece.revision);
  const versions=[...(piece.deliveries??[])].sort((a,b)=>b.version-a.version);
  const latest=versions[0];
  const draft=piece.status==='production';
  useEffect(()=>{onBusy(uploadBusy||sending);return()=>onBusy(false);},[uploadBusy,sending,onBusy]);
  async function submit(){
    if(uploadBusy||sending||!selected.length)return;
    setSending(true);
    try{const result=await act({type:'submit-delivery',pieceId:piece.id,expectedRevision:piece.revision,assetIds:selected});if(result){setSelected([]);setComment('');}}
    finally{setSending(false);}
  }
  async function decide(decision:'approved'|'changes'){
    if(!latest||sending||reviewRevision!==piece.revision||(decision==='changes'&&!comment.trim()))return;
    setSending(true);
    try{const result=await act({type:'review-delivery',pieceId:piece.id,expectedRevision:reviewRevision,deliveryId:latest.id,decision,comment:comment.trim(),source});if(result)setComment('');}
    finally{setSending(false);}
  }
  function move(index:number,offset:number){setSelected(current=>{const next=[...current];[next[index],next[index+offset]]=[next[index+offset],next[index]];return next;});}
  return <div className="delivery-panel">
    {draft&&<><h3>Preparar entrega{latest?` v${latest.version+1}`:''}</h3><p className="form-hint">Subí los archivos terminados y elegí cuáles enviar. Las versiones anteriores se conservan. Subir archivos no cambia el estado.</p>
      <DriveMaterials key={piece.id} purpose="delivery" pieceId={piece.id} pieceTitle={piece.title} onBusy={setUploadBusy} onChanged={()=>void sharedWorkspace.refresh()} onAssets={setAssets} selectedIds={selected} onToggle={id=>setSelected(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id])}/>
      {selected.length>0&&<section aria-label="Orden de la entrega"><h4>Archivos seleccionados · {selected.length}</h4><ol className="delivery-order">{selected.map((id,index)=><li key={id}><span>{assets.find(a=>a.id===id)?.name??'Archivo no disponible'}</span><button type="button" className="text-button" aria-label={`Subir archivo ${index+1}`} disabled={index===0} onClick={()=>move(index,-1)}>↑</button><button type="button" className="text-button" aria-label={`Bajar archivo ${index+1}`} disabled={index===selected.length-1} onClick={()=>move(index,1)}>↓</button></li>)}</ol></section>}
      <h4>Texto que se enviará con esta versión</h4><p className="preserve-lines">{piece.caption||'Sin texto de publicación. Podés agregarlo desde Detalles.'}</p>
      <button type="button" className="button primary" disabled={uploadBusy||sending||!selected.length||selected.some(id=>!assets.some(a=>a.id===id))} onClick={()=>void submit()}>{sending?'Guardando…':'Enviar a revisión'}</button>
      {uploadBusy&&<p className="form-hint">Terminá o quitá las cargas pendientes antes de enviar.</p>}
    </>}
    {!draft&&!latest&&<p className="form-hint">La entrega se prepara cuando la pieza está en Producción.</p>}
    {latest&&<DeliveryPreview key={latest.id} delivery={latest}/>}
    {latest&&['review','approved','scheduled'].includes(piece.status)&&<form className="form-stack delivery-decision" onSubmit={event=>{event.preventDefault();void decide('changes');}}>
      {reviewRevision!==piece.revision&&<div className="notice-banner">La pieza cambió mientras la revisabas. Comprobá la entrega antes de responder. <button type="button" className="text-button" onClick={()=>setReviewRevision(piece.revision)}>Revisé los datos actuales</button></div>}
      <h3>Revisión</h3><label>Origen de la respuesta<select value={source} onChange={e=>setSource(e.target.value as 'team'|'client')}><option value="team">Equipo</option><option value="client">Cliente (registrada por el equipo)</option></select></label>
      <label>Comentario / motivo de los cambios<textarea value={comment} onChange={e=>setComment(e.target.value)} maxLength={10000} rows={3} placeholder="Indicá qué debe corregirse. Eliana lo verá al abrir la pieza."/></label>
      <div className="detail-bottom-actions"><button className="button secondary" type="submit" disabled={!comment.trim()||sending||reviewRevision!==piece.revision}>Pedir cambios y volver a producción</button>{piece.status==='review'&&<button type="button" className="button primary" disabled={sending||reviewRevision!==piece.revision} onClick={()=>void decide('approved')}>Aprobar entrega</button>}</div>
      <p className="form-hint">La respuesta queda registrada por tu usuario. No envía mensajes al cliente.</p>
    </form>}
    {versions.length>1&&<details className="delivery-history"><summary>Versiones anteriores ({versions.length-1})</summary>{versions.slice(1).map(delivery=><details key={delivery.id}><summary>Entrega v{delivery.version}</summary><DeliveryPreview delivery={delivery}/></details>)}</details>}
  </div>;
}
