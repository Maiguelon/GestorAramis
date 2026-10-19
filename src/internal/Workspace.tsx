import ClientSelection from './ClientSelection';
import { belongsToClient, pieceClientNames, pieceClientLabel } from '../../contracts/piece-clients';
import PieceClientAvatar from '../components/PieceClientAvatar';
import NotificationSettings from './NotificationSettings';
import FormatBadge from '../components/FormatBadge';
import { useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowRight, CalendarDays, CheckCheck, ChevronRight, CircleHelp, Clock3, Eye, Filter, History, LayoutDashboard, Menu, Plus, Search, Settings2, Users, X } from 'lucide-react';
import type { Command, ContentFormat, Piece, WorkspaceState } from '../../contracts/domain';
import { FORMAT_LABELS } from '../../contracts/domain';
import { pieceMonth, weekRange } from '../domain/selectors';
import { comparePieceDate, isApprovedPiece, needsAttention, pendingWork } from '../domain/work-lists';
import { useAramisDate } from './use-aramis-date';
import WorkspaceHistory from './WorkspaceHistory';
import ArchivedPieceDetail from './ArchivedPieceDetail';
import './work-lists.css';
import { APP_MODE, resetDemo, useWorkspace } from '../lib/api';
import { Empty, Modal, Status } from '../components/ui';
import PieceDetail from './PieceDetail';
import InternalCalendar from './InternalCalendar';
import ClientWorkspace from './ClientWorkspace';
import './workspace-flow.css';
import PendingSave, { hasPendingSave } from './PendingSave';
import { useStaffAccess } from '../auth/StaffAccess';
import DriveConnection from './DriveConnection';
import DesignProduction from './DesignProduction';
import { readWorkMode, workModeKey, type WorkMode } from './work-mode';

