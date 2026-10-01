import { useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Archive, FileText, History, Paperclip, RotateCcw } from 'lucide-react';
import type { Command, CommandResult, Piece, WorkspaceState } from '../../contracts/domain';
import { FORMAT_LABELS } from '../../contracts/domain';
import { Modal } from '../components/ui';
import { APP_MODE } from '../lib/api';
import ClientAvatar from '../components/ClientAvatar';
import DriveMaterials from './DriveMaterials';
import TeamMaterials from './TeamMaterials';
import { DeliveryPreview } from './PieceDelivery';
import PendingSave, { hasPendingSave } from './PendingSave';

export default function ArchivedPieceDetail({ piece, state, execute, onClose }: { piece: Piece; state: WorkspaceState; execute: (command: Command) => Promise<CommandResult>; onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const client = state.clients.find(item => item.id === piece.clientId)!;
  const reviews = state.reviews.filter(review => review.pieceId === piece.id).sort((a,b) => b.version-a.version);
  async function restore() {
    if (saving || downloading || hasPendingSave('restore-piece')) return;
    if (!confirm('¿Recuperar esta pieza a Planificación? Se conservan textos, archivos e historial. Las aprobaciones anteriores y los enlaces revocados no vuelven a activarse.')) return;
    setSaving(true);
    try { await execute({ type: 'restore-piece', pieceId: piece.id, expectedRevision: piece.revision }); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo recuperar la pieza.'); }
    finally { setSaving(false); }
  }
  return <Modal open title={piece.title} description={`${client.name} · ${FORMAT_LABELS[piece.format]}`} wide onClose={() => { if (!saving && !downloading) onClose(); }}>
    <div className="detail-client-identity"><ClientAvatar client={client}/><div><strong>{client.name}</strong><span className="archived-label"><Archive size={14}/>Archivado · Sólo consulta</span></div></div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    <Tabs.Root defaultValue="text"><Tabs.List className="detail-tabs" aria-label="Secciones del contenido archivado">
      <Tabs.Trigger value="text"><FileText size={16}/>Texto</Tabs.Trigger><Tabs.Trigger value="delivery">Entrega</Tabs.Trigger><Tabs.Trigger value="material"><Paperclip size={16}/>Material</Tabs.Trigger><Tabs.Trigger value="history"><History size={16}/>Historial</Tabs.Trigger>
    </Tabs.List>
      <Tabs.Content value="text" className="detail-tab-content archived-text">
        {piece.format !== 'story' && <><h3>Guion e instrucciones de producción</h3><p className="preserve-lines">{piece.script || 'Sin indicaciones.'}</p></>}
        <h3>{piece.format === 'story' ? 'Contenido de la historia' : 'Texto de publicación'}</h3><p className="preserve-lines">{piece.caption || 'Sin texto.'}</p>
        {piece.format === 'story' && piece.script?.trim() && <details><summary>Indicaciones anteriores · Sólo equipo</summary><p className="preserve-lines">{piece.script}</p></details>}
        {piece.internalNote && <><h3>Nota interna</h3><p className="preserve-lines">{piece.internalNote}</p></>}
      </Tabs.Content>
      <Tabs.Content value="delivery" className="detail-tab-content">{piece.deliveries?.length ? [...piece.deliveries].sort((a,b) => b.version-a.version).map(delivery => <DeliveryPreview key={delivery.id} delivery={delivery}/>) : reviews.map(review => <section key={review.id}><h3>Revisión v{review.version}</h3><p className="preserve-lines">{review.caption}</p>{review.assets.map(asset => <p key={asset.id}>{asset.url?.startsWith('/demo/') ? <a href={asset.url} target="_blank" rel="noreferrer">{asset.name}</a> : asset.name}</p>)}</section>)}
        {!piece.deliveries?.length && !reviews.length && <p className="form-hint">No hay versiones enviadas de esta pieza.</p>}
        {APP_MODE !== 'demo' && <details className="delivery-history"><summary>Archivos finales originales</summary><p className="form-hint">Incluye los archivos cargados antes de enviar una versión. Las entregas de arriba conservan los archivos exactos de cada revisión.</p><DriveMaterials readOnly purpose="delivery" pieceId={piece.id} pieceTitle={piece.title} onBusy={setDownloading}/></details>}
      </Tabs.Content>
      <Tabs.Content value="material" className="detail-tab-content">{APP_MODE === 'demo' ? <TeamMaterials readOnly piece={piece} act={async () => undefined} onBusy={setDownloading}/> : <DriveMaterials readOnly pieceId={piece.id} pieceTitle={piece.title} onBusy={setDownloading}/>}</Tabs.Content>
      <Tabs.Content value="history" className="detail-tab-content"><div className="activity-list">{state.activities.filter(item => item.pieceId === piece.id).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map(item => <article key={item.id}><span className="activity-dot"/><div><p>{item.text}</p><small>{item.actor} · {new Date(item.createdAt).toLocaleString('es-AR')}</small></div></article>)}{state.responses.filter(response => reviews.some(review => review.id === response.reviewId)).map(response => <article key={response.id}><span className="activity-dot"/><div><p>{response.comment || 'Contenido aprobado.'}</p><small>{response.authorName} · {new Date(response.createdAt).toLocaleString('es-AR')}</small></div></article>)}</div></Tabs.Content>
    </Tabs.Root>
    <div className="detail-bottom-actions"><button type="button" className="button secondary" disabled={saving || downloading || hasPendingSave('restore-piece')} onClick={() => void restore()}><RotateCcw size={16}/>{saving ? 'Recuperando…' : 'Recuperar a planificación'}</button></div>
    <PendingSave type="restore-piece" targetId={piece.id} onConfirmed={onClose} onError={setError}/>
  </Modal>;
}
