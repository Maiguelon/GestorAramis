import { useMemo, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Piece, WorkspaceState } from '../../contracts/domain';
import { FORMAT_LABELS } from '../../contracts/domain';
import { localDate, pieceMonth } from '../domain/selectors';
import ClientAvatar from '../components/ClientAvatar';
import { Modal, Status } from '../components/ui';
import './internal-calendar.css';

type Props = {
  pieces: Piece[];
  state: WorkspaceState;
  month: string;
  setMonth: (month: string) => void;
  select: (id: string) => void;
  today: string;
};

function dateLabel(value: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('es-AR', options).format(new Date(`${value}T12:00:00`));
}

export default function InternalCalendar({ pieces, state, month, setMonth, select, today }: Props) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const days = useMemo(() => {
    const first = new Date(`${month}-01T12:00:00`);
    first.setDate(first.getDate() - (first.getDay() + 6) % 7);
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(first);
      day.setDate(day.getDate() + index);
      return localDate(day);
    });
  }, [month]);
  const byDate = useMemo(() => {
    const grouped = new Map<string, Piece[]>();
    for (const piece of pieces) {
      if (!piece.plannedDate && pieceMonth(piece) !== month) continue;
      const date = piece.plannedDate ?? '';
      grouped.set(date, [...(grouped.get(date) ?? []), piece]);
    }
    return grouped;
  }, [pieces,month]);
  const dayPieces = selectedDay ? byDate.get(selectedDay) ?? [] : [];
  function move(step: number) {
    const date = new Date(`${month}-01T12:00:00`);
    date.setMonth(date.getMonth() + step);
    setMonth(localDate(date).slice(0, 7));
  }
  function openPiece(id: string) {
    setSelectedDay(null);
    select(id);
  }

  return <section className="internal-calendar calendar-density">
    <div className="calendar-controls">
      <h2>{dateLabel(`${month}-01`, { month: 'long', year: 'numeric' })}</h2>
      <div>
        <button className="text-button" onClick={() => setMonth(today.slice(0, 7))}>Hoy</button>
        <button className="icon-button" aria-label="Mes anterior" onClick={() => move(-1)}><ChevronLeft size={18} /></button>
        <button className="icon-button" aria-label="Mes siguiente" onClick={() => move(1)}><ChevronRight size={18} /></button>
      </div>
    </div>
    <div className="calendar-scroll">
      <div className="internal-weekdays">{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => <span key={day}>{day}</span>)}</div>
      <div className="internal-month-grid">{days.map(day => {
        const scheduled = byDate.get(day) ?? [];
        const fullDate = dateLabel(day, { day: 'numeric', month: 'long', year: 'numeric' });
        return <div className={`internal-day ${day.slice(0, 7) !== month ? 'outside' : ''} ${day === today ? 'today' : ''}`} key={day} data-date={day}>
          <div className="internal-day-heading">
            {scheduled.length ? <button className="internal-day-number" aria-label={`Ver ${scheduled.length} contenidos del ${fullDate}`} onClick={() => setSelectedDay(day)}>{Number(day.slice(-2))}</button> : <span className="internal-day-number">{Number(day.slice(-2))}</span>}
          </div>
          <div className="internal-day-pieces">{scheduled.slice(0, 2).map(piece => {
            const client = state.clients.find(client => client.id === piece.clientId);
            return <button className="internal-calendar-piece has-client-logo" onClick={() => select(piece.id)} aria-label={`Abrir ${piece.title}`} title={`${piece.title} · ${client?.name ?? ''}`} key={piece.id}>
              {client&&<ClientAvatar client={client}/>}<i style={{ background: client?.color }} /><strong>{piece.title}</strong><small>{client?.name}</small>
            </button>;
          })}</div>
          {scheduled.length > 2 && <button className="internal-day-more" aria-label={`Ver los ${scheduled.length} contenidos del ${fullDate}, ${scheduled.length - 2} más`} onClick={() => setSelectedDay(day)}>+{scheduled.length - 2} más</button>}
        </div>;
      })}</div>
    </div>
    {!!byDate.get('')?.length && <div className="undated-list"><h3>Sin fecha · este mes</h3>{byDate.get('')!.map(piece => <button className="button secondary" key={piece.id} onClick={() => select(piece.id)}>{piece.title}<ArrowRight size={14} /></button>)}</div>}
    <Modal open={selectedDay !== null} onClose={() => setSelectedDay(null)} title={selectedDay ? dateLabel(selectedDay, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Contenidos del día'} description={`${dayPieces.length} contenidos con los filtros actuales.`}>
      <div className="calendar-day-list">{dayPieces.map(piece => {
        const client = state.clients.find(client => client.id === piece.clientId);
        return <button className="calendar-day-row" key={piece.id} onClick={() => openPiece(piece.id)} aria-label={`Abrir ${piece.title}`}>
          {client&&<ClientAvatar client={client}/>}
          <span className="calendar-day-content"><small>{client?.name} · {FORMAT_LABELS[piece.format]}</small><strong>{piece.title}</strong></span>
          <Status status={piece.status} /><ChevronRight size={16} />
        </button>;
      })}</div>
    </Modal>
  </section>;
}
