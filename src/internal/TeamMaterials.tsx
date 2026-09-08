import { useEffect, useState } from 'react';
import { Download, FileText, Upload } from 'lucide-react';
import type { Asset, Command, CommandResult, Piece } from '../../contracts/domain';
import { readLocalFile, saveLocalFile, validateLocalFile } from '../lib/local-files';

export default function TeamMaterials({ piece, act, onBusy }: {
  piece: Piece;
  act: (command: Command) => CommandResult | undefined;
  onBusy: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Asset[]>([]);
  const [progress, setProgress] = useState('');
  useEffect(()=>{onBusy(busy || pending.length > 0);return ()=>onBusy(false);},[busy,pending.length,onBusy]);

  async function upload(files: File[]) {
    if (!files.length) return;
    const revision = piece.revision;
    const existing = piece.teamAssets ?? [];
    const stored: Asset[] = [];
    setBusy(true); onBusy(true); setError('');
    try {
      // Validate the whole selection before writing anything.
      files.forEach(validateLocalFile);
      for (const file of files) {
        setProgress('Guardando ' + file.name + '…');
        const id = crypto.randomUUID();
        await saveLocalFile(id, file);
        stored.push({ id, name: file.name, size: file.size, mimeType: file.type || 'application/octet-stream', source: 'demo' });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos guardar el material.');
    } finally {
      if (stored.length) {
        const result = act({ type: 'update-piece', pieceId: piece.id, expectedRevision: revision, patch: { teamAssets: [...existing, ...stored] } });
        if (!result) setPending(stored);
      }
      setProgress(''); setBusy(false);
    }
  }
  function attachPending() {
    const existing = piece.teamAssets ?? [];
    const result = act({ type: 'update-piece', pieceId: piece.id, expectedRevision: piece.revision, patch: { teamAssets: [...existing, ...pending.filter(asset => !existing.some(item => item.id === asset.id))] } });
    if (result) setPending([]);
  }
  return <section className="team-materials">
    <div className="subsection-heading"><h3>Material del equipo</h3><span className="form-hint">{(piece.teamAssets ?? []).length} {(piece.teamAssets ?? []).length === 1 ? 'archivo' : 'archivos'}</span></div>
    <p className="form-hint">Videos, fotos y referencias para producir esta pieza. En esta prueba se guardan sólo en este navegador, hasta 100 MB por archivo. Todavía no se suben a Drive ni se comparten entre dispositivos.</p>
    {error && <p className="error-banner" role="alert">{error}</p>}
    {pending.length > 0 && <div className="notice-banner">Guardamos {pending.length} archivo(s), pero la pieza cambió antes de vincularlos. <button className="text-button" onClick={attachPending}>Vincular a la pieza actual</button><button className="text-button" onClick={()=>{if(confirm('¿Descartar la vinculación de estos archivos? Tendrás que seleccionarlos de nuevo.'))setPending([]);}}>Descartar vinculación</button></div>}
    <label className="team-file-picker"><Upload size={16}/>{busy ? progress : 'Agregar material del equipo'}<input aria-label="Agregar material del equipo" type="file" multiple disabled={busy || pending.length > 0} onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ''; void upload(files); }}/></label>
    <div aria-live="polite">{busy && <p className="form-hint">Guardando en este navegador…</p>}</div>
    <div className="team-asset-list">{(piece.teamAssets ?? []).map(asset => <LocalAsset key={asset.id} asset={asset}/>)}</div>
    {!piece.teamAssets?.length && !busy && <p className="form-hint">Todavía no hay material del equipo adjunto.</p>}
  </section>;
}

function LocalAsset({ asset }: { asset: Asset }) {
  const [url, setUrl] = useState<string>();
  const [message, setMessage] = useState('Buscando archivo…');
  useEffect(() => {
    if(asset.url && /^\/demo\/[a-z0-9-]+\.svg$/.test(asset.url)){setUrl(asset.url);setMessage('');return;}
    let stopped = false;
    let objectUrl: string | undefined;
    void readLocalFile(asset.id).then(blob => {
      if (stopped) return;
      if (blob) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); setMessage(''); }
      else setMessage('El archivo no está en este navegador. Volvé a adjuntarlo desde el dispositivo donde lo guardaste.');
    }).catch(() => { if (!stopped) setMessage('No pudimos leer este archivo. Volvé a abrir la pieza para intentar de nuevo.'); });
    return () => { stopped = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [asset.id]);
  const image = !!asset.url?.startsWith('/demo/') || ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'].includes(asset.mimeType);
  return <article className="team-asset">
    {url && asset.mimeType.startsWith('video/') ? <video controls preload="metadata" src={url} aria-label={asset.name}/> : url && image ? <img src={url} alt={asset.name}/> : <FileText size={28}/>}
    <div className="team-asset-info"><strong>{asset.name}</strong><small>{(asset.size / 1024 / 1024).toFixed(1)} MB · {asset.url?.startsWith('/demo/')?'Archivo de ejemplo':'Guardado en este navegador'}</small>{message && <small>{message}</small>}</div>
    {url && <a className="button secondary" href={url} download={asset.name}><Download size={15}/>Descargar</a>}
  </article>;
}
