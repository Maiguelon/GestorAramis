import { useEffect, useRef, useState } from 'react';
import { Check, Download, ExternalLink, FileText, Pause, Play, RefreshCw, Upload, X } from 'lucide-react';
import { createZip, safeFileName, type ZipEntry } from '../lib/download-zip';
import { sharedWorkspace } from '../lib/shared-api';
import { uploadResumableFile, ResumableUploadError, type BrowserUploadSession } from '../lib/resumable-upload';
import { DRIVE_FILE_ACCEPT, DRIVE_ZIP_LIMIT, DriveApiError, driveAssetUrl, drivePost, driveRequest, fileSize, fingerprintDriveFile, validateDriveFile, type DriveAsset, type DriveStatus, type DriveUploadReply } from '../lib/drive-api';
import './drive-materials.css';

type Phase = 'queued' | 'uploading' | 'verifying' | 'paused' | 'error' | 'needs_file' | 'done';
interface PendingFile {
  uploadId: string; name: string; size: number; mimeType: string; fingerprint: string;
  file?: File; session?: BrowserUploadSession; phase: Phase; acknowledged: number; message: string; transferred?: boolean;
}
const activePhases = new Set<Phase>(['queued', 'uploading', 'verifying']);
function journalKey(pieceId: string) {
  const workspace = sharedWorkspace.getSnapshot().workspace;
  return `aramis.drive.uploads.v1.${workspace?.workspaceId}.${workspace?.memberId}.${pieceId}`;
}
function readPending(key: string): PendingFile[] {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(key) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((entry): entry is PendingFile => !!entry && typeof entry === 'object' && /^[a-f0-9-]{36}$/i.test(entry.uploadId) && typeof entry.name === 'string' && entry.name.length <= 1024 && Number.isSafeInteger(entry.size) && entry.size > 0 && entry.size <= 2 * 1024 ** 3 && typeof entry.mimeType === 'string' && /^[a-f0-9]{64}$/.test(entry.fingerprint)).slice(0, 100).map(entry => ({ uploadId: entry.uploadId, name: entry.name, size: entry.size, mimeType: entry.mimeType, fingerprint: entry.fingerprint, phase: 'needs_file', acknowledged: 0, message: 'Volvé a seleccionar el archivo original para reanudar o verificar la carga.' }));
  } catch { return []; }
}
function persistPending(key: string, queue: PendingFile[]) {
  const pending = queue.filter(item => item.phase !== 'done').map(({ uploadId, name, size, mimeType, fingerprint }) => ({ uploadId, name, size, mimeType, fingerprint }));
  // No Google upload capability or OAuth token is retained in the retry journal.
  if (pending.length) sessionStorage.setItem(key, JSON.stringify(pending)); else sessionStorage.removeItem(key);
}
function uploadMessage(reason: unknown): string {
  if (reason instanceof ResumableUploadError) {
    const messages: Record<string, string> = {
      upload_session_expired: 'La sesión de carga venció. Quitá esta carga de la lista y seleccioná el archivo para comenzar otra.',
      upload_access_denied: 'Drive rechazó el acceso a esta carga. Revisá la conexión desde Configuración.',
      upload_retry_exhausted: 'Se interrumpió la conexión. Reintentá para continuar desde lo recibido por Drive.',
      invalid_upload_file: 'La carga requiere el archivo original, con el mismo tamaño y formato.',
    };
    return messages[reason.code] ?? 'No se pudo completar la transferencia. Podés reintentar con el mismo archivo.';
  }
  return reason instanceof Error ? reason.message : 'No pudimos confirmar la carga. Podés reintentar.';
}

