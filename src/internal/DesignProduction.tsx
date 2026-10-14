import { useState } from 'react';
import { ArrowRight, FileText, Paperclip, Search } from 'lucide-react';
import type { Piece, WorkspaceState } from '../../contracts/domain';
import ClientAvatar from '../components/ClientAvatar';
import FormatBadge from '../components/FormatBadge';
import { comparePieceDate, isApprovedPiece, isHistoricalPiece, productionWaitReason } from '../domain/work-lists';
import { APP_MODE } from '../lib/api';
import { ChangeReason } from './PieceDelivery';
import './design-production.css';
import './design-consultation.css';

export { productionWaitReason } from '../domain/work-lists';

type DesignCategory = 'production' | 'waiting' | 'review' | 'approved';
const categoryLabels: Record<DesignCategory, string> = {
  production: 'Para producción', waiting: 'Planificación', review: 'Revisión', approved: 'Aprobados',
};
const categoryNotes: Record<DesignCategory, string> = {
  production: 'Primero las fechas más próximas. Incluye piezas futuras y sin fecha.',
  waiting: 'Preparación de Marketing. Todavía no requieren trabajo de Diseño.',
  review: 'Entregas pendientes de revisión por Marketing.',
  approved: 'Trabajo aprobado hasta su fecha prevista inclusive. Las piezas anteriores se consultan en Historial desde Gestión.',
};
const emptyMessages: Record<DesignCategory, [string, string]> = {
  production: ['No hay piezas listas para Diseño.', 'Las piezas aparecerán acá cuando Marketing las pase a producción.'],
  waiting: ['No hay piezas en planificación.', 'Marketing prepara el contenido y lo pasa a producción cuando está listo para Diseño.'],
  review: ['No hay piezas en revisión.', 'Las entregas enviadas a Marketing aparecerán acá.'],
  approved: ['No hay aprobados por ahora.', 'Las piezas aprobadas permanecen acá hasta su fecha prevista.'],
};

function dateText(value: string | null) {
  return value ? new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`)) : 'Sin fecha asignada';
}

export default function DesignProduction({ state, today, open }: {
  state: WorkspaceState; today: string; open: (id: string, tab?: 'details' | 'material' | 'delivery') => void;
}) {
  const [clientId, setClientId] = useState('all');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<DesignCategory>('production');
  const active = state.pieces.filter(piece => !piece.archived);
  const groups: Record<DesignCategory, Piece[]> = {
    production: active.filter(piece => piece.status === 'production' && !productionWaitReason(state, piece)),
    waiting: active.filter(piece => piece.status === 'planned' || (piece.status === 'production' && !!productionWaitReason(state, piece))),
    review: active.filter(piece => piece.status === 'review'),
    approved: active.filter(piece => isApprovedPiece(piece) && !isHistoricalPiece(piece, today)),
  };
  const matches = (piece: Piece) => (clientId === 'all' || piece.clientId === clientId) &&
    `${piece.title} ${state.clients.find(client => client.id === piece.clientId)?.name ?? ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  const shown = groups[category].filter(matches).sort(comparePieceDate);
  const consultation = category === 'review' || category === 'approved';
  const hasFilters = clientId !== 'all' || !!search.trim();
  return <section className="design-production" aria-label="Pendientes de Diseño">
    <div className="design-toolbar">
      <div className="filters">
        <label className="search-box"><Search size={17}/><input aria-label="Buscar en producción" placeholder="Buscar pieza o cliente…" value={search} onChange={event => setSearch(event.target.value)}/></label>
        <select aria-label="Filtrar por cliente" value={clientId} onChange={event => setClientId(event.target.value)}><option value="all">Todos los clientes</option>{state.clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}</select>
      </div>
      <div className="design-category-row">
        <label className="design-category">Ver<select aria-label="Ver en Diseño" value={category} onChange={event => setCategory(event.target.value as DesignCategory)}>{(Object.keys(categoryLabels) as DesignCategory[]).map(value => <option key={value} value={value}>{categoryLabels[value]} ({groups[value].filter(matches).length})</option>)}</select></label>
        <span className="design-result-count" aria-live="polite">{shown.length} {shown.length === 1 ? 'pieza' : 'piezas'}</span>
      </div>
    </div>
    <p className="design-list-note">{categoryNotes[category]}</p>
    <div className="design-task-list">
      {shown.map(piece => {
        const client = state.clients.find(client => client.id === piece.clientId)!;
        const overdue = !isApprovedPiece(piece) && !!piece.plannedDate && piece.plannedDate < today;
        const stage = category === 'waiting' ? piece.status === 'planned' ? 'Planificación · Marketing' : productionWaitReason(state, piece) : category === 'approved' ? 'Aprobado' : categoryLabels[category];
        return <article className="design-task" key={piece.id} aria-label={piece.title}>
          <div className="design-task-identity"><ClientAvatar client={client}/><div><span>{client.name} · <FormatBadge format={piece.format}/></span><h2><button onClick={() => open(piece.id)}>{piece.title}</button></h2></div></div>
          <ChangeReason piece={piece} compact/><div className={`design-date ${overdue ? 'overdue' : ''}`}><span>Publicación prevista</span><strong>{dateText(piece.plannedDate)}</strong>{overdue ? <small>Fecha vencida</small> : piece.plannedDate === today ? <small>Hoy</small> : null}</div>
          <div className="design-task-actions"><span className="design-stage">{stage}</span>
            <div><a className="button secondary" href={`/text/${encodeURIComponent(piece.id)}`} target="_blank" rel="noopener noreferrer"><FileText size={16}/>Guion y texto</a><button className="button secondary" onClick={() => open(piece.id, 'material')}><Paperclip size={16}/>Material</button>
              {!consultation && APP_MODE !== 'demo' && <button className="button secondary" onClick={() => open(piece.id, 'delivery')}>Entrega</button>}
              <button className="button primary" onClick={() => open(piece.id, consultation ? 'delivery' : 'details')}>{consultation ? 'Ver entrega' : 'Abrir pieza'}<ArrowRight size={16}/></button>
            </div>
          </div>
        </article>;
      })}
      {!shown.length && <div className="design-empty"><h2>{groups[category].length && hasFilters ? 'No hay pendientes con estos filtros.' : emptyMessages[category][0]}</h2><p>{groups[category].length && hasFilters ? 'Podés cambiar el cliente o la búsqueda.' : emptyMessages[category][1]}</p>{hasFilters && <button className="button secondary" onClick={() => { setClientId('all'); setSearch(''); }}>Quitar filtros</button>}</div>}
    </div>
  </section>;
}
