import type { Asset, ClientView, Command, MaterialRequest, Piece, PublicPiece, Review, Share, WorkspaceState } from '../../contracts/domain';
import { DomainError, isCalendarDate } from './engine';

export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addDays(date: string, amount: number): string {
  if (!isCalendarDate(date) || !Number.isInteger(amount)) throw new DomainError('VALIDATION', 'La fecha o el intervalo no son válidos.');
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + amount);
  return next.toISOString().slice(0, 10);
}

export function weekRange(today: string): { start: string; end: string } {
  if (!isCalendarDate(today)) throw new DomainError('VALIDATION', 'La fecha no es válida.');
  const day = new Date(`${today}T12:00:00Z`).getUTCDay();
  const start = addDays(today, -(day === 0 ? 6 : day - 1));
  return { start, end: addDays(start, 6) };
}

export function currentReview(state: WorkspaceState, pieceId: string): Review | undefined {
  const latest = state.reviews.filter(review => review.pieceId === pieceId).sort((a, b) => b.version - a.version)[0];
  return latest?.status !== 'superseded' ? latest : undefined;
}

export function activeMaterial(state: WorkspaceState, pieceId: string): MaterialRequest | undefined {
  return state.materials.filter(request => request.pieceId === pieceId && request.status !== 'complete').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

/** Smaller values sort first: overdue work, blocked upcoming work, other dated work, undated, published. */
export function piecePriority(state: WorkspaceState, piece: Piece, today: string): number {
  if (piece.archived) return 10_000;
  if (piece.status === 'published') return 9_000;
  const material = activeMaterial(state, piece.id);
  if ((piece.plannedDate && piece.plannedDate < today) || (material?.dueDate && material.dueDate < today)) return 0;
  if (!piece.plannedDate) return 5_000;
  const days = Math.round((Date.parse(`${piece.plannedDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  const blocked = Boolean(material) || piece.status === 'review';
  return (blocked && days <= 3 ? 100 : 1_000) + Math.max(0, days);
}

function resolveShare(state: WorkspaceState, token: string): { share: Share; pieces: Piece[] } {
  const share = state.shares.find(item => item.token === token);
  if (!share || share.revokedAt) throw new DomainError('INVALID_LINK', 'Este enlace no está disponible. Pedile uno nuevo a Aramís.');
  if (!state.clients.some(client => client.id === share.clientId)) throw new DomainError('INVALID_LINK', 'Este enlace no está disponible.');
  if (share.scope === 'calendar') {
    if (share.targetId !== share.clientId) throw new DomainError('INVALID_LINK', 'Este enlace no está disponible.');
    return { share, pieces: state.pieces.filter(piece => piece.clientId === share.clientId && piece.visibleToClient && !piece.archived) };
  }
  if (share.scope !== 'review' && share.scope !== 'material') throw new DomainError('INVALID_LINK', 'Este enlace no está disponible.');
  const request = share.scope === 'review' ? state.reviews.find(item => item.id === share.targetId) : state.materials.find(item => item.id === share.targetId);
  const piece = request && state.pieces.find(item => item.id === request.pieceId && item.clientId === share.clientId && !item.archived);
  if (!request || !piece) throw new DomainError('INVALID_LINK', 'Este enlace no está disponible.');
  // An explicit request link authorizes that request, even if its piece is hidden from the calendar.
  if (share.scope === 'review' && currentReview(state, piece.id)?.id !== request.id) throw new DomainError('STALE_REVIEW', 'Hay una versión más reciente. Pedile a Aramís el enlace actualizado.');
  return { share, pieces: [piece] };
}

function publicAsset(asset: Asset): Asset {
  let url: string | undefined;
  if (asset.url?.startsWith('/demo/') && !asset.url.includes('..') && !/[?#\\]/.test(asset.url)) url = asset.url;
  else if (asset.url) {
    try {
      const parsed = new URL(asset.url);
      const sensitive = [...parsed.searchParams.keys()].some(key => /token|secret|signature|credential|api[-_]?key|authorization|x-goog|x-amz/i.test(key));
      if (!parsed.username && !parsed.password && !sensitive && (['https:', 'http:'].includes(parsed.protocol) || (parsed.protocol === 'blob:' && /^blob:https?:\/\//.test(asset.url)))) url = asset.url;
    } catch { /* Invalid/unsafe URLs are not sent to a client. */ }
  }
  return { id: asset.id, name: asset.name, mimeType: asset.mimeType, size: asset.size, source: asset.source, ...(url ? { url } : {}) };
}

function publicPiece(piece: Piece, review?: Review): PublicPiece {
  return {
    id: piece.id, clientId: piece.clientId, title: piece.title, format: piece.format,
    status: piece.status, plannedDate: piece.plannedDate, visibleToClient: piece.visibleToClient,
    // The editor's unfinished caption is private until a review snapshot exists.
    caption: review?.caption ?? '', archived: piece.archived, revision: piece.revision,
    createdAt: piece.createdAt, updatedAt: piece.updatedAt,
  };
}

export function getClientView(state: WorkspaceState, token: string): ClientView {
  const { share, pieces } = resolveShare(state, token);
  const client = state.clients.find(item => item.id === share.clientId)!;
  const pieceIds = new Set(pieces.map(piece => piece.id));
  const reviews = share.scope === 'material' ? [] : state.reviews.filter(review => pieceIds.has(review.pieceId) && currentReview(state, review.pieceId)?.id === review.id && (share.scope === 'calendar' || review.id === share.targetId));
  const reviewIds = new Set(reviews.map(review => review.id));
  const materials = share.scope === 'review' ? [] : state.materials.filter(request => pieceIds.has(request.pieceId) && (share.scope === 'calendar' || request.id === share.targetId));
  return {
    client: { id: client.id, name: client.name, initials: client.initials, color: client.color },
    pieces: pieces.map(piece => publicPiece(piece, reviews.find(review => review.pieceId === piece.id))),
    reviews: reviews.map(review => ({ id: review.id, pieceId: review.pieceId, version: review.version, caption: review.caption, assets: review.assets.map(publicAsset), status: review.status, createdAt: review.createdAt, sentAt: review.sentAt })),
    materials: materials.map(request => ({ id: request.id, pieceId: request.pieceId, instructions: request.instructions, dueDate: request.dueDate, status: request.status, assets: request.assets.map(publicAsset), createdAt: request.createdAt, sentAt: request.sentAt })),
    responses: state.responses.filter(response => reviewIds.has(response.reviewId)).map(response => ({ id: response.id, reviewId: response.reviewId, kind: response.kind, comment: response.comment, authorName: response.source === 'whatsapp' ? 'Cliente · registrado por Aramís' : response.authorName, source: response.source, recordedBy: null, createdAt: response.createdAt })),
    // A request link exposes only its own content, never other requests' timelines.
    activities: share.scope === 'calendar' ? state.activities.filter(item => pieceIds.has(item.pieceId) && item.visibility === 'client').map(item => ({ id: item.id, pieceId: item.pieceId, text: item.text, actor: 'Aramís', createdAt: item.createdAt, visibility: 'client' })) : [],
    scope: share.scope,
    targetId: share.targetId,
  };
}

/** Required before any public command; the calendar token never authorizes mutations. */
export function assertPublicCommandAccess(state: WorkspaceState, token: string, command: Command): void {
  const { share } = resolveShare(state, token);
  const allowed = (share.scope === 'review' && command.type === 'respond-review' && command.reviewId === share.targetId && command.source === 'link') || (share.scope === 'material' && command.type === 'receive-material' && command.requestId === share.targetId);
  if (!allowed) throw new DomainError('FORBIDDEN', 'Este enlace no permite realizar esa acción.');
}