export default function DriveMaterials({ pieceId, pieceTitle, onBusy, onChanged }: {
  pieceId: string; pieceTitle: string; onBusy?: (busy: boolean) => void; onChanged?: () => void;
}) {
  const [key] = useState(() => journalKey(pieceId));
  const [queue, setQueue] = useState<PendingFile[]>(() => readPending(key));
  const queueRef = useRef(queue);
  const mounted = useRef(true);
  const processing = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const downloadController = useRef<AbortController | null>(null);
  const downloadReader = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const downloadUrls = useRef(new Set<string>());
  const [working, setWorking] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [assets, setAssets] = useState<DriveAsset[]>([]);
  const [folderUrl, setFolderUrl] = useState('');
  const [status, setStatus] = useState<DriveStatus>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mediaReady, setMediaReady] = useState(false);
  const [mediaVersion, setMediaVersion] = useState(0);
  const [zipping, setZipping] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState('');
  const [selectionErrors, setSelectionErrors] = useState<string[]>([]);
  const busy = working || selecting || zipping;
  const readSerial = useRef(0);
  const callbacks = useRef({ onChanged, onBusy });
  callbacks.current = { onChanged, onBusy };

  useEffect(() => { onBusy?.(busy); return () => { onBusy?.(false); }; }, [busy, onBusy]);
  useEffect(() => {
    mounted.current = true;
    const preventLeave = (event: BeforeUnloadEvent) => {
      if (processing.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', preventLeave);
    return () => {
      mounted.current = false; controller.current?.abort(); downloadController.current?.abort();
      void downloadReader.current?.cancel().catch(() => {});
      downloadUrls.current.forEach(url => URL.revokeObjectURL(url)); downloadUrls.current.clear();
      window.removeEventListener('beforeunload', preventLeave);
    };
  }, []);

  function replaceQueue(next: PendingFile[], strict = false) {
    // Late transfer failures must not recreate a previous user's retry journal after signout.
    if (journalKey(pieceId) !== key) return;
    try { persistPending(key, next); }
    catch { if (strict) throw new Error('El navegador no permite conservar el reintento de la carga. Habilitá el almacenamiento del sitio antes de subir.'); }
    queueRef.current = next;
    if (mounted.current) setQueue(next);
  }
  function updateFile(uploadId: string, patch: Partial<PendingFile>) {
    replaceQueue(queueRef.current.map(item => item.uploadId === uploadId ? { ...item, ...patch } : item));
  }
  async function renewMedia(reloadPreviews = false) {
    try {
      await drivePost('/api/drive/media-session');
      if (mounted.current) { setMediaReady(true); if (reloadPreviews) setMediaVersion(value => value + 1); }
    } catch (reason) {
      if (mounted.current) { setMediaReady(false); setError(uploadMessage(reason)); }
    }
  }
  async function refresh() {
    const serial = ++readSerial.current;
    try {
      const connection = await driveRequest<DriveStatus>('/api/drive/status');
      if (!mounted.current || serial !== readSerial.current) return;
      setStatus(connection);
      if (!connection.connected) { setAssets([]); setFolderUrl(''); setMediaReady(false); setLoading(false); return; }
      const result = await driveRequest<{ assets: DriveAsset[]; folderUrl?: string }>(`/api/drive/pieces/${encodeURIComponent(pieceId)}/assets`);
      if (!Array.isArray(result.assets)) throw new DriveApiError('service_unavailable');
      if (!mounted.current || serial !== readSerial.current) return;
      setAssets(result.assets); setFolderUrl(result.folderUrl && /^https:\/\/drive\.google\.com\/drive\/folders\/[A-Za-z0-9_-]+$/.test(result.folderUrl) ? result.folderUrl : ''); setError('');
    } catch (reason) {
      if (mounted.current && serial === readSerial.current) {
        if (reason instanceof DriveApiError && [401, 403].includes(reason.status)) { setAssets([]); setFolderUrl(''); setMediaReady(false); }
        setError(uploadMessage(reason));
      }
    } finally { if (mounted.current && serial === readSerial.current) setLoading(false); }
  }
  useEffect(() => {
    void refresh();
    const refreshVisible = () => { if (document.visibilityState === 'visible' && !processing.current) void refresh(); };
    const timer = window.setInterval(refreshVisible, 15_000);
    window.addEventListener('focus', refreshVisible);
    return () => { readSerial.current++; clearInterval(timer); window.removeEventListener('focus', refreshVisible); };
  }, [pieceId]);
  useEffect(() => {
    if (!status?.connected) return;
    void renewMedia();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void renewMedia(); }, 5 * 60_000);
    const onFocus = () => { if (document.visibilityState === 'visible') void renewMedia(); };
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [status?.connected]);

  async function pump() {
    if (processing.current || !mounted.current) return;
    processing.current = true; setWorking(true); callbacks.current.onBusy?.(true);
    try {
      while (mounted.current) {
        const item = queueRef.current.find(entry => entry.phase === 'queued');
        if (!item) break;
        const abort = new AbortController(); controller.current = abort;
        try {
          if (!item.file) { updateFile(item.uploadId, { phase: 'needs_file', message: 'Seleccioná el archivo original para continuar.' }); continue; }
          updateFile(item.uploadId, { phase: item.transferred ? 'verifying' : 'uploading', message: item.transferred ? 'Verificando archivo en Drive…' : 'Preparando carga…' });
          let asset: DriveAsset | undefined;
          let session = item.session;
          if (!item.transferred && !session) {
            // A repeated POST uses the original UUID even if the first response was lost.
            const reply = await drivePost<DriveUploadReply>('/api/drive/uploads', { uploadId: item.uploadId, pieceId, name: item.name, mimeType: item.mimeType, size: item.size, fingerprint: item.fingerprint }, abort.signal);
            asset = reply.asset; session = reply.session;
            if (session) updateFile(item.uploadId, { session });
          }
          if (abort.signal.aborted) throw new ResumableUploadError('upload_aborted');
          if (!asset && !item.transferred) {
            if (!session || session.uploadId !== item.uploadId || session.expectedSize !== item.size || session.mimeType !== item.mimeType) throw new DriveApiError('invalid_upload');
            try {
              await uploadResumableFile(item.file, session, { signal: abort.signal, chunkSize: 4 * 1024 ** 2, onProgress: progress => {
                updateFile(item.uploadId, { acknowledged: progress.acknowledgedBytes, message: progress.phase === 'retrying' ? 'Conexión interrumpida. Reintentando…' : progress.phase === 'uploaded_unverified' ? 'Transferencia terminada. Falta verificar el archivo…' : 'Subiendo a Drive…' });
              } });
            } catch (reason) {
              if (!(reason instanceof ResumableUploadError) || reason.code !== 'upload_session_expired' || abort.signal.aborted) throw reason;
              // A completed upload can outlive its resumable URL. Only the server
              // may recover its reserved, verified file; never initiate a duplicate.
              try { asset = (await drivePost<{asset:DriveAsset}>(`/api/drive/uploads/${encodeURIComponent(item.uploadId)}/complete`,{},abort.signal)).asset; }
              catch { throw reason; }
            }
            updateFile(item.uploadId, { transferred: true, phase: 'verifying', message: 'Verificando archivo en Drive…' });
          }
          if (!asset) asset = (await drivePost<{ asset: DriveAsset }>(`/api/drive/uploads/${encodeURIComponent(item.uploadId)}/complete`, {}, abort.signal)).asset;
          if (!asset || asset.source !== 'drive' || asset.size !== item.size || typeof asset.id !== 'string') throw new DriveApiError('upload_incomplete');
          updateFile(item.uploadId, { phase: 'done', acknowledged: item.size, message: 'Guardado en Drive', session: undefined, file: undefined });
          if (mounted.current) { readSerial.current++; setAssets(current => [...current.filter(entry => entry.id !== asset!.id), asset!]); callbacks.current.onChanged?.(); }
        } catch (reason) {
          updateFile(item.uploadId, { phase: abort.signal.aborted ? 'paused' : 'error', message: abort.signal.aborted ? 'Carga pausada. Podés continuar con el mismo archivo.' : uploadMessage(reason) });
        } finally { controller.current = null; }
      }
    } finally {
      processing.current = false;
      if (mounted.current) { setWorking(false); void refresh(); }
    }
  }
  async function selectFiles(files: File[]) {
    if (!files.length || selecting) return;
    setSelecting(true); callbacks.current.onBusy?.(true); setSelectionErrors([]);
    const errors: string[] = [];
    try {
      for (const file of files) {
        try {
          const mimeType = validateDriveFile(file);
          const fingerprint = await fingerprintDriveFile(file);
          if (!mounted.current) return;
          const previous = queueRef.current.find(item => item.fingerprint === fingerprint);
          if (previous?.phase === 'done') { errors.push(`${file.name}: ya se guardó en esta selección.`); continue; }
          if (previous && activePhases.has(previous.phase)) { errors.push(`${file.name}: ya está en la lista de cargas.`); continue; }
          const item: PendingFile = previous ? { ...previous, file, phase: 'queued', message: 'Esperando turno…' } : { uploadId: crypto.randomUUID(), name: file.name, size: file.size, mimeType, fingerprint, file, phase: 'queued', acknowledged: 0, message: 'Esperando turno…' };
          replaceQueue(previous ? queueRef.current.map(entry => entry.uploadId === item.uploadId ? item : entry) : [...queueRef.current, item], true);
        } catch (reason) { errors.push(`${file.name}: ${uploadMessage(reason)}`); }
      }
    } finally { if (mounted.current) { setSelectionErrors(errors); setSelecting(false); void pump(); } }
  }
  function retry(item: PendingFile) {
    if (!item.file) { updateFile(item.uploadId, { phase: 'needs_file', message: 'Volvé a seleccionar el archivo original con Agregar material del equipo.' }); return; }
    updateFile(item.uploadId, { phase: 'queued', message: 'Esperando turno…' }); void pump();
  }
  function pauseAll() {
    replaceQueue(queueRef.current.map(item => item.phase === 'queued' ? { ...item, phase: 'paused', message: 'Carga pausada.' } : item));
    controller.current?.abort();
  }
  function remove(item: PendingFile) {
    if (!confirm(`¿Quitar “${item.name}” de la lista? Para volver a cargarlo tendrás que seleccionarlo otra vez. Esto no elimina archivos ya guardados en Drive.`)) return;
    replaceQueue(queueRef.current.filter(entry => entry.uploadId !== item.uploadId));
  }
  async function downloadAll() {
    if (!assets.length || busy) return;
    if (assets.reduce((sum, asset) => sum + asset.size, 0) > DRIVE_ZIP_LIMIT) { setError('El conjunto supera 256 MB. Descargá los archivos individualmente para evitar sobrecargar la memoria del celular.'); return; }
    setZipping(true); callbacks.current.onBusy?.(true); setError('');
    const abort = new AbortController(); downloadController.current = abort;
    try {
      const entries: ZipEntry[] = [];
      let received = 0;
      for (const [index, asset] of assets.entries()) {
        setDownloadProgress(`Descargando ${index + 1}/${assets.length}: ${asset.name}…`);
        if (abort.signal.aborted || !mounted.current) return;
        const response = await sharedWorkspace.authenticatedFetch(driveAssetUrl(asset.id), { signal: abort.signal });
        if (!response.ok || Number(response.headers.get('content-length') ?? asset.size) > DRIVE_ZIP_LIMIT - received) { await response.body?.cancel(); throw new Error(`No pudimos descargar “${asset.name}”. No se creó un ZIP parcial.`); }
        // Bound actual streamed bytes too; a missing/incorrect Content-Length must not exhaust a phone.
        const reader = response.body?.getReader();
        if (!reader) throw new Error(`No pudimos leer “${asset.name}”. No se creó un ZIP parcial.`);
        downloadReader.current = reader;
        const parts: BlobPart[] = [];
        let size = 0;
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.byteLength;
            if (size > asset.size || received + size > DRIVE_ZIP_LIMIT || abort.signal.aborted || !mounted.current) {
              await reader.cancel();
              throw new Error(`No pudimos verificar “${asset.name}”. No se creó un ZIP parcial.`);
            }
            parts.push(part.value);
          }
        } finally { downloadReader.current = null; reader.releaseLock(); }
        const blob = new Blob(parts, { type: asset.mimeType });
        if (blob.size !== asset.size || received + blob.size > DRIVE_ZIP_LIMIT) throw new Error(`El tamaño de “${asset.name}” no coincide. No se creó un ZIP parcial.`);
        received += blob.size; entries.push({ name: asset.name, blob });
      }
      const zip = await createZip(entries, (_name, index) => {
        if (abort.signal.aborted || !mounted.current) throw new DOMException('Descarga cancelada.', 'AbortError');
        setDownloadProgress(`Preparando ZIP ${index + 1}/${entries.length}: ${entries[index].name}…`);
      });
      if (abort.signal.aborted || !mounted.current) return;
      const url = URL.createObjectURL(zip), link = document.createElement('a');
      downloadUrls.current.add(url);
      link.href = url; link.download = `${safeFileName(pieceTitle || 'Material de la pieza')}.zip`; document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => { URL.revokeObjectURL(url); downloadUrls.current.delete(url); }, 60_000);
    } catch (reason) { if (mounted.current) setError(uploadMessage(reason)); }
    finally { downloadController.current = null; if (mounted.current) { setDownloadProgress(''); setZipping(false); } }
  }

  return <section className="drive-materials" aria-label="Material en Drive">
    <div className="subsection-heading"><h3>Material del equipo</h3><span className="form-hint">{assets.length} {assets.length === 1 ? 'archivo' : 'archivos'}</span></div>
    <p className="form-hint">Videos, fotos y referencias para esta pieza. Podés seleccionar varias tomas desde el celular, hasta 2 GB por archivo.</p>
    {loading && <p role="status">Buscando material…</p>}
    {!loading && status && !status.connected && <p className="notice-banner">{status.configured ? 'Conectá Google Drive desde Configuración para subir y consultar material.' : 'La carga, vista previa y descarga de material estarán disponibles al conectar Google Drive.'}</p>}
    {error && <p className="error-banner" role="alert">{error}</p>}
    {selectionErrors.length > 0 && <div className="error-banner" role="alert">{selectionErrors.map((message, index) => <p key={index}>{message}</p>)}</div>}
    <div className="drive-actions"><button type="button" className="button secondary" disabled={busy || !assets.length || !status?.connected} onClick={() => void downloadAll()}><Download size={15}/>{zipping ? 'Preparando ZIP…' : 'Descargar todo (ZIP)'}</button><button type="button" className="text-button" disabled={busy} onClick={() => { void refresh(); if (status?.connected) void renewMedia(true); }}><RefreshCw size={15}/>Actualizar material</button>{folderUrl && <a className="text-button" href={folderUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/>Abrir carpeta</a>}</div>
    {assets.reduce((sum, asset) => sum + asset.size, 0) > DRIVE_ZIP_LIMIT && <p className="form-hint">El ZIP admite hasta 256 MB para cuidar la memoria del celular. Este conjunto debe descargarse por archivo.</p>}
    {status?.connected && <label className="team-file-picker drive-file-picker"><Upload size={17}/>{selecting ? 'Preparando archivos…' : 'Agregar material del equipo'}<input aria-label="Agregar material del equipo" type="file" accept={DRIVE_FILE_ACCEPT} multiple disabled={selecting || zipping} onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ''; void selectFiles(files); }}/></label>}
    {queue.some(item => item.phase !== 'done') && <p className="form-hint">Mantené esta pestaña abierta durante la carga. Si recargás o la cerrás, volvé a seleccionar los archivos originales para continuar.</p>}
    {working && <button type="button" className="button secondary" onClick={pauseAll}><Pause size={15}/>Pausar cargas</button>}
    <div className="drive-upload-list" aria-live="polite">{queue.map(item => <article className={`drive-upload ${item.phase}`} key={item.uploadId} aria-label={`Carga de ${item.name}`}>
      <div className="drive-upload-heading"><strong>{item.name}</strong><small>{fileSize(item.size)}</small></div>
      {['uploading', 'verifying', 'paused', 'queued'].includes(item.phase) && <progress max={item.size} value={item.acknowledged} aria-label={`Progreso de ${item.name}`}/>}
      <div className="drive-upload-state">{item.phase === 'done' && <Check size={15}/>}<span>{item.message}</span>{item.phase === 'uploading' && item.acknowledged > 0 && <small>{Math.floor(item.acknowledged / item.size * 100)}%</small>}</div>
      {['error', 'paused'].includes(item.phase) && <button type="button" className="text-button" onClick={() => retry(item)}>{item.phase === 'paused' ? <Play size={15}/> : <RefreshCw size={15}/>} {item.transferred ? 'Reintentar verificación' : item.phase === 'paused' ? 'Continuar carga' : 'Reintentar carga'}</button>}
      {['error', 'paused', 'needs_file'].includes(item.phase) && <button type="button" className="text-button muted" onClick={() => remove(item)}><X size={15}/>Quitar de la lista</button>}
    </article>)}</div>
    {downloadProgress && <p className="form-hint" role="status">{downloadProgress}</p>}
    <div className="team-asset-list">{assets.map(asset => <DriveAssetPreview key={asset.id} asset={asset} ready={mediaReady} version={mediaVersion}/>)}</div>
    {!loading && status?.connected && !assets.length && !working && <p className="form-hint">Todavía no hay material adjunto a esta pieza.</p>}
  </section>;
}

