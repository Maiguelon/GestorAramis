import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PilotPiece, PilotView } from '../../contracts/client-pilot';
import { FORMAT_LABELS } from '../../contracts/domain';
import { dateLabel } from './shared';

const statuses: Record<string, string> = { planned: 'Planificado', production: 'En producción', review: 'En revisión', approved: 'Aprobado', scheduled: 'Programado', published: 'Publicado' };
function currentMonth() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date()).slice(0, 7);
}
function monthLabel(month: string) {
  return new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00`));
}
function startingMonth(pieces: PilotPiece[]) {
  const today = currentMonth();
  const months = [...new Set(pieces.flatMap(p => p.plannedDate ? [p.plannedDate.slice(0, 7)] : []))].sort();
  return months.includes(today) ? today : months.find(m => m > today) ?? months.at(-1) ?? today;
}

export default function ClientMonthCalendar({ view, open }: { view: PilotView; open: (id: string) => void }) {
  const [month, setMonth] = useState(() => startingMonth(view.pieces));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const pieces = view.pieces.filter(p => p.plannedDate?.startsWith(month));
  const undated = view.pieces.filter(p => !p.plannedDate);
  const otherMonths = [...new Set(view.pieces.flatMap(p => p.plannedDate ? [p.plannedDate.slice(0, 7)] : []))].filter(m => m !== month).sort();
  const date = new Date(`${month}-01T12:00:00`);
  const days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const offset = (date.getDay() + 6) % 7;
  const cellCount = Math.ceil((offset + days) / 7) * 7;

  function changeMonth(value: string) {
    if (!value) return;
    setMonth(value);
    setSelectedDay(null);
  }
  function move(delta: number) {
    const next = new Date(date.getFullYear(), date.getMonth() + delta, 1, 12);
    changeMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  }
  function row(piece: PilotPiece) {
    const request = view.requests.find(r => r.pieceId === piece.id && r.canRespond) ?? view.requests.find(r => r.pieceId === piece.id);
    return <div className="pilot-calendar-row" key={piece.id}>
      <div><small>{dateLabel(piece.plannedDate)} · {FORMAT_LABELS[piece.format]}</small><strong>{piece.title}</strong><span>{statuses[piece.status] ?? piece.status}</span></div>
      {request && <button className="text-button" onClick={() => open(request.id)}>{request.canRespond ? 'Revisar' : 'Ver revisión'}<ChevronRight size={15}/></button>}
    </div>;
  }

  return <section className="pilot-calendar" aria-label="Calendario de contenidos">
    <div className="pilot-calendar-toolbar">
      <div><button className="icon-button" aria-label="Mes anterior" onClick={() => move(-1)}><ChevronLeft/></button>
        <label><span className="sr-only">Mes del calendario</span><input type="month" value={month} onChange={e => changeMonth(e.target.value)}/></label>
        <button className="icon-button" aria-label="Mes siguiente" onClick={() => move(1)}><ChevronRight/></button></div>
      <span className="pilot-calendar-total">{view.pieces.length} {view.pieces.length === 1 ? 'pieza compartida' : 'piezas compartidas'}</span>
    </div>
    <p className="pilot-hint">Fechas previstas, sujetas a ajustes. Seleccioná un día para ver sus contenidos.</p>
    {otherMonths.length > 0 && <nav className="pilot-other-months" aria-label="Otros meses con contenidos"><span>También en:</span>{otherMonths.map(value => <button key={value} className="text-button" onClick={() => changeMonth(value)}>{monthLabel(value)} <span>({view.pieces.filter(p => p.plannedDate?.startsWith(value)).length})</span></button>)}</nav>}
    <div className="pilot-month" aria-label={monthLabel(month)}>
      <div className="pilot-weekdays" aria-hidden="true">{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => <span key={day}>{day}</span>)}</div>
      <div className="pilot-month-grid">{Array.from({ length: cellCount }, (_, index) => {
        const dayNumber = index - offset + 1;
        if (dayNumber < 1 || dayNumber > days) return <div key={`blank-${index}`} className="pilot-calendar-blank" aria-hidden="true"/>;
        const day = `${month}-${String(dayNumber).padStart(2, '0')}`;
        const items = pieces.filter(p => p.plannedDate === day);
        const countLabel = `${items.length} ${items.length === 1 ? 'pieza' : 'piezas'}`;
        return <button key={day} type="button" className="pilot-calendar-day" aria-label={`${dateLabel(day, { weekday: 'long', day: 'numeric', month: 'long' })}, ${countLabel}`} aria-pressed={selectedDay === day} onClick={() => setSelectedDay(day)}>
          <span className="pilot-day-number">{dayNumber}</span>
          {items.length > 0 && <><span className="pilot-day-count">{countLabel}</span><span className="pilot-day-titles">{items.slice(0, 2).map(p => <span key={p.id} className={`pilot-calendar-event pilot-event-${p.format}`} title={p.title}>{p.title}</span>)}{items.length > 2 && <span className="pilot-more-events">+{items.length - 2} más</span>}</span></>}
        </button>;
      })}</div>
    </div>
    {pieces.length === 0 && <p className="pilot-hint">No hay contenidos con fecha en {monthLabel(month)}.</p>}
    {selectedDay && <section className="pilot-card pilot-selected-day" aria-label="Contenidos del día"><h2>{dateLabel(selectedDay, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>{pieces.some(p => p.plannedDate === selectedDay) ? pieces.filter(p => p.plannedDate === selectedDay).map(row) : <p>No hay contenidos compartidos para este día.</p>}</section>}
    {undated.length > 0 && <section className="pilot-card pilot-undated"><h2>Fecha por definir ({undated.length})</h2>{undated.map(row)}</section>}
    {view.pieces.length === 0 && <p className="pilot-card">Aramis todavía no compartió contenidos en tu calendario.</p>}
  </section>;
}
