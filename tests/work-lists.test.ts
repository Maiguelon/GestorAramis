import { describe, expect, it } from 'vitest';
import type { Piece, WorkspaceState } from '../contracts/domain';
import { applyCommand } from '../src/domain/engine';
import { createSeed } from '../src/domain/seed';
import {
  aramisDate, archivedWork, comparePieceDate, historicalWork, isApprovedPiece, isHistoricalPiece,
  millisecondsUntilAramisDayChange, needsAttention, pendingWork, productionWaitReason,
} from '../src/domain/work-lists';

const today = '2026-09-30';
const piece = (id: string, patch: Partial<Piece> = {}): Piece => ({
  id, title: id, clientId: 'client-oliva', ownerId: 'member-lucia', format: 'post', status: 'planned',
  plannedDate: today, visibleToClient: false, caption: '', internalNote: '', archived: false, revision: 1,
  createdAt: '2026-09-01T12:00:00.000Z', updatedAt: '2026-09-01T12:00:00.000Z', ...patch,
});
const stateWith = (...pieces: Piece[]): WorkspaceState => ({ ...createSeed(today), pieces, materials: [] });
const ids = (pieces: Piece[]) => pieces.map(item => item.id);

describe('Aramis calendar day', () => {
  it('keeps approved work visible through its day, regardless of the UTC calendar date', () => {
    const approved = piece('approved', { status: 'approved' });
    const state = stateWith(approved);
    const before = new Date('2026-10-01T02:59:59.999Z');
    const after = new Date('2026-10-01T03:00:00.000Z');
    expect(aramisDate(before)).toBe('2026-09-30');
    expect(aramisDate(after)).toBe('2026-10-01');
    expect(ids(pendingWork(state, aramisDate(before)))).toEqual(['approved']);
    expect(ids(pendingWork(state, aramisDate(after)))).toEqual([]);
    expect(ids(historicalWork(state, aramisDate(after)))).toEqual(['approved']);
    expect(approved.status).toBe('approved');
  });

  it('schedules an open tab at the Argentine day boundary, including month/year boundaries', () => {
    expect(millisecondsUntilAramisDayChange(new Date('2026-10-01T02:59:59.000Z'))).toBe(1000);
    expect(millisecondsUntilAramisDayChange(new Date('2027-01-01T02:59:59.999Z'))).toBe(1);
    expect(millisecondsUntilAramisDayChange(new Date('2026-09-30T03:00:00.000Z'))).toBe(86_400_000);
    expect(aramisDate(new Date('2027-01-01T02:00:00.000Z'))).toBe('2026-12-31');
  });
});

