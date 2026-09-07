import { useRef, useState } from 'react';
import { ArrowRight, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, CircleHelp, FileText, Film, Image, MessageCircle, Paperclip, PencilLine, Send, UploadCloud, X } from 'lucide-react';
import type { Asset, DecisionKind, MaterialRequest, Review } from '../../contracts/domain';
import { FORMAT_LABELS } from '../../contracts/domain';
import { runPublicCommand } from '../lib/api';
import { bytesLabel, ClientFooter, ClientHeader, dateLabel, Unavailable, useClientView } from './shared';
import './client.css';

type SelectedFile = { id: string; file: File };
const uniqueId = () => globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function AssetPreview({ assets, title }: { assets: Asset[]; title: string }) {
  const [active, setActive] = useState(0);
  const asset = assets[Math.min(active, Math.max(0, assets.length - 1))];
  return <section className="client-preview" aria-label="Vista previa del contenido">
    <div className="client-preview-label"><span>VISTA PREVIA</span>{assets.length > 1 && <span>{Math.min(active + 1, assets.length)} / {assets.length}</span>}</div>
    <div className="client-preview-content">
      {asset?.url && asset.mimeType.startsWith('image/') ? <img src={asset.url} alt={`${title}, imagen ${active + 1}`} /> : asset?.url && asset.mimeType.startsWith('video/') ? <video src={asset.url} controls preload="metadata" playsInline aria-label={asset.name} /> : <div className="client-file-preview"><span>{asset?.mimeType.startsWith('video/') ? <Film size={42} strokeWidth={1.2} /> : <Image size={42} strokeWidth={1.2} />}</span><strong>{asset?.name ?? 'Vista previa pendiente'}</strong><p>{asset?.source === 'demo' ? 'Archivo de ejemplo. No contiene un video real.' : 'No hay una vista previa disponible para este archivo.'}</p></div>}
    </div>
    {assets.length > 1 && <div className="client-preview-pagination"><button className="client-icon-btn" aria-label="Imagen anterior" disabled={active === 0} onClick={() => setActive(value => value - 1)}><ChevronLeft size={19} /></button><div>{assets.map((item, index) => <button key={item.id} aria-label={`Ver imagen ${index + 1}`} aria-pressed={active === index} className={active === index ? 'active' : ''} onClick={() => setActive(index)} />)}</div><button className="client-icon-btn" aria-label="Imagen siguiente" disabled={active >= assets.length - 1} onClick={() => setActive(value => value + 1)}><ChevronRight size={19} /></button></div>}
    {asset && <div className="client-preview-file"><Paperclip size={13} /><span>{asset.name}</span><small>{bytesLabel(asset.size)}</small></div>}
  </section>;
}

