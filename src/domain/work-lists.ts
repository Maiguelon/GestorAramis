import type { Piece, WorkspaceState } from '../../contracts/domain';
import { activeMaterial, weekRange } from './selectors';

export const ARAMIS_TIME_ZONE = 'America/Argentina/Buenos_Aires';
export type WorkScope = 'all' | 'week';

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ARAMIS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Calendar cutoffs belong to Aramis, even when the browser is in another timezone. */
export function aramisDate(date = new Date()): string {
  const parts = dayFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Find the actual boundary from the timezone rather than assuming the browser's offset. */
export function millisecondsUntilAramisDayChange(date = new Date()): number {
  const today = aramisDate(date);
  const timestamp = date.getTime();
  let first = timestamp + 1;
  let last = timestamp + 30 * 60 * 60 * 1000;
  while (first < last) {
    const middle = Math.floor((first + last) / 2);
    if (aramisDate(new Date(middle)) === today) first = middle + 1;
    else last = middle;
  }
  return first - timestamp;
}

/** Earliest date first; undated pieces last, then deterministic title and ID tie-breaks. */
export function comparePieceDate(a: Piece, b: Piece): number {
  if (a.plannedDate !== b.plannedDate) {
    if (a.plannedDate === null) return 1;
    if (b.plannedDate === null) return -1;
    return a.plannedDate.localeCompare(b.plannedDate);
  }
  return a.title.localeCompare(b.title, 'es-AR') || a.id.localeCompare(b.id);
}

export function isApprovedPiece(piece: Piece): boolean {
  return piece.status === 'approved' || piece.status === 'scheduled';
}

export function isHistoricalPiece(piece: Piece, today: string): boolean {
  return !piece.archived && (piece.status === 'published' ||
    (isApprovedPiece(piece) && piece.plannedDate !== null && piece.plannedDate < today));
}

/** Current work retains overdue and all undated pieces; approval moves work below unfinished tasks. */
export function pendingWork(state: WorkspaceState, today: string, scope: WorkScope = 'all'): Piece[] {
  const weekEnd = scope === 'week' ? weekRange(today).end : null;
  return state.pieces.filter(piece => !piece.archived && !isHistoricalPiece(piece, today) &&
    (weekEnd === null || piece.plannedDate === null || piece.plannedDate <= weekEnd))
    .sort((a, b) => Number(isApprovedPiece(a)) - Number(isApprovedPiece(b)) || comparePieceDate(a, b));
}

export function approvedWork(state: WorkspaceState, today: string, scope: WorkScope = 'all'): Piece[] {
  return pendingWork(state, today, scope).filter(isApprovedPiece);
}

/** Attention is independent of the process stage and never reopens finished work. */
export function needsAttention(state: WorkspaceState, piece: Piece, today: string): boolean {
  if (piece.archived || piece.status === 'published' || isApprovedPiece(piece)) return false;
  const material = activeMaterial(state, piece.id);
  return Boolean((piece.plannedDate && piece.plannedDate < today) || material?.status === 'received' ||
    (material?.dueDate && material.dueDate < today));
}

/** Preserve the existing readiness rule: Design starts only after Marketing and material checks. */
export function productionWaitReason(state: WorkspaceState, piece: Piece): string | null {
  if (piece.productionStage === 'recording') return 'Planificación · Marketing';
  if (piece.workArea === 'marketing') return 'Pendiente de Marketing';
  const material = activeMaterial(state, piece.id);
  if (material) return material.status === 'received' ? 'Material pendiente de verificar' : 'Esperando material del cliente';
  return null;
}

function compareHistoryDate(a: Piece, b: Piece): number {
  if (a.plannedDate !== b.plannedDate) {
    if (a.plannedDate === null) return 1;
    if (b.plannedDate === null) return -1;
    return b.plannedDate.localeCompare(a.plannedDate);
  }
  return a.title.localeCompare(b.title, 'es-AR') || a.id.localeCompare(b.id);
}

export function historicalWork(state: WorkspaceState, today: string): Piece[] {
  return state.pieces.filter(piece => isHistoricalPiece(piece, today)).sort(compareHistoryDate);
}

export function archivedWork(state: WorkspaceState): Piece[] {
  return state.pieces.filter(piece => piece.archived).sort(compareHistoryDate);
}