type Page = 'production' | 'week' | 'calendar' | 'clients' | 'history' | 'settings';
type FilterKind = 'all' | 'attention' | 'review' | 'ready' | 'preparation' | 'production';
export function dateLabel(value: string | null, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) { return value ? new Intl.DateTimeFormat('es-AR', options).format(new Date(`${value}T12:00:00`)) : 'Sin fecha'; }
export function nextAction(state: WorkspaceState, piece: Piece, today: string) {
  if (isApprovedPiece(piece)) return { text: 'Trabajo aprobado', who: 'Sin tareas pendientes', urgent: false };
  if (piece.status === 'published') return { text: 'Publicado', who: 'Listo', urgent: false };
  const material = state.materials.find(request => request.pieceId === piece.id && request.status !== 'complete');
  if (material?.status === 'received') return { text: 'Revisar material recibido', who: 'Equipo', urgent: true };
  if (material) return { text: 'Falta material', who: 'Cliente', urgent: !!material.dueDate && material.dueDate < today };
  if (piece.status === 'review') return { text: 'Revisar entrega', who: 'Equipo', urgent: !!piece.plannedDate && piece.plannedDate < today };
  return { text: piece.status === 'planned' ? 'Preparar contenido y material' : 'Editar o diseñar', who: (piece.workArea ?? (piece.status === 'planned' ? 'marketing' : 'design')) === 'marketing' ? 'Marketing' : 'Diseño', urgent: !!piece.plannedDate && piece.plannedDate < today };
}
export default function Workspace() {
  const workspace = useWorkspace();
  const preferenceKey = workModeKey(APP_MODE, workspace.shared.workspace?.workspaceId ?? 'demo', workspace.memberId);
  return <WorkspaceView key={preferenceKey} workspace={workspace} preferenceKey={preferenceKey}/>;
}
function WorkspaceView({ workspace, preferenceKey }: { workspace: ReturnType<typeof useWorkspace>; preferenceKey: string }) {
  const { state, execute, error, memberId, shared, retryPending } = workspace;
  const [workMode, setWorkMode] = useState<WorkMode>(() => readWorkMode(preferenceKey));
  const designMode = workMode === 'design';
  const { signOut, email } = useStaffAccess();
  const [page, setPage] = useState<Page>(() => new URLSearchParams(location.search).get('settings') === 'notifications' ? 'settings' : designMode ? 'production' : 'week');
  const [scope, setScope] = useState<'all' | 'week'>('all');
  const [clientDirty,setClientDirty] = useState(false);
  const [filter, setFilter] = useState<FilterKind>('all');
  const [clientId, setClientId] = useState('all');
  const [area, setArea] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(() => { const id = new URLSearchParams(location.search).get('piece'); return id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null; });
  const [archivedDetail, setArchivedDetail] = useState(false);
  const [detailTab, setDetailTab] = useState<'details' | 'material' | 'delivery'>('details');
  const [creating, setCreating] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const today = useAramisDate();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [notice, setNotice] = useState('');
  const { start: weekStart, end: weekEnd } = weekRange(today);
  const pieces = state.pieces.filter(piece => !piece.archived);
  const matches = (piece: Piece) => (clientId === 'all' || belongsToClient(piece, clientId))
    && (area === 'all' || (piece.workArea ?? (piece.status === 'planned' ? 'marketing' : 'design')) === area)
    && `${piece.title} ${pieceClientNames(piece, state.clients)}`.toLowerCase().includes(search.toLowerCase());
  const candidates = pendingWork(state, today, scope).filter(matches);
  const attention = candidates.filter(piece => needsAttention(state, piece, today));
  const waiting = candidates.filter(piece => piece.status === 'review');
  const production = candidates.filter(piece => piece.status === 'production');
  const preparation = candidates.filter(piece => piece.status === 'planned');
  const ready = candidates.filter(isApprovedPiece);
  const shown = page === 'calendar' ? pieces.filter(matches).sort(comparePieceDate) : candidates.filter(piece =>
    filter === 'all' || filter === 'attention' && attention.includes(piece) || filter === 'review' && waiting.includes(piece)
    || filter === 'ready' && ready.includes(piece) || filter === 'preparation' && preparation.includes(piece)
    || filter === 'production' && production.includes(piece));
  const selectedPiece = state.pieces.find(piece => piece.id === selected);
  async function act(command: Command) { try { return await execute(command); } catch { return undefined; } }
  function navigate(next: Page) { if(shared.busy){setNotice('Esperá a que termine el guardado.');return false;}if(clientDirty&&!confirm('¿Salir y descartar los cambios del mes sin guardar?'))return false;setClientDirty(false);setScope('all');setPage(next); setFilter('all'); setSearch(''); setClientId('all'); setArea('all'); setMobileNav(false); setNotice(''); return true; }
  function changeWorkMode(next: WorkMode) {
    if (!navigate(next === 'design' ? 'production' : 'week')) return;
    setWorkMode(next);
    try { localStorage.setItem(preferenceKey, next); }
    catch { setNotice('Vista cambiada. Este navegador no permitió recordar la preferencia.'); }
  }
  function openDesignPiece(id: string, tab: 'details' | 'material' | 'delivery' = 'details') { setDetailTab(tab); setSelected(id); }
  const navigation = [{ id: 'week', label: 'Pendientes', icon: LayoutDashboard }, { id: 'production', label: 'Producción', icon: CheckCheck }, { id: 'calendar', label: 'Calendario', icon: CalendarDays }, { id: 'clients', label: 'Clientes', icon: Users }, { id: 'history', label: 'Historial', icon: History }] as const;
  function navButton(item: typeof navigation[number]) { return <button key={item.id} aria-label={item.label} aria-current={page === item.id ? 'page' : undefined} className={page === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><item.icon size={18}/><span>{item.label}</span>{!designMode && item.id === 'week' && attention.length > 0 && <b aria-hidden="true">{attention.length}</b>}</button>; }
  async function calendarLink(id: string) {
    if (APP_MODE !== 'demo') return null;
    const existing = state.shares.find(share => share.scope === 'calendar' && share.targetId === id && !share.revokedAt);
    if (existing) return `/calendar/${existing.token}`;
    const result = await act({ type: 'create-share', scope: 'calendar', targetId: id });
    const created = result?.state.shares.find(share => share.id === result.entityId);
    return created ? `/calendar/${created.token}` : null;
  }
  async function viewCalendar(id: string) { const href = await calendarLink(id); if (href) location.href = href; }
  const createButton = page !== 'settings' && page !== 'clients' && page !== 'history' && !(designMode && page === 'production') ? <button className="button primary" disabled={!state.clients.length} title={!state.clients.length ? 'Creá primero un cliente desde Clientes' : undefined} onClick={() => setCreating(true)}><Plus size={18} />Nuevo contenido</button> : null;
  return <div className="workspace">
    {mobileNav && <button className="sidebar-backdrop" aria-label="Cerrar menú" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? 'mobile-open' : ''}`}><a href="/" className="sidebar-logo" aria-label="Aramis, inicio"><img src="/brand/aramis.svg" alt="Aramis"/></a><nav aria-label="Principal">{navigation.filter(item => designMode ? ['production', 'calendar'].includes(item.id) : item.id !== 'production').map(navButton)}</nav><div className="sidebar-bottom"><label className="work-mode">Vista de trabajo<select aria-label="Vista de trabajo" value={workMode} onChange={event => changeWorkMode(event.target.value as WorkMode)}><option value="management">Gestión</option><option value="design">Diseño</option></select></label><button className={`sidebar-settings ${page === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}><Settings2 size={18}/>Configuración</button></div></aside>
    <div className="workspace-body">{APP_MODE === 'demo' ? <div className="demo-banner"><span><i />Demostración local · datos ficticios guardados en este navegador</span><button onClick={() => navigate('settings')}>Qué puedo probar <ArrowRight size={13} /></button></div> : <div className="demo-banner shared-banner"><span><i />{shared.workspace?.workspaceName} · Espacio compartido del equipo</span><button onClick={() => navigate('settings')}>Cuenta y conexión <ArrowRight size={13} /></button></div>}<header className="topbar"><div><button className="icon-button mobile-menu" aria-label="Abrir menú" onClick={() => setMobileNav(true)}><Menu size={21} /></button><span>Aramis</span><span className="breadcrumb-slash">/</span><strong>{({week:'Pendientes',production:'Producción',calendar:'Calendario',clients:'Clientes',history:'Historial',settings:'Configuración'})[page]}</strong></div><span className="topbar-date"><CalendarDays size={15} />{dateLabel(today, { weekday: 'long', day: 'numeric', month: 'long' })}</span><button className="icon-button" aria-label={APP_MODE === 'demo' ? "Ayuda sobre la demostración" : "Cuenta y conexión"} onClick={() => navigate('settings')}><CircleHelp size={19} /></button></header>
    <main className="main-content">
      <div className={`page-heading ${page === 'week' ? 'pending-heading' : ''}`}><div><h1>{({week:'Pendientes',production:'Producción',calendar:'Calendario',clients:'Clientes',history:'Historial',settings:'Configuración'})[page]}</h1><p>{({week:scope === 'all' ? 'Todo el trabajo pendiente, ordenado por fecha.' : `${dateLabel(weekStart)} — ${dateLabel(weekEnd)} · Incluye vencidos y sin fecha`,production:designMode ? 'Pendientes de Diseño, ordenados por fecha de publicación.' : 'Piezas listas para producir, grabar o editar.',calendar:'Fechas previstas de todos los clientes.',clients:'Datos, plan y piezas de cada mes.',history:'Piezas completadas y archivadas del equipo.',settings: APP_MODE === 'demo' ? 'Datos locales y opciones de la demostración.' : 'Cuenta del equipo y conexiones disponibles.'})[page]}</p></div>{page === 'week' ? <div className="heading-actions"><div className="pending-scope"><label>Mostrar<select aria-label="Alcance de pendientes" value={scope} onChange={event => setScope(event.target.value as 'all' | 'week')}><option value="all">Todo lo pendiente</option><option value="week">Esta semana</option></select></label></div>{createButton}</div> : createButton}</div>
      {error && <div className="error-banner" role="alert">{error}</div>}{APP_MODE !== 'demo' && <div className="shared-sync" aria-live="polite">{shared.busy && <p>Guardando cambios…</p>}{shared.uncertain && <button className="button secondary" disabled={shared.busy} onClick={() => void retryPending().catch(() => {})}>Reintentar guardado</button>}</div>}{notice && <div className="notice-banner" role="status">{notice}</div>}
      {page === 'week' && <>
        <div className="pending-categories"><button className={`stat-card attention-card ${attention.length ? 'burgundy' : 'quiet'} ${filter === 'attention' ? 'selected' : ''}`} aria-pressed={filter === 'attention'} title="Vencidos o material por verificar. Puede coincidir con una etapa." onClick={() => setFilter(filter === 'attention' ? 'all' : 'attention')}><Clock3 size={16}/><span>Atención</span><strong>{attention.length}</strong></button>
        <div className="process-categories">{[{id:'preparation' as const,count:preparation.length,label:'Planificación',icon:Clock3,color:'blue'},{id:'production' as const,count:production.length,label:'Para producción',icon:CheckCheck,color:'green'},{id:'review' as const,count:waiting.length,label:'Revisión',icon:Eye,color:'blue'},{id:'ready' as const,count:ready.length,label:'Aprobados',icon:CheckCheck,color:'green'}].map(stat => <button key={stat.id} className={`stat-card ${stat.color} ${filter === stat.id ? 'selected' : ''}`} aria-pressed={filter === stat.id} onClick={() => setFilter(filter === stat.id ? 'all' : stat.id)}><stat.icon size={16}/><span>{stat.label}</span><strong>{stat.count}</strong></button>)}</div></div>
        <div className="section-heading"><div><h2>Contenidos <span>{shown.length}</span></h2></div>{filter !== 'all' && <button className="text-button" onClick={() => setFilter('all')}>Quitar filtro <X size={14}/></button>}</div>
      </>}
      {designMode && page === 'production' && <DesignProduction state={state} today={today} open={openDesignPiece}/>}
      {(page === 'week' || page === 'calendar') && <><div className="filters"><label className="search-box"><Search size={17} /><input aria-label="Buscar contenido" placeholder="Buscar contenido o cliente…" value={search} onChange={event => setSearch(event.target.value)} /></label><div className="filter-select"><Filter size={15} /><select aria-label="Filtrar por cliente" value={clientId} onChange={event => setClientId(event.target.value)}><option value="all">Todos los clientes</option>{state.clients.map(client => <option value={client.id} key={client.id}>{client.name}</option>)}</select></div><select aria-label="Filtrar por área" value={area} onChange={event => setArea(event.target.value)}><option value="all">Marketing y Diseño</option><option value="marketing">Marketing</option><option value="design">Diseño</option></select></div>{page !== 'calendar' ? <div className="work-table"><div className="work-table-head"><span>CONTENIDO</span><span>FECHA PREVISTA</span><span>ESTADO</span><span>PRÓXIMO PASO</span><span /></div>{shown.length ? shown.map((piece, index) => { const next = nextAction(state, piece, today); const overdue = !isApprovedPiece(piece) && piece.status !== 'published' && piece.plannedDate && piece.plannedDate < today; return <div key={piece.id}>{isApprovedPiece(piece) && (index === 0 || !isApprovedPiece(shown[index - 1])) && <div className="approved-divider">Aprobados <small>Se conservan acá hasta su fecha prevista; luego pasan al Historial.</small></div>}<button className={`work-row ${isApprovedPiece(piece) ? 'approved-row' : ''}`} key={piece.id} onClick={() => setSelected(piece.id)} aria-label={`Abrir ${piece.title}`}><div className="piece-cell"><PieceClientAvatar piece={piece} clients={state.clients}/><div><span className="piece-client" title={pieceClientNames(piece, state.clients)}>{pieceClientLabel(piece, state.clients)} <b>·</b> <FormatBadge format={piece.format}/></span><strong>{piece.title}</strong><span className="piece-owner">{(piece.workArea ?? (piece.status === 'planned' ? 'marketing' : 'design')) === 'marketing' ? 'Marketing' : 'Diseño'}{!piece.visibleToClient && <small>Interno</small>}</span></div></div><span className={`date-cell ${overdue ? 'overdue' : ''}`}>{dateLabel(piece.plannedDate)}{overdue && <small>Fecha vencida</small>}{!piece.plannedDate && <small>{dateLabel(pieceMonth(piece)+'-01',{month:'short',year:'numeric'})}</small>}</span><span className="work-stage"><Status status={piece.status} />{piece.status === 'production' && <small>{'Para producción'}</small>}</span><span className={`next-cell ${next.urgent ? 'urgent' : ''}`}><span>{next.text}</span><small>{next.who}</small></span><ChevronRight size={17} /></button></div>; }) : <Empty><CheckCheck size={30} /><h3>No hay contenidos con estos filtros.</h3><p>Probá con otro filtro o creá una nueva pieza.</p></Empty>}<div className="table-footer"><span><span className="legend-dot" />{scope === 'all' ? 'Todo lo pendiente · incluye fechas futuras y sin fecha' : 'Incluye vencidos y contenido sin fecha'}</span><span>{scope === 'all' ? `${shown.length} piezas` : `${dateLabel(weekStart)} — ${dateLabel(weekEnd)}`}</span></div></div> : <InternalCalendar pieces={shown} state={state} month={month} setMonth={setMonth} select={setSelected} today={today} />}</>}
      {page === 'history' && <WorkspaceHistory state={state} today={today} select={id => { setArchivedDetail(!!state.pieces.find(piece => piece.id === id)?.archived); setSelected(id); }}/> }
      {page === 'clients' && <ClientWorkspace memberId={memberId} onDirty={setClientDirty} state={state} execute={execute} select={setSelected} viewCalendar={viewCalendar} />}
      {page === 'settings' && <section className="work-mode-setting"><h2>Vista de trabajo</h2><p>Elegí Gestión o Diseño desde el menú. Diseño abre directamente los pendientes de producción. Se recuerda para tu usuario en este navegador; los permisos y el trabajo compartido son los mismos.</p></section>}
      {page === 'settings' && APP_MODE === 'demo' && <div className="settings-grid"><NotificationSettings memberId={memberId}/><section className="settings-card"><h2>Qué podés probar</h2><p>Entrá a Clientes, configurá el plan y generá un mes. Definí guiones y fechas, marcá las piezas listas para producción y cambiá a la vista Diseño para continuar el trabajo.</p><ul><li>Calendario de cada cliente, en agenda y mes.</li><li>Aprobaciones vinculadas a una versión de texto y archivos.</li><li>Material recibido pendiente de control del equipo.</li><li>Mensajes preparados para copiar, con envío manual.</li></ul><a href="/calendar/demo-calendar" className="button secondary">Probar calendario de Casa Oliva <ArrowRight size={16} /></a></section><section className="settings-card"><h2>Almacenamiento local</h2><p>Las modificaciones se conservan al recargar. Estos enlaces sólo funcionan con los mismos datos locales; todavía no se pueden compartir con clientes reales.</p><p>El material del equipo se guarda en este navegador y permite vista previa y descarga. Los pedidos al cliente siguen registrando sólo archivos de prueba por nombre y tamaño. Nada se sube a Drive. El acceso real, el correo y la sincronización entre dispositivos requieren conectar los servicios.</p><p>La exportación no incluye videos ni fotos. Para borrar los archivos guardados, eliminá los datos del sitio desde el navegador.</p><div className="settings-actions"><button className="button secondary" onClick={() => { const link=document.createElement('a'); const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));link.href=url;link.download='aramis-demo.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('Se descargó una copia de los datos ficticios de esta demostración.'); }}><ArrowDownToLine size={15} />Exportar datos (sin archivos)</button><button className="text-button" onClick={() => { if (confirm('¿Restablecer la demostración? Se eliminarán los cambios locales y volverán los datos de ejemplo.')) {resetDemo();setNotice('Demostración restablecida.');} }}>Restablecer demostración</button></div></section></div>}

      {page === 'settings' && APP_MODE !== 'demo' && <div className="settings-grid"><section className="settings-card"><h2>Cuenta del equipo</h2><p>{state.members.find(member => member.id === memberId)?.name}</p><p>{email}</p><button className="button secondary" onClick={() => void signOut()}>Cerrar sesión</button></section><NotificationSettings memberId={memberId}/><DriveConnection/><section className="settings-card"><h2>Espacio compartido</h2><p>Clientes, planes mensuales, piezas y textos se guardan en el espacio compartido. La vista se actualiza al volver a esta pestaña y cada 15 segundos.</p><p>Los archivos se cargan desde Material, dentro de cada pieza. Los archivos locales de la demostración siguen separados.</p><p>Las entregas y sus revisiones se registran desde cada pieza. Los enlaces de clientes todavía no están habilitados.</p></section></div>}
    </main></div>
    <Modal open={creating} onClose={() => {if(!shared.busy)setCreating(false);}} title="Nuevo contenido">{error&&<div role="alert" className="error-banner">{error}</div>}<CreatePiece state={state} memberId={memberId} onCreate={async command => { const result=await act(command); if(result){setCreating(false);setSelected(result.entityId);} }} onConfirmed={result=>{setCreating(false);setSelected(result.entityId);}} /></Modal>
    {selectedPiece && (selectedPiece.archived || archivedDetail) ? <ArchivedPieceDetail key={selectedPiece.id} piece={selectedPiece} state={state} execute={execute} onClose={() => { setSelected(null); setArchivedDetail(false); setDetailTab('details'); }}/> : selectedPiece && <PieceDetail key={selectedPiece.id} workMode={workMode} piece={selectedPiece} state={state} execute={execute} initialTab={detailTab} onClose={() => { setSelected(null); setArchivedDetail(false); setDetailTab('details'); }} />}
  </div>;
}
function CreatePiece({state,onCreate,memberId,onConfirmed}:{state:WorkspaceState;memberId:string;onConfirmed:(result:import('../../contracts/domain').CommandResult)=>void;onCreate:(command:Command)=>Promise<void>}) {
  const [busy,setBusy] = useState(false);
  const [retryError,setRetryError] = useState('');
  const [multiple, setMultiple] = useState(false);
  const [selectedClients, setSelectedClients] = useState<string[]>(() => state.clients[0] ? [state.clients[0].id] : []);
  function changeMultiple(value: boolean) { setRetryError(''); setMultiple(value); if (!value) setSelectedClients([selectedClients[0] ?? state.clients[0]?.id].filter(Boolean)); }
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();if(busy)return;if(!selectedClients.length){setRetryError('Elegí al menos un cliente.');return;}setRetryError('');const values=new FormData(event.currentTarget);setBusy(true);try{await onCreate({type:'create-piece',input:{title:String(values.get('title')),clientId:selectedClients[0],...(multiple && selectedClients.length > 1 ? {clientIds:selectedClients} : {}),ownerId:memberId,workArea:'marketing',format:values.get('format') as ContentFormat,plannedDate:String(values.get('date'))||null}});}finally{setBusy(false);}}
  return <form className="form-stack" onSubmit={submit}><fieldset className="save-fieldset" disabled={busy || hasPendingSave('create-piece')}><label>Título del contenido (opcional)<input name="title" placeholder="Podés definirlo después" maxLength={200} autoFocus /></label><ClientSelection clients={state.clients} multiple={multiple} selected={selectedClients} onMultiple={changeMultiple} onChange={ids=>{setRetryError('');setSelectedClients(ids);}}/><div className="form-columns"><label>Formato<select name="format">{Object.entries(FORMAT_LABELS).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></label><label>Fecha prevista<input name="date" type="date" /></label></div><button className="button primary" type="submit"><Plus size={16} />Crear contenido</button></fieldset>{retryError&&<p role="alert" className="error-banner">{retryError}</p>}<PendingSave type="create-piece" onConfirmed={onConfirmed} onError={setRetryError}/></form>;
}
