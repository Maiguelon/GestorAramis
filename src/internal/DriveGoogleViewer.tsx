import { useEffect, useState } from 'react';
import { Download, ExternalLink, RefreshCw } from 'lucide-react';
import { Modal } from '../components/ui';
import { driveAssetUrl, driveRequest, type DriveAsset } from '../lib/drive-api';
import { safeFileName } from '../lib/download-zip';

function checkedViewerUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('El visor no está disponible. Volvé a intentar.');
  const url = new URL(value);
  if (url.origin !== 'https://drive.google.com' || url.username || url.password || url.hash ||
      !/^\/file\/d\/[A-Za-z0-9_-]{1,160}\/preview$/.test(url.pathname) ||
      [...url.searchParams].some(([key, val]) => key !== 'resourcekey' || !/^[A-Za-z0-9_-]{1,200}$/.test(val))) {
    throw new Error('El visor no está disponible. Volvé a intentar.');
  }
  return url.toString();
}

export function DriveGoogleViewer({ asset, onClose }: { asset: DriveAsset; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setUrl(''); setError('');
    void driveRequest<{ url: string }>(`/api/drive/assets/${encodeURIComponent(asset.id)}/viewer`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setUrl(checkedViewerUrl(result.url)); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'No se pudo abrir el visor. Volvé a intentar.'); });
    return () => controller.abort();
  }, [asset.id, attempt]);
  return <Modal open onClose={onClose} title="Visor de Google" description={asset.name} wide>
    {error ? <p role="alert">{error}</p> : !url ? <p role="status">Abriendo visor…</p> :
      <iframe key={attempt} className="drive-google-viewer" title={`Visor de Google: ${asset.name}`} src={url} allow="autoplay; fullscreen" allowFullScreen referrerPolicy="no-referrer"/>}
    <p className="form-hint">Tu cuenta de Google necesita acceso al archivo. Si el visor pide ingresar o queda vacío, abrí Google en otra pestaña y después reintentá acá.</p>
    <div className="drive-actions">
      <button type="button" className="button secondary" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={15}/>Reintentar visor</button>
      {url && <a className="text-button" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/>Abrir en Google</a>}
      <a className="button secondary" href={driveAssetUrl(asset.id, true)} download={safeFileName(asset.name)}><Download size={15}/>Descargar original</a>
    </div>
  </Modal>;
}
