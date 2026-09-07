import { Component, type ReactNode } from 'react';
import ClientCalendar from './client/ClientCalendar';
import ClientRequest from './client/ClientRequest';
import Workspace from './internal/Workspace';
import { APP_MODE, resetDemo } from './lib/api';
class AppBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() { return this.state.error ? <main className="setup-page"><div className="brand-word">aramis.</div><h1>No pudimos abrir el espacio</h1><p>{this.state.error}</p>{APP_MODE === 'demo' && <button className="button primary" onClick={() => { if (confirm('¿Restablecer los datos de ejemplo? Se eliminarán los cambios de esta demostración.')) { resetDemo(); location.href = '/'; } }}>Restablecer demostración</button>}</main> : this.props.children; }
}
export default function App() {
  if (APP_MODE !== 'demo') return <main className="setup-page"><div className="brand-word">aramis.</div><p className="eyebrow">ESPACIO DE CONTENIDO</p><h1>Estamos preparando tu espacio.</h1><p>El acceso compartido todavía necesita la configuración de Aramis. Contactá al equipo para recibir tu enlace cuando esté disponible.</p></main>;
  const [route, token = ''] = location.pathname.split('/').filter(Boolean);
  return <AppBoundary>{route === 'calendar' ? <ClientCalendar token={decodeURIComponent(token)} /> : route === 'request' ? <ClientRequest token={decodeURIComponent(token)} /> : !route ? <Workspace /> : <main className="setup-page"><h1>Esta página no existe.</h1><a href="/">Volver al espacio de Aramis</a></main>}</AppBoundary>;
}
