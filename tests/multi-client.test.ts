import { describe, expect, it } from 'vitest';
import type { Command, WorkspaceState } from '../contracts/domain';
import { belongsToClient, pieceClientIds, pieceClientNames } from '../contracts/piece-clients';
import { applyCommand } from '../src/domain/engine';
import { createSeed } from '../src/domain/seed';
import { getClientView } from '../src/domain/selectors';

let sequence = 0;
const run = (state: WorkspaceState, command: Command) => applyCommand(state, command, {
  actor: 'member-lucia', now: '2026-10-18T15:00:00Z', newId: () => `multi-${++sequence}`, token: () => `multi-token-${++sequence}`,
});
const input = { clientId: 'client-oliva', clientIds: ['client-oliva', 'client-norte'], ownerId: 'member-lucia', title: 'Efeméride compartida', format: 'post' as const, planMonth: '2026-10' };

describe('one internal piece for a fixed client selection', () => {
  it('preserves recipients through editing and persistence, without cloning or adding future clients', () => {
    const state = createSeed('2026-10-18');
    let result = run(state, { type: 'create-piece', input });
    const piece = result.state.pieces.find(piece => piece.id === result.entityId)!;
    expect(result.state.pieces).toHaveLength(state.pieces.length + 1);
    expect(pieceClientIds(piece)).toEqual(input.clientIds);
    expect(belongsToClient(piece, 'client-norte')).toBe(true);
    expect(belongsToClient(piece, 'client-bruma')).toBe(false);
    expect(pieceClientNames(piece, state.clients)).toBe('Casa Oliva, Estudio Norte');
    result = run(result.state, { type: 'update-piece', pieceId: piece.id, expectedRevision: piece.revision, patch: { status: 'production' } });
    expect(result.state.pieces.find(p => p.id === piece.id)).toMatchObject({ clientIds: input.clientIds, status: 'production', workArea: 'design' });
    expect(JSON.parse(JSON.stringify(result.state)).pieces.find((p: {id:string}) => p.id === piece.id).clientIds).toEqual(input.clientIds);
    expect(getClientView(result.state, 'demo-calendar').pieces.some(p => p.id === piece.id)).toBe(false);
    expect(() => run(result.state, { type: 'update-piece', pieceId: piece.id, expectedRevision: result.state.pieces.find(p => p.id === piece.id)!.revision, patch: { visibleToClient: true } })).toThrow(/dentro del equipo/);
  });

  it.each([[], ['client-oliva', 'client-oliva'], ['client-norte', 'client-oliva'], ['client-oliva', 'unknown'], null])('rejects an invalid recipient selection %j atomically', ids => {
    const initial = createSeed();
    expect(() => run(initial, { type: 'create-piece', input: { ...input, clientIds: ids } } as Command)).toThrow();
    expect(initial.pieces).toHaveLength(7);
  });

  it('keeps legacy single-client pieces and monthly quotas independent from shared extras', () => {
    let state = createSeed('2026-10-18');
    state.clients[0].monthlyPlan = { posts: 1, reels: 0 };
    const original = state.pieces[0];
    expect(pieceClientIds(original)).toEqual([original.clientId]);
    state = run(state, { type: 'create-piece', input: { ...input, planMonth: '2027-01' } }).state;
    const before = state.pieces.length;
    state = run(state, { type: 'generate-month', clientId: input.clientId, month: '2027-01', ownerId: input.ownerId }).state;
    expect(state.pieces).toHaveLength(before + 1);
    expect(state.pieces.filter(p => p.planMonth === '2027-01')).toHaveLength(2);
  });
});
