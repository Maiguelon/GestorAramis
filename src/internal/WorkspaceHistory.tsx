import { belongsToClient, pieceClientNames, pieceClientLabel } from '../../contracts/piece-clients';
import { useState } from 'react';
import { Archive, ChevronRight, Search } from 'lucide-react';
import type { WorkspaceState } from '../../contracts/domain';
import { archivedWork, historicalWork } from '../domain/work-lists';
import { pieceMonth } from '../domain/selectors';
import PieceClientAvatar from '../components/PieceClientAvatar';
import FormatBadge from '../components/FormatBadge';
import { Empty, Status } from '../components/ui';
import { dateLabel } from './Workspace';

export default function WorkspaceHistory({ state, today, select }: { state: WorkspaceState; today: string; select: (id: string) => void }) {
  const [category, setCategory] = useState<'completed' | 'archived'>('completed');
  const [clientId, setClientId] = useState('all');
  const [month, setMonth] = useState('');
  const [search, setSearch] = useState('');
  const source = category === 'completed' ? historicalWork(state, today) : archivedWork(state);
  const shown = source.flatMap(piece => {
    const client = state.clients.find(client => client.id === piece.clientId);
    // Retired clients are omitted from the workspace catalog; their old pieces may still be returned.
    // Join to that catalog before rendering, searching or offering recovery of a piece.
    if (!client || (clientId !== 'all' && !belongsToClient(piece, clientId))
      || (month && pieceMonth(piece) !== month)
      || !`${piece.title} ${pieceClientNames(piece, state.clients)}`.toLowerCase().includes(search.toLowerCase())) return [];
    return [{ piece, client }];
  });
  return <section className="workspace-history">
    <div className="history-categories" aria-label="Categoría del historial">
      <button className="button secondary" aria-pressed={category === 'completed'} onClick={() => setCategory('completed')}>Completados</button>
      <button className="button secondary" aria-pressed={category === 'archived'} onClick={() => setCategory('archived')}>Archivados</button>
    </div>
    <div className="filters history-filters">
      <label className="search-box"><Search size={17}/><input aria-label="Buscar en historial" placeholder="Buscar contenido o cliente…" value={search} onChange={event => setSearch(event.target.value)}/></label>
      <select aria-label="Cliente del historial" value={clientId} onChange={event => setClientId(event.target.value)}><option value="all">Todos los clientes</option>{state.clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}</select>
      <label className="history-month">Mes del plan<input type="month" value={month} onChange={event => setMonth(event.target.value)}/></label>
      {month && <button className="text-button" onClick={() => setMonth('')}>Todos los meses</button>}
    </div>
    <p className="form-hint">{category === 'completed' ? 'Aprobados de fechas pasadas y publicaciones anteriores. Siguen disponibles en el calendario y en el plan del cliente.' : 'Piezas retiradas del trabajo y del calendario. Podés consultarlas o recuperarlas a planificación.'}</p>
    <div className="history-list">{shown.length ? shown.map(({ piece }) => {
      return <button className="history-row" key={piece.id} onClick={() => select(piece.id)} aria-label={`Abrir ${piece.title}`}>
        <PieceClientAvatar piece={piece} clients={state.clients}/><div className="history-piece"><span title={pieceClientNames(piece, state.clients)}>{pieceClientLabel(piece, state.clients)} · <FormatBadge format={piece.format}/></span><strong>{piece.title}</strong><small>Plan de {dateLabel(`${pieceMonth(piece)}-01`, { month: 'long', year: 'numeric' })}</small></div>
        <span className="history-date">{dateLabel(piece.plannedDate, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        {piece.archived ? <span className="archived-label"><Archive size={14}/>Archivado</span> : <Status status={piece.status}/>}
        <ChevronRight size={17}/>
      </button>;
    }) : <Empty><Archive size={28}/><h3>No hay piezas en este historial con estos filtros.</h3></Empty>}</div>
    <p className="form-hint">{shown.length} {shown.length === 1 ? 'pieza' : 'piezas'} · Más recientes primero.</p>
  </section>;
}
