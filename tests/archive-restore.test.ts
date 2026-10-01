import { describe, expect, it } from 'vitest';
import type { Command, CommandContext } from '../contracts/domain';
import { applyCommand } from '../src/domain/engine';
import { createSeed } from '../src/domain/seed';
import { getClientView } from '../src/domain/selectors';

const now = '2026-09-30T16:00:00.000Z';
const context = (actor = 'member-lucia'): CommandContext => ({ actor, now, newId: () => crypto.randomUUID(), token: () => crypto.randomUUID() });
const recover = (pieceId: string, expectedRevision: number): Command => ({ type: 'restore-piece', pieceId, expectedRevision });

describe('recover archived work in the local domain', () => {
  it('preserves material, exact delivery decisions and content while restoring private planning', () => {
    const input = createSeed('2026-09-30');
    const target = input.pieces.find(p => p.id === 'piece-oliva-review')!;
    target.status = 'approved';
    input.reviews.find(r => r.pieceId === target.id)!.status = 'approved';
    target.deliveries = [{ id: 'delivery-one', version: 1, caption: target.caption, assets: input.reviews[0].assets, status: 'approved', createdAt: now, createdBy: 'Eliana', comment: 'Aprobado antes', source: 'team', decidedBy: 'Miguel', decidedAt: now }];
    target.teamAssets = structuredClone(input.reviews[0].assets);
    target.script = 'Guion conservado';
    const archived = applyCommand(input, { type: 'update-piece', pieceId: target.id, expectedRevision: target.revision, patch: { archived: true } }, context()).state;
    const prior = structuredClone(archived.pieces.find(p => p.id === target.id)!);
    const result = applyCommand(archived, recover(target.id, prior.revision), context());
    const restored = result.state.pieces.find(p => p.id === target.id)!;
    expect(restored).toMatchObject({ archived: false, status: 'planned', workArea: 'marketing', productionStage: 'ready', visibleToClient: false, revision: prior.revision + 1, script: prior.script, caption: prior.caption, internalNote: prior.internalNote, teamAssets: prior.teamAssets });
    expect(restored.deliveries![0]).toEqual({ ...prior.deliveries![0], invalidatedAt: now });
    expect(result.state.reviews.find(r => r.pieceId === target.id)?.status).toBe('superseded');
    expect(result.state.shares.find(s => s.token === 'demo-review')?.revokedAt).toBe(now);
    expect(() => getClientView(result.state, 'demo-review')).toThrow();
    expect(getClientView(result.state, 'demo-calendar').pieces.some(p => p.id === target.id)).toBe(false);
    expect(result.state.activities.at(-1)).toMatchObject({ text: 'Contenido recuperado a planificación.', visibility: 'internal' });
    expect(archived.pieces.find(p => p.id === target.id)).toEqual(prior);
  });

  it('recovers an archived published piece without reusing its old approval', () => {
    const input = createSeed('2026-09-30');
    const target = input.pieces.find(p => p.status === 'published')!;
    target.archived = true;
    const state = applyCommand(input, recover(target.id, target.revision), context()).state;
    expect(state.pieces.find(p => p.id === target.id)?.status).toBe('planned');
    expect(state.reviews.find(r => r.pieceId === target.id)?.status).toBe('superseded');
    expect(() => applyCommand(state, { type: 'update-piece', pieceId: target.id, expectedRevision: target.revision + 1, patch: { status: 'scheduled' } }, context())).toThrowError(expect.objectContaining({ code: 'APPROVAL_REQUIRED' }));
  });

  it('rejects stale, active, unknown and foreign-actor recovery without mutating input', () => {
    const state = createSeed('2026-09-30');
    const target = state.pieces[0]; target.archived = true;
    const copy = structuredClone(state);
    expect(() => applyCommand(state, recover(target.id, target.revision - 1), context())).toThrowError(expect.objectContaining({ code: 'CONFLICT' }));
    expect(() => applyCommand(state, recover('missing', 1), context())).toThrowError(expect.objectContaining({ code: 'NOT_FOUND' }));
    expect(() => applyCommand(state, recover(target.id, target.revision), context('outsider'))).toThrowError(expect.objectContaining({ code: 'FORBIDDEN' }));
    expect(() => applyCommand(state, recover(target.id, -1), context())).toThrowError(expect.objectContaining({ code: 'VALIDATION' }));
    const restored = applyCommand(state, recover(target.id, target.revision), context()).state;
    expect(() => applyCommand(restored, recover(target.id, target.revision), context())).toThrowError(expect.objectContaining({ code: 'CONFLICT' }));
    expect(() => applyCommand(restored, recover(target.id, target.revision + 1), context())).toThrowError(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
    expect(state).toEqual(copy);
  });
});
