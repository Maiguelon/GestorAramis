import { useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowDown, ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Film, Images, LayoutGrid, List, MessageCircle, Sparkles, X } from 'lucide-react';
import type { PublicPiece } from '../../contracts/domain';
import { FORMAT_LABELS, STATUS_LABELS } from '../../contracts/domain';
import { getDemoRequestLink } from '../lib/api';
import { ClientFooter, ClientHeader, dateLabel, Unavailable, useClientView } from './shared';
import './client.css';

function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function FormatIcon({ format }: { format: PublicPiece['format'] }) { return format === 'reel' ? <Film size={16} /> : format === 'carousel' ? <Images size={16} /> : <LayoutGrid size={16} />; }

export default function ClientCalendar({ token }: { token: string }) {
  const { view, error } = useClientView(token);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [layout, setLayout] = useState<'agenda' | 'month'>('agenda');
  const [onlyPending, setOnlyPending] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const openPiece = (id: string) => { previousFocus.current = document.activeElement as HTMLElement; setSelectedId(id); };
  const today = dateKey(new Date());
  const pieces = view?.pieces ?? [];
  const pendingIds = new Set(pieces.filter(piece => piece.status === 'review' || view?.materials.some(request => request.pieceId === piece.id && request.status === 'pending')).map(piece => piece.id));
  const selected = pieces.find(piece => piece.id === selectedId);
  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
  const shownPieces = pieces.filter(piece => (!onlyPending || pendingIds.has(piece.id)) && piece.plannedDate?.startsWith(monthKey)).sort((a, b) => (a.plannedDate ?? '').localeCompare(b.plannedDate ?? '') || a.title.localeCompare(b.title));
  const unscheduled = pieces.filter(piece => !piece.plannedDate && (!onlyPending || pendingIds.has(piece.id)));
  const nextPiece = pieces.filter(piece => piece.plannedDate && piece.plannedDate >= today && piece.status !== 'published').sort((a, b) => a.plannedDate!.localeCompare(b.plannedDate!))[0];
  const days = useMemo(() => {
    const start = new Date(month);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(date.getDate() + index); return date; });
  }, [month]);
  if (!view || view.scope !== 'calendar') return <Unavailable error={error || 'Este enlace no corresponde a un calendario.'} />;

  const moveMonth = (direction: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + direction, 1));
  const reviewHref = selected ? getDemoRequestLink(selected.id, 'review') : null;
  const materialHref = selected ? getDemoRequestLink(selected.id, 'material') : null;

  return <Dialog.Root open={Boolean(selected)} onOpenChange={open => { if (!open) setSelectedId(null); }}><div className="client-app">
    <ClientHeader name={view.client.name} page="Tu calendario" />
    <main className="client-calendar-main">
      <section className="client-calendar-hero">
        <div><span className="client-section-kicker"><span className="client-tiny-line" /> TU MARCA, EN MOVIMIENTO</span><h1>Lo que viene<br />para <em>{view.client.name}.</em></h1><p>Todo el contenido en un lugar. Mirá qué estamos preparando y cuándo sale cada pieza.</p></div>
        <div className="client-next-card"><div className="client-next-top"><span>PRÓXIMA PUBLICACIÓN</span><CalendarDays size={18} /></div>{nextPiece ? <><strong>{dateLabel(nextPiece.plannedDate, { day: 'numeric', month: 'short' })}</strong><h2>{nextPiece.title}</h2><div className="client-next-bottom"><span><FormatIcon format={nextPiece.format} />{FORMAT_LABELS[nextPiece.format]}</span><button aria-label={`Ver próxima publicación: ${nextPiece.title}`} onClick={() => openPiece(nextPiece.id)}><ArrowRight size={20} /></button></div></> : <><strong>En preparación</strong><p>Pronto vas a ver nuevas publicaciones acá.</p></>}</div>
      </section>
      {pendingIds.size > 0 && <button className="client-pending-callout" onClick={() => { setOnlyPending(value => !value); document.getElementById('client-calendar-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><span className="client-pending-icon"><MessageCircle size={19} /></span><span><strong>{pendingIds.size === 1 ? 'Hay una pieza que necesita tu respuesta' : `${pendingIds.size} piezas necesitan tu respuesta`}</strong><small>Una aprobación o material tuyo nos ayuda a seguir.</small></span><span className="client-pending-action">{onlyPending ? 'Ver todo' : 'Ver pendientes'} <ArrowDown size={16} /></span></button>}
      <section className="client-calendar-section" id="client-calendar-content" aria-label="Calendario de contenido">
        <div className="client-calendar-toolbar"><div className="client-month-nav"><button className="client-icon-btn" aria-label="Mes anterior" onClick={() => moveMonth(-1)}><ChevronLeft size={19} /></button><h2>{new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(month)}</h2><button className="client-icon-btn" aria-label="Mes siguiente" onClick={() => moveMonth(1)}><ChevronRight size={19} /></button></div><div className="client-toolbar-right"><button className="client-today-btn" onClick={() => { setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setOnlyPending(false); }}>Hoy</button><div className="client-segment" aria-label="Vista del calendario"><button aria-pressed={layout === 'agenda'} onClick={() => setLayout('agenda')}><List size={16} />Agenda</button><button aria-pressed={layout === 'month'} onClick={() => setLayout('month')}><CalendarDays size={16} />Mes</button></div></div></div>
        <div className="client-calendar-subtoolbar"><span>{shownPieces.length} {shownPieces.length === 1 ? 'publicación prevista' : 'publicaciones previstas'}</span><button className={onlyPending ? 'client-filter active' : 'client-filter'} aria-pressed={onlyPending} onClick={() => setOnlyPending(value => !value)}>{onlyPending && <Check size={13} />}Sólo mis pendientes</button></div>
        {layout === 'agenda' ? <div className="client-agenda">{shownPieces.length ? shownPieces.map(piece => <button className="client-agenda-row" key={piece.id} onClick={() => openPiece(piece.id)}><div className={`client-agenda-date${piece.plannedDate === today ? ' is-today' : ''}`}><span>{dateLabel(piece.plannedDate, { weekday: 'short' }).replace('.', '')}</span><strong>{piece.plannedDate?.slice(-2)}</strong></div><span className={`client-piece-mark format-${piece.format}`}><FormatIcon format={piece.format} /></span><div className="client-agenda-info"><span className="client-format-label">{FORMAT_LABELS[piece.format]}</span><h3>{piece.title}</h3>{view.materials.some(request => request.pieceId === piece.id && request.status === 'pending') && <small className="client-material-note">Esperamos tu material</small>}</div><span className={`client-status status-${piece.status}`}><i />{STATUS_LABELS[piece.status]}</span><ChevronRight className="client-row-arrow" size={18} /></button>) : <div className="client-empty"><CalendarDays size={28} /><h3>{onlyPending ? 'Sin pendientes este mes' : 'El próximo contenido está en camino'}</h3><p>{onlyPending ? 'Podés cambiar de mes o ver todas las publicaciones.' : 'Cuando definamos las fechas, las vas a encontrar acá.'}</p></div>}</div> : <div className="client-month-view"><div className="client-weekdays">{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => <span key={day}>{day}</span>)}</div><div className="client-month-grid">{days.map(day => { const key = dateKey(day); const dayPieces = pieces.filter(piece => piece.plannedDate === key && (!onlyPending || pendingIds.has(piece.id))); return <div className={`client-month-day${day.getMonth() !== month.getMonth() ? ' is-outside' : ''}${key === today ? ' is-today' : ''}`} key={key}><span className="client-day-number">{day.getDate()}</span>{dayPieces.map(piece => <button key={piece.id} title={`${piece.title} · ${STATUS_LABELS[piece.status]}`} className={`client-month-piece status-${piece.status}`} onClick={() => openPiece(piece.id)}><i /><span>{piece.title}</span><span className="client-sr-only">{STATUS_LABELS[piece.status]}</span></button>)}</div>; })}</div></div>}
        {unscheduled.length > 0 && <div className="client-unscheduled"><div><Clock3 size={15} /><h3>Fecha por definir</h3></div>{unscheduled.map(piece => <button key={piece.id} onClick={() => openPiece(piece.id)}><span>{piece.title}</span><ArrowRight size={15} /></button>)}</div>}
        <p className="client-calendar-footnote"><Sparkles size={14} /> Las fechas son previstas y pueden ajustarse durante la producción.</p>
      </section>
    </main>
    <ClientFooter />
    {selected && <Dialog.Portal><div className="client-app client-dialog-layer"><Dialog.Overlay className="client-modal-backdrop" /><Dialog.Content className="client-piece-dialog" onCloseAutoFocus={event => { event.preventDefault(); previousFocus.current?.focus(); }}><div className="client-dialog-top"><span className="client-section-kicker">{FORMAT_LABELS[selected.format]} · {dateLabel(selected.plannedDate)}</span><Dialog.Close asChild><button className="client-icon-btn" aria-label="Cerrar detalle"><X size={19} /></button></Dialog.Close></div><Dialog.Title asChild><h2>{selected.title}</h2></Dialog.Title><Dialog.Description className="client-sr-only">Detalle de la publicación y enlaces a solicitudes disponibles.</Dialog.Description><span className={`client-status status-${selected.status}`}><i />{STATUS_LABELS[selected.status]}</span>{selected.caption && <div className="client-dialog-caption"><h3>Texto de publicación</h3><p>{selected.caption}</p></div>}<div className="client-dialog-actions">{reviewHref && <a className="client-btn client-btn-primary" href={reviewHref}>Ver contenido y responder <ArrowRight size={17} /></a>}{materialHref && <a className="client-btn client-btn-secondary" href={materialHref}>Ver pedido de material <ArrowRight size={17} /></a>}{!reviewHref && !materialHref && <p>Cuando necesitemos tu respuesta, vas a recibir un enlace por WhatsApp.</p>}</div><small className="client-detail-demo">En esta demostración los enlaces abren solicitudes ficticias.</small></Dialog.Content></div></Dialog.Portal>}
  </div></Dialog.Root>;
}