function DriveAssetPreview({ asset, ready, version }: { asset: DriveAsset; ready: boolean; version: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [version]);
  const image = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(asset.mimeType);
  // Match the server's inline video formats; MOV/M4V are served as downloads.
  const video = ['video/mp4', 'video/webm'].includes(asset.mimeType);
  return <article className="team-asset drive-asset">
    {ready && !failed && video ? <video key={version} controls playsInline preload="metadata" src={driveAssetUrl(asset.id)} aria-label={asset.name} onError={() => setFailed(true)}/> : ready && !failed && image ? <img key={version} src={driveAssetUrl(asset.id)} alt={asset.name} loading="lazy" onError={() => setFailed(true)}/> : <FileText size={28}/>}
    <div className="team-asset-info"><strong>{asset.name}</strong><small>{fileSize(asset.size)} · Guardado en Drive</small>{!ready ? <small>Esperando acceso al archivo…</small> : failed ? <small>No se pudo mostrar la vista previa. Podés descargar el archivo o actualizar el material.</small> : !image && !video && <small>Este formato se consulta descargando el archivo.</small>}</div>
    {ready && <a className="button secondary" href={driveAssetUrl(asset.id, true)} download={safeFileName(asset.name)}><Download size={15}/>Descargar</a>}
  </article>;
}