function ReviewActions({ review, token }: { review: Review; token: string }) {
  const [mode, setMode] = useState<'changes' | 'comment' | null>(null);
  const [comment, setComment] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const submit = async (kind: DecisionKind) => {
    if (busy) return;
    if (kind !== 'approved' && !comment.trim()) { setError(kind === 'changes' ? 'Contanos qué te gustaría cambiar para poder avanzar.' : 'Escribí el comentario que querés dejarnos.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await Promise.resolve(runPublicCommand({ type: 'respond-review', reviewId: review.id, version: review.version, kind, comment: kind === 'approved' ? '' : comment.trim(), authorName: name.trim() || 'Cliente', source: 'link', idempotencyKey: uniqueId() }, token));
      setComment(''); setMode(null);
      setNotice(kind === 'approved' ? 'Aprobación registrada en esta demostración.' : kind === 'changes' ? 'Pedido de cambios registrado en esta demostración.' : 'Comentario guardado. La pieza sigue pendiente de aprobación.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo registrar la respuesta. Volvé a intentar.'); }
    finally { setBusy(false); }
  };
  if (review.status !== 'pending') return <section className={`client-response-summary response-${review.status}`} aria-live="polite"><span>{review.status === 'approved' ? <CheckCircle2 size={28} /> : review.status === 'changes' ? <PencilLine size={26} /> : <CircleHelp size={26} />}</span><h2>{review.status === 'approved' ? '¡Listo, contenido aprobado!' : review.status === 'changes' ? 'Recibimos tus cambios' : 'Hay una revisión más reciente'}</h2><p>{review.status === 'approved' ? `Tu aprobación de la versión ${review.version} ya quedó registrada. El equipo sigue con la publicación.` : review.status === 'changes' ? 'El equipo va a revisar tu pedido. Cuando la nueva versión esté lista, vas a recibir otro enlace.' : 'Esta versión ya no admite respuestas. Pedile al equipo el enlace actualizado.'}</p><small>Respuesta local de demostración · no se envió ningún mensaje.</small></section>;

  return <section className="client-review-actions"><div className="client-action-heading"><span className="client-section-kicker">TU RESPUESTA</span><h2>Revisar contenido</h2><p>Al aprobar, confirmás las imágenes o el video y el texto de esta versión.</p></div>{notice && <div className="client-success-notice" role="status"><CheckCircle2 size={18} />{notice}</div>}{error && <p className="client-inline-error" role="alert">{error}</p>}
    {!mode ? <><div className="client-decision-buttons"><button className="client-btn client-btn-primary" disabled={busy} onClick={() => void submit('approved')}><Check size={18} />{busy ? 'Guardando…' : 'Aprobar contenido'}</button><button className="client-btn client-btn-secondary" disabled={busy} onClick={() => { setMode('changes'); setError(''); }}><PencilLine size={17} />Pedir cambios</button></div><button className="client-comment-toggle" onClick={() => { setMode('comment'); setError(''); }}><MessageCircle size={16} />Quiero dejar un comentario primero</button></> : <form className="client-comment-form" onSubmit={event => { event.preventDefault(); void submit(mode); }}><label htmlFor="client-response-comment">{mode === 'changes' ? '¿Qué te gustaría cambiar?' : 'Tu comentario'}</label><textarea autoFocus id="client-response-comment" rows={4} value={comment} onChange={event => setComment(event.target.value)} placeholder={mode === 'changes' ? 'Por ejemplo: cambiemos la foto de portada por…' : 'Dejanos acá tu consulta o comentario…'} required /><label htmlFor="client-response-name">Tu nombre <span>(opcional)</span></label><input id="client-response-name" value={name} onChange={event => setName(event.target.value)} autoComplete="name" placeholder="¿Con quién hablamos?" /><div className="client-form-actions"><button type="button" className="client-text-btn" disabled={busy} onClick={() => { setMode(null); setError(''); }}>Cancelar</button><button className="client-btn client-btn-primary" disabled={busy || !comment.trim()} type="submit"><Send size={16} />{busy ? 'Guardando…' : mode === 'changes' ? 'Enviar cambios' : 'Enviar comentario'}</button></div><small>{mode === 'comment' ? 'Dejar un comentario no aprueba ni rechaza el contenido.' : 'La pieza vuelve a producción. Revisarás los cambios en una nueva versión.'}</small></form>}
  </section>;
}

function MaterialForm({ request, token }: { request: MaterialRequest; token: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const addFiles = (incoming: FileList | File[] | null) => {
    if (!incoming) return;
    setError(''); setNotice('');
    setFiles(existing => {
      const result = [...existing];
      for (const file of Array.from(incoming)) if (!result.some(item => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified)) result.push({ id: uniqueId(), file });
      return result;
    });
  };
  const submit = async () => {
    if (!files.length || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const assets: Asset[] = files.map(({ id, file }) => ({ id, name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, source: 'demo' }));
      await Promise.resolve(runPublicCommand({ type: 'receive-material', requestId: request.id, assets }, token));
      setFiles([]); if (inputRef.current) inputRef.current.value = '';
      setNotice(`${assets.length === 1 ? 'Se registró el nombre de 1 archivo' : `Se registraron los nombres de ${assets.length} archivos`} en este navegador. Los archivos no se subieron a Drive.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No pudimos registrar los archivos. Tu selección se conserva para volver a intentar.'); }
    finally { setBusy(false); }
  };

  return <section className="client-material-form"><div className="client-material-instructions"><span className="client-section-kicker">LO QUE NECESITAMOS</span><p>{request.instructions}</p>{request.dueDate && <div className="client-material-deadline"><CalendarDays size={16} /> Idealmente, antes del {dateLabel(request.dueDate)}</div>}</div>
    {request.status === 'complete' ? <div className="client-success-notice" role="status"><CheckCircle2 size={20} /><div><strong>El equipo confirmó que el material está completo.</strong><p>Por ahora no necesitás enviar nada más.</p></div></div> : <><div className="client-material-demo-note"><CircleHelp size={18} /><p><strong>Probá el recorrido.</strong> Esta demostración guarda solamente nombres y tamaños. Los archivos permanecen en tu dispositivo; todavía no hay conexión con Drive.</p></div><input id="client-material-files" ref={inputRef} type="file" multiple tabIndex={-1} aria-label="Archivos de material" className="client-file-input" onChange={event => { addFiles(event.target.files); event.target.value = ''; }} /><button className={`client-dropzone${dragging ? ' is-dragging' : ''}`} disabled={busy} onClick={() => inputRef.current?.click()} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}><span className="client-upload-circle"><UploadCloud size={27} strokeWidth={1.5} /></span><strong>Seleccioná tu material</strong><span>Videos, fotos o documentos. Podés elegir varios.</span><small>O arrastralos hasta acá desde tu computadora</small><span className="client-upload-link">Elegir archivos <ArrowRight size={15} /></span></button>
      {files.length > 0 && <div className="client-selected-files"><h3>Para registrar <span>{files.length}</span></h3>{files.map(({ id, file }) => <div className="client-file-row" key={id}><span className="client-file-icon"><FileText size={18} /></span><span><strong>{file.name}</strong><small>{bytesLabel(file.size)} · sólo en tu dispositivo</small></span><button className="client-icon-btn" aria-label={`Quitar ${file.name}`} disabled={busy} onClick={() => setFiles(existing => existing.filter(item => item.id !== id))}><X size={17} /></button></div>)}<button className="client-btn client-btn-primary client-material-submit" disabled={busy} onClick={() => void submit()}><Check size={18} />{busy ? 'Registrando…' : `Registrar ${files.length === 1 ? 'archivo' : `${files.length} archivos`} de prueba`}</button></div>}
    </>}
    {error && <p className="client-inline-error" role="alert">{error}</p>}{notice && <div className="client-success-notice" role="status"><CheckCircle2 size={20} /><p>{notice}</p></div>}
    {request.assets.length > 0 && <div className="client-received-files"><div className="client-received-heading"><CheckCircle2 size={18} /><h3>{request.status === 'complete' ? 'Material registrado' : 'Registrado · pendiente de revisión del equipo'}</h3></div>{request.assets.map(asset => <div className="client-file-row" key={asset.id}><span className="client-file-icon"><FileText size={18} /></span><span><strong>{asset.name}</strong><small>{bytesLabel(asset.size)} · {asset.source === 'demo' ? 'registro de ejemplo, sin archivo' : 'recibido'}</small></span><Check size={16} className="client-file-check" /></div>)}{request.status !== 'complete' && <p className="client-received-explanation">El equipo confirmará si tiene todo lo que necesita. Podés agregar más material mientras tanto.</p>}</div>}
  </section>;
}

export default function ClientRequest({ token }: { token: string }) {
  const { view, error } = useClientView(token);
  if (!view || view.scope === 'calendar') return <Unavailable error={error || 'Este enlace no corresponde a una solicitud.'} />;
  const review = view.scope === 'review' ? view.reviews.find(item => item.id === view.targetId) : undefined;
  const material = view.scope === 'material' ? view.materials.find(item => item.id === view.targetId) : undefined;
  const piece = view.pieces.find(item => item.id === (review?.pieceId ?? material?.pieceId));
  if (!piece || (!review && !material)) return <Unavailable error="El pedido ya no está disponible. Pedile al equipo un enlace actualizado." />;
  const responses = review ? view.responses.filter(response => response.reviewId === review.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : [];
  return <div className="client-app">
    <ClientHeader name={view.client.name} page={review ? 'Revisión de contenido' : 'Pedido de material'} />
    <main className={`client-request-main${material ? ' is-material' : ''}`}>
      <div className="client-request-heading"><div className="client-request-eyebrow"><span className="client-section-kicker">{review ? 'REVISIÓN' : 'MATERIAL'}</span><span className="client-request-version">{review ? `Versión ${review.version}` : 'Pedido de material'}</span></div><h1>{piece.title}</h1><p>{review ? 'Revisá los archivos y el texto de esta versión.' : 'Consultá las instrucciones y adjuntá el material solicitado.'}</p><div className="client-request-meta"><span>{FORMAT_LABELS[piece.format]}</span><i /><span><CalendarDays size={14} />Publicación prevista: {dateLabel(piece.plannedDate)}</span></div></div>
      {review ? <div className="client-review-layout"><div className="client-review-content"><AssetPreview assets={review.assets} title={piece.title} /><section className="client-caption"><div><FileText size={16} /><h2>Texto de publicación</h2></div><p>{review.caption || 'Esta versión no incluye un texto de publicación.'}</p></section></div><aside className="client-review-sidebar"><ReviewActions key={review.id} review={review} token={token} />{responses.length > 0 && <section className="client-response-history"><h2><MessageCircle size={16} />Tus respuestas</h2>{responses.map(response => <article key={response.id}><div><strong>{response.authorName}</strong><time dateTime={response.createdAt}>{new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(response.createdAt))}</time></div><span>{response.kind === 'approved' ? 'Aprobó esta versión' : response.kind === 'changes' ? 'Pidió cambios' : 'Dejó un comentario'}</span>{response.comment && <p>{response.comment}</p>}</article>)}</section>}<p className="client-request-help">Si preferís, también podés responder en el chat de WhatsApp con el equipo.</p></aside></div> : material && <MaterialForm key={material.id} request={material} token={token} />}
    </main><ClientFooter />
  </div>;
}
