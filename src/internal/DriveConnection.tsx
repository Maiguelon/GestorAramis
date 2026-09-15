import { useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, FolderOpen, RefreshCw } from 'lucide-react';
import { drivePost, driveRequest, type DriveStatus } from '../lib/drive-api';
import './drive-materials.css';

export default function DriveConnection() {
  const [status, setStatus] = useState<DriveStatus>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    let alive = true;
    void driveRequest<DriveStatus>('/api/drive/status').then(value => { if (alive) setStatus(value); }).catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : 'No pudimos consultar la conexión.'); });
    return () => { alive = false; mounted.current = false; controller.current?.abort(); };
  }, []);
  async function connect() {
    setBusy(true); setError('');
    const abort = new AbortController(); controller.current = abort;
    try {
      const result = await drivePost<{ url: string }>('/api/drive/connect', {}, abort.signal);
      if (!mounted.current || abort.signal.aborted) return;
      const url = new URL(result.url);
      if (url.protocol !== 'https:' || url.hostname !== 'accounts.google.com' || url.port || url.username || url.password) throw new Error('No recibimos una dirección válida de Google. Volvé a intentar.');
      window.location.assign(url.toString());
    } catch (reason) { if (mounted.current) { setError(reason instanceof Error ? reason.message : 'No pudimos iniciar la conexión.'); setBusy(false); } }
  }
  return <section className="settings-card drive-connection">
    <h2>Google Drive</h2>
    <p>Para incorporar material subido desde Drive, Google pedirá permiso para ver y descargar todos los archivos accesibles por esta cuenta. El gestor consultará sólo las carpetas vinculadas a sus piezas. La creación y edición se mantienen limitadas a los archivos autorizados a la app.</p>
    {status?.connected&&status.canImport===false&&<p className="error-banner">Hace falta renovar la conexión para activar la incorporación desde Drive. Las cargas desde el gestor siguen disponibles.</p>}
    {status?.connected ? <><p className="drive-connected"><Check size={17}/>Conectado{status.accountEmail ? ` · ${status.accountEmail}` : ''}</p><p>El material de las piezas se guarda por cliente, mes del plan y pieza. Los archivos quedan disponibles para el equipo desde el gestor.</p>{status.rootFolderId && <a className="button secondary" href={`https://drive.google.com/drive/folders/${encodeURIComponent(status.rootFolderId)}`} target="_blank" rel="noopener noreferrer"><FolderOpen size={16}/>Abrir carpeta del gestor</a>}</> : <p>{status ? status.configured ? 'Conectá la cuenta que guardará el material del equipo.' : 'Falta terminar la configuración de Google Drive.' : 'Consultando conexión…'}</p>}
    {error && <p className="error-banner" role="alert">{error}</p>}
    <div className="drive-actions"><button type="button" className="button secondary" disabled={busy || !status?.configured} onClick={() => void connect()}>{status?.connected ? <RefreshCw size={16}/> : <ExternalLink size={16}/>} {busy ? 'Abriendo Google…' : status?.connected ? 'Renovar conexión' : 'Conectar Drive'}</button></div>
  </section>;
}

export function DriveCallback({ onDone }: { onDone?: () => void }) {
  const [params] = useState(() => new URLSearchParams(location.hash.replace(/^#drive-callback=/, '')));
  const request = useRef<Promise<unknown> | null>(null);
  const [result, setResult] = useState<'working' | 'success' | 'error'>('working');
  const [message, setMessage] = useState('Confirmando la conexión con Google Drive…');
  useEffect(() => {
    // Remove one-time OAuth data before rendering other links or loading any media.
    history.replaceState(history.state, '', location.pathname + location.search);
    if (!request.current) {
      const code = params.get('code'), state = params.get('state');
      request.current = params.get('error') ? Promise.reject(new Error('No se autorizó el acceso a Drive. Podés volver a conectarlo desde Configuración.')) : !code || !state ? Promise.reject(new Error('La respuesta de Google está incompleta. Volvé a conectar Drive desde Configuración.')) : drivePost('/api/drive/callback', { code, state });
    }
    let alive = true;
    void request.current.then(() => { if (alive) { setResult('success'); setMessage('Google Drive quedó conectado. Ya podés subir material desde una pieza.'); } }).catch(reason => { if (alive) { setResult('error'); setMessage(reason instanceof Error ? reason.message : 'No pudimos confirmar la conexión. Volvé a intentar desde Configuración.'); } });
    return () => { alive = false; };
  }, [params]);
  return <main className="drive-callback"><section className="settings-card"><h1>Conexión con Google Drive</h1><p role={result === 'error' ? 'alert' : 'status'} className={result === 'error' ? 'error-banner' : ''}>{message}</p>{result !== 'working' && <button type="button" className="button primary" onClick={() => onDone ? onDone() : location.assign('/')}>Volver al gestor</button>}</section></main>;
}
