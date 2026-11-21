import { useEffect, useState, type FormEvent } from 'react';
import { FORMAT_LABELS, type ContentFormat } from '../../contracts/domain';
import type { StatisticsFilter, StatisticsSnapshot, StatisticsSnapshotSummary, WorkspaceStatistics as Report } from '../../contracts/statistics';
import { sharedWorkspace } from '../lib/shared-api';
import StatisticsReport from './StatisticsReport';
import './workspace-statistics.css';

async function read<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await sharedWorkspace.authenticatedFetch(path, init);
  if (response.status === 401) throw new Error('La sesión venció. Volvé a ingresar.');
  if (response.status === 403) throw new Error('Tu cuenta no tiene acceso a Estadísticas.');
  if (response.status === 400) throw new Error('Revisá el período. Los cortes requieren un mes cerrado; las consultas admiten hasta 24 meses.');
  if (!response.ok) throw new Error('No pudimos cargar las estadísticas. Volvé a intentar.');
  return response.json() as Promise<T>;
}

export default function WorkspaceStatistics({ today }: { today: string }) {
  const month = today.slice(0, 7);
  const [draft, setDraft] = useState<StatisticsFilter>({ from: month, through: month });
  const [filter, setFilter] = useState(draft);
  const [report, setReport] = useState<Report | null>(null);
  const [clients, setClients] = useState<Report['clients']>([]);
  const [mode, setMode] = useState<'live' | 'saved'>('live');
  const [enhanced, setEnhanced] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const abort = new AbortController();
    const params = new URLSearchParams({ from: filter.from, through: filter.through });
    if (filter.clientId) params.set('clientId', filter.clientId);
    if (filter.format) params.set('format', filter.format);
    void read<Report>('/api/statistics?' + params, { signal: abort.signal }).then(next => {
      if (!abort.signal.aborted) {
        setClients(next.clients); setReport(next); setEnhanced((next.definitionVersion ?? 1) >= 2);
      }
    }).catch(reason => {
      if (!abort.signal.aborted) {
        setReport(null);
        setError(reason instanceof Error ? reason.message : 'No pudimos cargar las estadísticas.');
      }
    }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [filter]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setReport(null); setLoading(true); setFilter({ ...draft });
  }

  return <section className="workspace-statistics">
    {enhanced && <div className="statistics-modes" role="group" aria-label="Origen de estadísticas">
      <button type="button" className={'button ' + (mode === 'live' ? 'primary' : 'secondary')} aria-pressed={mode === 'live'} onClick={() => setMode('live')}>Datos actuales</button>
      <button type="button" className={'button ' + (mode === 'saved' ? 'primary' : 'secondary')} aria-pressed={mode === 'saved'} onClick={() => setMode('saved')}>Cortes mensuales</button>
    </div>}
    {mode === 'saved' ? <MonthlyCuts month={month}/> : <>
      <form className="statistics-filters" onSubmit={apply} aria-label="Filtros de estadísticas">
        <label>Desde<input type="month" required min="2000-01" max={draft.through} value={draft.from}
          onChange={event => setDraft({ ...draft, from: event.target.value })}/></label>
        <label>Hasta<input type="month" required min={draft.from} max={month} value={draft.through}
          onChange={event => setDraft({ ...draft, through: event.target.value })}/></label>
        <label>Cliente<select aria-label="Cliente" value={draft.clientId ?? ''}
          onChange={event => setDraft({ ...draft, clientId: event.target.value || undefined })}>
          <option value="">Todos los clientes</option>
          {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
        </select></label>
        <label>Formato<select aria-label="Formato" value={draft.format ?? ''}
          onChange={event => setDraft({ ...draft, format: (event.target.value || undefined) as ContentFormat | undefined })}>
          <option value="">Todos los formatos</option>
          {Object.entries(FORMAT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <button type="submit" className="button primary" disabled={loading}>Consultar</button>
      </form>
      {loading && <p role="status" className="form-hint">Cargando estadísticas…</p>}
      {error && <p role="alert" className="error-banner">{error}</p>}
      {report && <StatisticsReport report={report}/>}
    </>}
  </section>;
}

function MonthlyCuts({ month }: { month: string }) {
  const previous = new Date(month + '-01T12:00:00Z');
  previous.setUTCMonth(previous.getUTCMonth() - 1);
  const lastClosed = previous.toISOString().slice(0, 7);
  const [summaries, setSummaries] = useState<StatisticsSnapshotSummary[]>([]);
  const [selected, setSelected] = useState('');
  const [createMonth, setCreateMonth] = useState(lastClosed);
  const [snapshot, setSnapshot] = useState<StatisticsSnapshot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    void read<StatisticsSnapshotSummary[]>('/api/statistics/snapshots', { signal: abort.signal }).then(list => {
      if (!abort.signal.aborted) { setSummaries(list); setSelected(current => current || list[0]?.month || ''); }
    }).catch(reason => { if (!abort.signal.aborted) setError(String(reason.message)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [refresh]);

  useEffect(() => {
    if (!selected) return;
    const abort = new AbortController();
    setSnapshot(null); setLoading(true); setError('');
    void read<StatisticsSnapshot>('/api/statistics/snapshots?month=' + selected, { signal: abort.signal }).then(saved => {
      if (!abort.signal.aborted) setSnapshot(saved);
    }).catch(reason => { if (!abort.signal.aborted) setError(String(reason.message)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [selected, refresh]);

  async function capture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const saved = await read<StatisticsSnapshot>('/api/statistics/snapshots', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: createMonth }),
      });
      setSnapshot(saved); setSelected(saved.month); setRefresh(value => value + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No pudimos guardar el corte. Podés reintentar sin duplicarlo.'); }
    finally { setSaving(false); }
  }

  function download() {
    if (!snapshot) return;
    const blob = new Blob([JSON.stringify(snapshot, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `aramis-statistics-${snapshot.month}.json`;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <>
    <p className="form-hint">Se guarda automáticamente cada mes cerrado, desde la activación de los cortes. Cada corte incluye todos los clientes y formatos y conserva los valores de su captura.</p>
    <div className="statistics-cuts-toolbar">
      <label>Corte guardado<select value={selected} disabled={saving} onChange={event => setSelected(event.target.value)}>
        {!summaries.length && <option value="">Sin cortes guardados</option>}
        {summaries.map(saved => <option key={saved.month} value={saved.month}>{saved.month}</option>)}
      </select></label>
      <button type="button" className="button secondary" disabled={!snapshot || loading || saving} onClick={download}>Descargar corte</button>
    </div>
    <details className="statistics-method">
      <summary>Guardar un mes cerrado ahora</summary>
      <p>Se captura con los datos actuales y la fecha de hoy; no reconstruye cómo estaba el gestor al finalizar ese mes. Si ya existe un corte, se conserva el original.</p>
      <form className="statistics-cuts-toolbar" onSubmit={capture}>
        <label>Mes del corte<input type="month" min="2000-01" max={lastClosed} required value={createMonth} disabled={saving}
          onChange={event => setCreateMonth(event.target.value)}/></label>
        <button type="submit" className="button primary" disabled={saving || loading}>{saving ? 'Guardando…' : 'Guardar corte mensual'}</button>
      </form>
    </details>
    {loading && <p role="status">Cargando cortes…</p>}
    {error && <p role="alert" className="error-banner">{error}</p>}
    {!loading && !error && !summaries.length && <p className="notice-banner">El primer corte automático aparecerá al cerrar el mes. También podés guardar un mes anterior ahora.</p>}
    {snapshot && <>
      <p className="statistics-cut-caption">Corte de <b>{snapshot.month}</b> · Capturado el {new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(snapshot.capturedAt))} (Argentina) · {snapshot.captureType === 'automatic' ? 'Automático' : 'Manual'} · Definición {snapshot.definitionVersion}</p>
      <StatisticsReport report={snapshot.report}/>
    </>}
  </>;
}
