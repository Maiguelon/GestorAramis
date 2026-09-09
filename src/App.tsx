import { Component, type ReactNode } from 'react';
import ClientCalendar from './client/ClientCalendar';
import ClientRequest from './client/ClientRequest';
import PieceText from './internal/PieceText';
import Workspace from './internal/Workspace';
import { APP_MODE, resetDemo } from './lib/api';
import StaffAccess from './auth/StaffAccess';
class AppBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() { return this.state.error ? <main className="setup-page"><div className="brand-word">aramis.</div><h1>No pudimos abrir el espacio</h1><p>{this.state.error}</p>{APP_MODE === 'demo' && <button className="button primary" onClick={() => { if (confirm('¿Restablecer los datos de ejemplo? Se eliminarán los cambios de esta demostración.')) { resetDemo(); location.href = '/'; } }}>Restablecer demostración</button>}</main> : this.props.children; }
}
export default function App() {
  const [route, token = ''] = location.pathname.split('/').filter(Boolean);
  if (APP_MODE !== 'demo') {
    if (route === 'calendar' || route === 'request') return <main className="setup-page"><h1>El acceso de clientes todavía no está habilitado</h1><p>Este entorno está disponible sólo para el equipo de Aramis. La conexión de aprobaciones y material es el próximo bloque.</p></main>;
    return <AppBoundary><StaffAccess>{route === 'text' ? <PieceText pieceId={decodeURIComponent(token)} /> : !route ? <Workspace /> : <main className="setup-page"><h1>Esta página no existe.</h1><a href="/">Volver al espacio de Aramis</a></main>}</StaffAccess></AppBoundary>;
  }
  return <AppBoundary>{route === 'text' ? <PieceText pieceId={decodeURIComponent(token)} /> : route === 'calendar' ? <ClientCalendar token={decodeURIComponent(token)} /> : route === 'request' ? <ClientRequest token={decodeURIComponent(token)} /> : !route ? <Workspace /> : <main className="setup-page"><h1>Esta página no existe.</h1><a href="/">Volver al espacio de Aramis</a></main>}</AppBoundary>;
}
