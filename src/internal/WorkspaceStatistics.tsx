import { useEffect, useState, type FormEvent } from 'react';
import { FORMAT_LABELS, type ContentFormat } from '../../contracts/domain';
import type { StatisticsFilter, TimeStatistic, WorkspaceStatistics as Report } from '../../contracts/statistics';
import { sharedWorkspace } from '../lib/shared-api';
import './workspace-statistics.css';

const number = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

function hoursLabel(hours: number) {
  if (hours >= 24) return `${number.format(hours / 24)} d`;
  if (hours >= 1) return `${number.format(hours)} h`;
  if (hours > 0 && hours < 1 / 60) return '< 1 min';
  return `${number.format(hours * 60)} min`;
}

function TimingCard({ label, metric, unit }: { label: string; metric: TimeStatistic; unit: string }) {
  return <div className="statistics-card">
    <h2>{label}</h2>
    <strong>{metric.medianHours === null ? '—' : hoursLabel(metric.medianHours)}</strong>
    <p>{metric.count ? `Mediana de ${number.format(metric.count)} ${unit}` : 'Sin casos con fechas completas'}</p>
  </div>;
}

export default function WorkspaceStatistics({ today }: { today: string }) {
  const month = today.slice(0, 7);
  const [draft, setDraft] = useState<StatisticsFilter>({ from: month, through: month });
  const [filter, setFilter] = useState(draft);
  const [report, setReport] = useState<Report | null>(null);
  const [clients, setClients] = useState<Report['clients']>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const abort = new AbortController();
    const params = new URLSearchParams({ from: filter.from, through: filter.through });
    if (filter.clientId) params.set('clientId', filter.clientId);
    if (filter.format) params.set('format', filter.format);

    async function load() {
      try {
        const response = await sharedWorkspace.authenticatedFetch('/api/statistics?' + params, { signal: abort.signal });
        if (abort.signal.aborted) return;
        if (response.status === 401) throw new Error('La sesión venció. Volvé a ingresar.');
        if (response.status === 403) {
          setClients([]);
          throw new Error('Tu cuenta no tiene acceso a Estadísticas.');
        }
        if (response.status === 400) throw new Error('Revisá el período. Podés consultar hasta 24 meses a la vez.');
        if (!response.ok) throw new Error('No pudimos cargar las estadísticas. Volvé a intentar.');
        const next = await response.json() as Report;
        if (!abort.signal.aborted) {
          setClients(next.clients);
          setReport(next);
        }
      } catch (reason) {
        if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : 'No pudimos cargar las estadísticas.');
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => abort.abort();
  }, [filter]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setReport(null);
    setLoading(true);
    setFilter({ ...draft });
  }

  return <section className="workspace-statistics">
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
    {report && <>
      <div className="statistics-cards">
        <div className="statistics-card">
          <h2>Piezas aprobadas</h2>
          <strong>{number.format(report.approved)}</strong>
          <p>En {number.format(report.clientsServed)} {report.clientsServed === 1 ? 'cliente' : 'clientes'} durante el período</p>
        </div>
        <TimingCard label="Hasta la primera entrega" metric={report.firstDelivery} unit="piezas"/>
        <TimingCard label="Revisión interna" metric={report.internalReview} unit="versiones"/>
      </div>

      <h2 className="statistics-heading">Por cliente</h2>
      {report.byClient.length ? <div className="statistics-table" tabIndex={0} role="region" aria-label="Estadísticas por cliente">
        <table>
          <thead><tr><th scope="col">Cliente</th><th scope="col">Aprobadas en el período</th>
            <th scope="col">Con cambios</th><th scope="col">Avance del plan</th></tr></thead>
          <tbody>{report.byClient.map(client => <tr key={client.id}>
            <th scope="row">{client.name}</th>
            <td>{number.format(client.approved)}{client.sharedApproved > 0 && <small>{client.sharedApproved} multicliente</small>}</td>
            <td>{number.format(client.reworked)}</td>
            <td>{client.assigned ? `${number.format(client.planApproved)} / ${number.format(client.assigned)}` : '—'}</td>
          </tr>)}</tbody>
        </table>
      </div> : <p className="notice-banner">No hay piezas aprobadas ni asignadas al plan para estos filtros.</p>}
      <details className="statistics-method">
        <summary>Cómo se calculan las cifras</summary>
        <ul>
          <li>Se cuentan piezas con una entrega aprobada vigente, por la fecha de esa aprobación. Cada pieza multicliente cuenta una vez en el total y aparece para cada cliente al que corresponde.</li>
          <li>La primera entrega mide el tiempo desde la última entrada registrada a Diseño hasta el envío de la v1. La revisión interna va del envío a la primera decisión registrada, si la tomó el equipo.</li>
          <li>Los tiempos son corridos y se calculan cuando hay fechas para ambos hitos. El período usa la hora de Argentina.</li>
          <li>El avance del plan muestra las piezas aprobadas hoy entre las asignadas a los meses elegidos. Las archivadas y multicliente quedan fuera del plan.</li>
        </ul>
      </details>
    </>}
  </section>;
}