describe('current work and historical classification', () => {
  it('shows every unfinished piece by date, then visible approvals with all undated work last in its group', () => {
    const state = stateWith(
      piece('approved-today', { status: 'approved' }),
      piece('undated-future-plan', { plannedDate: null, planMonth: '2027-02' }),
      piece('later', { plannedDate: '2026-12-01' }),
      piece('overdue', { plannedDate: '2026-08-01', status: 'review' }),
      piece('approved-undated', { status: 'approved', plannedDate: null, planMonth: '2026-01' }),
      piece('approved-past', { status: 'approved', plannedDate: '2026-09-29' }),
      piece('scheduled-future', { status: 'scheduled', plannedDate: '2026-11-01' }),
      piece('published', { status: 'published', plannedDate: null }),
      piece('archived', { archived: true }),
    );
    const original = structuredClone(state);
    expect(ids(pendingWork(state, today))).toEqual([
      'overdue', 'later', 'undated-future-plan', 'approved-today', 'scheduled-future', 'approved-undated',
    ]);
    expect(ids(historicalWork(state, today))).toEqual(['approved-past', 'published']);
    expect(ids(archivedWork(state))).toEqual(['archived']);
    expect(state).toEqual(original);
  });

  it('treats legacy scheduled work as approved and published work as historical even with a future date', () => {
    const scheduledPast = piece('scheduled-past', { status: 'scheduled', plannedDate: '2026-09-29' });
    const publishedFuture = piece('published-future', { status: 'published', plannedDate: '2026-12-01' });
    expect(isApprovedPiece(scheduledPast)).toBe(true);
    expect(isHistoricalPiece(scheduledPast, today)).toBe(true);
    expect(isHistoricalPiece(publishedFuture, today)).toBe(true);
    expect(isHistoricalPiece({ ...scheduledPast, archived: true }, today)).toBe(false);
  });

  it('uses Monday–Sunday, retains overdue dates and all undated months, and includes the Sunday boundary', () => {
    const state = stateWith(
      piece('old', { plannedDate: '2025-01-01' }),
      piece('sunday', { plannedDate: '2026-10-04' }),
      piece('next-monday', { plannedDate: '2026-10-05' }),
      piece('undated-next-year', { plannedDate: null, planMonth: '2027-01' }),
      piece('approved-sunday', { status: 'approved', plannedDate: '2026-10-04' }),
      piece('approved-monday', { status: 'approved', plannedDate: '2026-10-05' }),
    );
    expect(ids(pendingWork(state, today, 'week'))).toEqual(['old', 'sunday', 'undated-next-year', 'approved-sunday']);
    expect(ids(pendingWork(state, '2026-10-04', 'week'))).toEqual(['old', 'sunday', 'undated-next-year', 'approved-sunday']);
    expect(ids(pendingWork(state, '2026-10-05', 'week'))).toEqual(['old', 'sunday', 'next-monday', 'undated-next-year', 'approved-monday']);
  });

  it('uses title then ID to break matching dates deterministically', () => {
    const pieces = [piece('z', { title: 'A' }), piece('b', { title: 'B' }), piece('a', { title: 'A' })];
    expect(ids(pieces.sort(comparePieceDate))).toEqual(['a', 'z', 'b']);
  });

  it('returns a historical approval to the lower group when its date moves to the future', () => {
    const state = createSeed(today);
    const target = state.pieces.find(item => item.id === 'piece-oliva-approved')!;
    target.plannedDate = '2026-09-29';
    expect(ids(pendingWork(state, today))).not.toContain(target.id);
    const changed = applyCommand(state, {
      type: 'update-piece', pieceId: target.id, expectedRevision: target.revision, patch: { plannedDate: '2026-10-15' },
    }, { actor: 'member-lucia', now: '2026-09-30T12:00:00.000Z', newId: () => 'activity-new', token: () => 'unused' }).state;
    expect(ids(pendingWork(changed, today))).toContain(target.id);
    expect(isApprovedPiece(changed.pieces.find(item => item.id === target.id)!)).toBe(true);
    expect(changed.reviews.find(item => item.id === 'review-oliva-approved')?.status).toBe('approved');
  });

  it('returns changed work above approvals even when its original planned date has passed', () => {
    const state = createSeed(today);
    const target = state.pieces.find(item => item.id === 'piece-oliva-approved')!;
    target.plannedDate = '2026-09-29';
    const changed = applyCommand(state, {
      type: 'update-piece', pieceId: target.id, expectedRevision: target.revision, patch: { status: 'production', workArea: 'design' },
    }, { actor: 'member-lucia', now: '2026-09-30T12:00:00.000Z', newId: () => 'activity-new', token: () => 'unused' }).state;
    const returned = changed.pieces.find(item => item.id === target.id)!;
    expect(isHistoricalPiece(returned, today)).toBe(false);
    expect(pendingWork(changed, today)[0].id).toBe(target.id);
    expect(needsAttention(changed, returned, today)).toBe(true);
  });

  it('classifies a recovered archive in Planning with its old date and assets preserved', () => {
    const archived = piece('archived', { status: 'approved', archived: true, plannedDate: '2026-09-01', teamAssets: [
      { id: 'asset', name: 'material.mov', mimeType: 'video/quicktime', size: 100, source: 'drive' },
    ] });
    const state = stateWith(archived);
    expect(ids(archivedWork(state))).toEqual(['archived']);
    expect(ids(pendingWork(state, today))).toEqual([]);
    const recovered = { ...archived, archived: false, status: 'planned' as const };
    const restoredState = stateWith(recovered);
    expect(ids(archivedWork(restoredState))).toEqual([]);
    expect(ids(historicalWork(restoredState, today))).toEqual([]);
    expect(ids(pendingWork(restoredState, today))).toEqual(['archived']);
    expect(recovered.teamAssets).toEqual(archived.teamAssets);
  });
});

describe('attention and Design readiness', () => {
  it('flags overdue work and material awaiting verification without bringing finished work back', () => {
    const work = piece('work', { status: 'production', workArea: 'design' });
    const state = stateWith(work);
    state.materials = [{ id: 'material', pieceId: work.id, instructions: '', dueDate: '2026-10-15', status: 'received', assets: [], createdAt: '2026-09-30T12:00:00.000Z', sentAt: null }];
    expect(needsAttention(state, work, today)).toBe(true);
    for (const status of ['approved', 'scheduled', 'published'] as const) expect(needsAttention(state, { ...work, status }, today)).toBe(false);
    expect(needsAttention(state, { ...work, archived: true }, today)).toBe(false);
    state.materials[0].status = 'pending';
    expect(needsAttention(state, work, today)).toBe(false);
    state.materials[0].dueDate = '2026-09-29';
    expect(needsAttention(state, work, today)).toBe(true);
    state.materials[0].status = 'complete';
    expect(needsAttention(state, work, today)).toBe(false);
    expect(needsAttention(state, { ...work, plannedDate: '2026-09-29' }, today)).toBe(true);
  });

  it('keeps recording, Marketing and incomplete material out of actionable Design while treating old editing as ready', () => {
    const work = piece('work', { status: 'production', workArea: 'design', productionStage: 'editing' });
    const state = stateWith(work);
    expect(productionWaitReason(state, work)).toBe(null);
    expect(productionWaitReason(state, { ...work, productionStage: 'recording' })).toBe('Planificación · Marketing');
    expect(productionWaitReason(state, { ...work, workArea: 'marketing' })).toBe('Pendiente de Marketing');
    state.materials = [{ id: 'material', pieceId: work.id, instructions: '', dueDate: null, status: 'pending', assets: [], createdAt: '2026-09-30T12:00:00.000Z', sentAt: null }];
    expect(productionWaitReason(state, work)).toBe('Esperando material del cliente');
    state.materials[0].status = 'received';
    expect(productionWaitReason(state, work)).toBe('Material pendiente de verificar');
    state.materials[0].status = 'complete';
    expect(productionWaitReason(state, work)).toBe(null);
    expect(productionWaitReason(state, { ...work, workArea: undefined, productionStage: undefined })).toBe(null);
  });
});
