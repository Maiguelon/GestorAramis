import type { TimeStatistic, WorkspaceStatistics as Report } from '../../contracts/statistics';
import { FORMAT_LABELS } from '../../contracts/domain';
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

export default function StatisticsReport({ report }: { report: Report }) {
  return <>
      <div className="statistics-cards">
        <div className="statistics-card">
          <h2>Piezas aprobadas</h2>
          <strong>{number.format(report.approved)}</strong>
          <p>En {number.format(report.clientsServed)} {report.clientsServed === 1 ? 'cliente' : 'clientes'} durante el período</p>
        </div>
        <TimingCard label="Hasta la primera entrega" metric={report.firstDelivery} unit="piezas"/>
        <TimingCard label="Revisión interna" metric={report.internalReview} unit="versiones"/>
      </div>

      {report.versions && report.deadline && <div className="statistics-extra">
        <div className="statistics-card">
          <h2>Versiones por pieza aprobada</h2>
          <strong>{report.versions.median === null ? '—' : number.format(report.versions.median)}</strong>
          <p>Mediana de {report.versions.count} piezas</p>
          <div className="statistics-distribution">
            <span>1 versión <b>{report.versions.one}</b></span>
            <span>2 versiones <b>{report.versions.two}</b></span>
            <span>3 o más <b>{report.versions.threePlus}</b></span>
          </div>
        </div>
        <div className="statistics-card">
          <h2>Aprobadas a tiempo</h2>
          <strong>{report.deadline.percent === null ? '—' : number.format(report.deadline.percent) + '%'}</strong>
          <p>{report.deadline.onTime} de {report.deadline.count} piezas con fecha comprometida verificable · {report.deadline.late} fuera de plazo</p>
          {report.deadline.unknown > 0 && <small>{report.deadline.unknown} sin fecha verificable, fuera del porcentaje</small>}
        </div>
      </div>}

      {!!report.pieces?.length && <details className="statistics-method">
        <summary>Ver piezas, versiones y fechas ({report.pieces.length})</summary>
        <div className="statistics-table" tabIndex={0} role="region" aria-label="Detalle de piezas aprobadas">
          <table><thead><tr><th scope="col">Pieza</th><th scope="col">Versiones</th><th scope="col">Cambios registrados</th>
            <th scope="col">Fecha comprometida</th><th scope="col">Aprobación</th><th scope="col">Cumplimiento</th></tr></thead>
            <tbody>{report.pieces.map(piece => <tr key={piece.id}>
              <th scope="row">{piece.title || 'Sin título'}<small>{piece.clients.join(' · ')} · {FORMAT_LABELS[piece.format]}</small></th>
              <td>{piece.versions}</td><td>{piece.teamChanges} equipo · {piece.clientChanges} cliente</td>
              <td>{piece.deadline ? dateLabel(piece.deadline + 'T12:00:00Z') : 'No verificable'}</td>
              <td>{dateLabel(piece.approvedAt)}</td>
              <td><span className={'statistics-deadline ' + piece.deadlineResult}>{piece.deadlineResult === 'on_time' ? 'A tiempo' : piece.deadlineResult === 'late' ? 'Fuera de plazo' : 'Sin dato'}</span></td>
            </tr>)}</tbody></table>
        </div>
      </details>}

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
          <li>Las versiones cuentan las entregas registradas hasta la aprobación vigente de cada pieza, incluidas las reemplazadas. Los cambios separan las decisiones registradas del equipo y del cliente; no se reconstruyen decisiones antiguas sobrescritas.</li>
          <li>El plazo es la primera fecha prevista de publicación registrada, conservada aunque después se mueva. Se cumple si la aprobación ocurre ese día o antes, en hora de Argentina. No mide la fecha de publicación real.</li>
          <li>Al activar esta medición se guarda la fecha actual de las piezas existentes. Las aprobaciones anteriores a ese registro quedan fuera del porcentaje. Los cortes mensuales conservan los datos y las definiciones de su captura.</li>
        </ul>
      </details>
  </>;
}

const dateLabel = (value: string) => new Intl.DateTimeFormat('es-AR', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires',
}).format(new Date(value));
