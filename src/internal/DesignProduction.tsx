import { APP_MODE } from '../lib/api';
import { ChangeReason } from './PieceDelivery';
import { useState } from 'react';
import { ArrowRight, FileText, Paperclip, Search } from 'lucide-react';
import type { Command, CommandResult, Piece, WorkspaceState } from '../../contracts/domain';
import { FORMAT_LABELS } from '../../contracts/domain';
import ClientAvatar from '../components/ClientAvatar';
import { activeMaterial } from '../domain/selectors';
import './design-production.css';

export function productionWaitReason(state: WorkspaceState, piece: Piece): string | null {
  if (piece.productionStage === 'recording') return 'Esperando grabación · Marketing';
  if (piece.workArea === 'marketing') return 'Pendiente de Marketing';
  const material = activeMaterial(state, piece.id);
  if (material) return material.status === 'received' ? 'Material pendiente de verificar' : 'Esperando material del cliente';
  return null;
}

function dateText(value: string | null) {
  return value ? new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`)) : 'Sin fecha asignada';
}

export default function DesignProduction({ state, today, open, execute, disabled }: {
  state: WorkspaceState; today: string; open: (id: string, tab?: 'details' | 'material' | 'delivery') => void;
  execute: (command: Command) => Promise<CommandResult>; disabled: boolean;
}) {
  const [stage, setStage] = useState('all');
  const [clientId, setClientId] = useState('all');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const production = state.pieces.filter(piece => !piece.archived && piece.status === 'production')
    .sort((a, b) => (a.plannedDate ?? '9999').localeCompare(b.plannedDate ?? '9999') || a.title.localeCompare(b.title));
  const matches = (piece: Piece) => (clientId === 'all' || piece.clientId === clientId) &&
    `${piece.title} ${state.clients.find(client => client.id === piece.clientId)?.name}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  const actionable = production.filter(piece => !productionWaitReason(state, piece));
  const filtered = actionable.filter(matches);
  const shown = filtered.filter(piece => stage === 'all' || (piece.productionStage ?? 'editing') === stage);
  const waiting = production.filter(piece => productionWaitReason(state, piece) && matches(piece));
  async function start(piece: Piece) {
    if (saving || disabled) return;
    setSaving(piece.id); setError('');
    try {
      await execute({ type: 'update-piece', pieceId: piece.id, expectedRevision: piece.revision, patch: { productionStage: 'editing', workArea: 'design' } });
    } catch (error) { setError(error instanceof Error ? error.message : 'No pudimos guardar el cambio.'); }
    finally { setSaving(null); }
  }
  return <section className="design-production" aria-label="Pendientes de Diseño">
    <div className="design-toolbar">
      <div className="production-filters" aria-label="Etapa de Diseño">
        {[['all', 'Pendientes'], ['ready', 'Por empezar'], ['editing', 'En curso']].map(([value, label]) => <button key={value} className="button secondary" aria-pressed={stage === value} onClick={() => setStage(value)}>{label} <span>{filtered.filter(piece => value === 'all' || (piece.productionStage ?? 'editing') === value).length}</span></button>)}
      </div>
      <div className="filters">
        <label className="search-box"><Search size={17}/><input aria-label="Buscar en producción" placeholder="Buscar pieza o cliente…" value={search} onChange={event => setSearch(event.target.value)}/></label>
        <select aria-label="Filtrar por cliente" value={clientId} onChange={event => setClientId(event.target.value)}><option value="all">Todos los clientes</option>{state.clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}</select>
      </div>
    </div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    <p className="design-list-note">Primero las fechas más próximas. Incluye piezas futuras y sin fecha.</p>
    <div className="design-task-list">
      {shown.map(piece => {
        const client = state.clients.find(client => client.id === piece.clientId)!;
        const ready = piece.productionStage === 'ready';
        const overdue = !!piece.plannedDate && piece.plannedDate < today;
        return <article className="design-task" key={piece.id} aria-label={piece.title}>
          <div className="design-task-identity"><ClientAvatar client={client}/><div><span>{client.name} · {FORMAT_LABELS[piece.format]}</span><h2><button onClick={() => open(piece.id)}>{piece.title}</button></h2></div></div>
          <ChangeReason piece={piece} compact/><div className={`design-date ${overdue ? 'overdue' : ''}`}><span>Publicación prevista</span><strong>{dateText(piece.plannedDate)}</strong>{overdue ? <small>Fecha vencida</small> : piece.plannedDate === today ? <small>Hoy</small> : null}</div>
          <div className="design-task-actions"><span className={`design-stage ${ready ? 'ready' : ''}`}>{ready ? 'Lista para producir' : 'En edición / diseño'}</span>
            <div><a className="button secondary" href={`/text/${encodeURIComponent(piece.id)}`} target="_blank" rel="noopener noreferrer"><FileText size={16}/>Guion y texto</a><button className="button secondary" onClick={() => open(piece.id, 'material')}><Paperclip size={16}/>Material</button>
            {APP_MODE!=='demo'&&<button className="button secondary" onClick={()=>open(piece.id,'delivery')}>Entrega</button>}{ready ? <button className="button primary" disabled={disabled || !!saving} onClick={() => void start(piece)}>{saving === piece.id ? 'Guardando…' : 'Empezar a producir'}<ArrowRight size={16}/></button> : <button className="button primary" onClick={() => open(piece.id)}>Abrir pieza<ArrowRight size={16}/></button>}</div>
          </div>
        </article>;
      })}
      {!shown.length && <div className="design-empty"><h2>{actionable.length ? 'No hay pendientes con estos filtros.' : 'No hay piezas listas para Diseño.'}</h2><p>{actionable.length ? 'Podés cambiar la etapa, el cliente o la búsqueda.' : 'Las piezas aparecerán acá cuando Marketing las pase a producción.'}</p>{(stage !== 'all' || clientId !== 'all' || search) && <button className="button secondary" onClick={() => { setStage('all'); setClientId('all'); setSearch(''); }}>Quitar filtros</button>}</div>}
    </div>
    <details className="design-waiting"><summary>En espera ({waiting.length})</summary><p>Necesitan un paso previo antes de continuar en Diseño.</p>{waiting.map(piece => <button className="design-waiting-row" key={piece.id} onClick={() => open(piece.id)}><span><strong>{piece.title}</strong><small>{state.clients.find(client => client.id === piece.clientId)?.name} · {productionWaitReason(state, piece)}</small></span><span>{dateText(piece.plannedDate)}</span><ArrowRight size={16}/></button>)}{!waiting.length && <p>No hay piezas de producción en espera con estos filtros.</p>}</details>
  </section>;
}
