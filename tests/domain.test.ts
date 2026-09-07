import { describe, expect, it } from 'vitest';
import type { Asset, Command, CommandContext, WorkspaceState } from '../contracts/domain';
import { applyCommand, DomainError } from '../src/domain/engine';
import { createSeed } from '../src/domain/seed';
import { activeMaterial, addDays, assertPublicCommandAccess, currentReview, getClientView, piecePriority, weekRange } from '../src/domain/selectors';

const today = '2026-09-06';
const asset: Asset = { id: 'new-file', name: 'Demo.svg', mimeType: 'image/svg+xml', size: 500, url: '/demo/cover-oliva.svg', source: 'demo' };
function context(): CommandContext {
  let sequence = 0;
  return { actor: 'member-lucia', now: '2026-09-06T16:00:00.000Z', newId: () => `generated-${++sequence}`, token: () => `secret-${++sequence}` };
}
const respond = (patch: Partial<Extract<Command, { type: 'respond-review' }>> = {}): Extract<Command, { type: 'respond-review' }> => ({ type: 'respond-review', reviewId: 'review-oliva-1', version: 1, kind: 'approved', comment: '', authorName: 'Cliente de prueba', source: 'link', idempotencyKey: 'response-1', ...patch });
function errorCode(fn: () => unknown, code: string) {
  try { fn(); throw new Error('Expected DomainError'); } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
  }
}
const piece = (state: WorkspaceState, id = 'piece-oliva-review') => state.pieces.find(item => item.id === id)!;

describe('fixtures and dates', () => {
  it('creates only synthetic clients, local relative dates, and explicit demo links', () => {
    const state = createSeed(today);
    expect(state.clients).toHaveLength(3);
    expect(state.pieces).toHaveLength(7);
    expect(state.shares.map(share => share.token)).toEqual(['demo-calendar', 'demo-review', 'demo-material']);
    expect(piece(state).plannedDate).toBe('2026-09-08');
    expect(state.clients.every(client => client.phone === '')).toBe(true);
  });
  it('handles week and month boundaries without timezone shifts', () => {
    expect(weekRange(today)).toEqual({ start: '2026-08-31', end: '2026-09-06' });
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    errorCode(() => addDays('2026-02-30', 1), 'VALIDATION');
  });
  it('keeps overdue material ahead of ordinary upcoming work', () => {
    const state = createSeed(today);
    expect(piecePriority(state, piece(state, 'piece-oliva-material'), today)).toBeLessThan(piecePriority(state, piece(state, 'piece-norte-production'), today));
    expect(activeMaterial(state, 'piece-oliva-material')?.id).toBe('material-oliva-1');
  });
});

describe('piece changes and concurrency', () => {
  it('creates a minimally specified piece with a valid internal owner', () => {
    const state = createSeed(today);
    const result = applyCommand(state, { type: 'create-piece', input: { clientId: 'client-oliva', title: ' Una idea ', ownerId: 'member-lucia' } }, context());
    expect(piece(result.state, result.entityId)).toMatchObject({ title: 'Una idea', status: 'planned', visibleToClient: false, plannedDate: null, revision: 1 });
    expect(state.pieces).toHaveLength(7);
  });
  it('rejects invalid owners, empty titles, and impossible dates', () => {
    const state = createSeed(today);
    errorCode(() => applyCommand(state, { type: 'create-piece', input: { clientId: 'client-oliva', title: 'Algo', ownerId: 'outsider' } }, context()), 'VALIDATION');
    errorCode(() => applyCommand(state, { type: 'update-piece', pieceId: piece(state).id, expectedRevision: 1, patch: { title: '  ' } }, context()), 'VALIDATION');
    errorCode(() => applyCommand(state, { type: 'update-piece', pieceId: piece(state).id, expectedRevision: 1, patch: { plannedDate: '2026-02-30' } }, context()), 'VALIDATION');
  });
  it('does not overwrite a concurrent update or mutate its input', () => {
    const state = createSeed(today);
    const original = structuredClone(state);
    const updated = applyCommand(state, { type: 'update-piece', pieceId: piece(state).id, expectedRevision: 1, patch: { title: 'Título nuevo' } }, context()).state;
    expect(state).toEqual(original);
    expect(piece(updated).revision).toBe(2);
    errorCode(() => applyCommand(updated, { type: 'update-piece', pieceId: piece(state).id, expectedRevision: 1, patch: { title: 'Cambio que llegó tarde' } }, context()), 'CONFLICT');
    expect(piece(updated).title).toBe('Título nuevo');
  });
  it('ignores undefined patch values and forbids updating identity fields', () => {
    const state = createSeed(today);
    const updated = applyCommand(state, { type: 'update-piece', pieceId: piece(state).id, expectedRevision: 1, patch: { title: undefined, caption: undefined } }, context()).state;
    expect(piece(updated).title).toBe(piece(state).title);
    expect(piece(updated).caption).toBe(piece(state).caption);
    errorCode(() => applyCommand(state, { type: 'update-piece', pieceId: piece(state).id, expectedRevision: 1, patch: { clientId: 'client-norte' } } as unknown as Command, context()), 'VALIDATION');
  });
  it('prevents assigning review or approval directly, or publishing unapproved work', () => {
    const state = createSeed(today);
    const targetId = 'piece-norte-production';
    for (const status of ['review', 'approved'] as const) errorCode(() => applyCommand(state, { type: 'update-piece', pieceId: targetId, expectedRevision: 1, patch: { status } }, context()), 'INVALID_TRANSITION');
    for (const status of ['scheduled', 'published'] as const) errorCode(() => applyCommand(state, { type: 'update-piece', pieceId: targetId, expectedRevision: 1, patch: { status } }, context()), 'APPROVAL_REQUIRED');
  });
  it('allows scheduling approved content but rejects caption changes in the same scheduling command', () => {
    const state = createSeed(today);
    const id = 'piece-oliva-approved';
    expect(piece(applyCommand(state, { type: 'update-piece', pieceId: id, expectedRevision: 1, patch: { status: 'scheduled' } }, context()).state, id).status).toBe('scheduled');
    errorCode(() => applyCommand(state, { type: 'update-piece', pieceId: id, expectedRevision: 1, patch: { status: 'scheduled', caption: 'Sin aprobar' } }, context()), 'APPROVAL_REQUIRED');
  });
  it('preserves publication and its approval while allowing metadata edits and archiving', () => {
    const state = createSeed(today);
    const id = 'piece-bruma-published';
    errorCode(() => applyCommand(state, { type: 'update-piece', pieceId: id, expectedRevision: 1, patch: { caption: 'Texto posterior' } }, context()), 'PUBLISHED_IMMUTABLE');
    for (const status of ['planned', 'production', 'review', 'approved', 'scheduled'] as const) errorCode(() => applyCommand(state, { type: 'update-piece', pieceId: id, expectedRevision: 1, patch: { status } }, context()), 'PUBLISHED_IMMUTABLE');
    errorCode(() => applyCommand(state, { type: 'create-review', pieceId: id, expectedRevision: piece(state, id).revision, caption: 'Nueva versión', assets: [asset] }, context()), 'PUBLISHED_IMMUTABLE');
    const result = applyCommand(state, { type: 'update-piece', pieceId: id, expectedRevision: 1, patch: { title: 'Título corregido', internalNote: 'Nota nueva', plannedDate: '2026-09-03', ownerId: 'member-mateo', archived: true } }, context()).state;
    expect(piece(result, id)).toMatchObject({ title: 'Título corregido', archived: true, status: 'published', ownerId: 'member-mateo' });
    expect(result.reviews.find(review => review.id === 'review-bruma-1')?.status).toBe('approved');
  });
});

describe('versioned reviews', () => {
  it('approves the exact pending version without changing the original input', () => {
    const state = createSeed(today);
    const original = structuredClone(state);
    const result = applyCommand(state, respond(), context());
    expect(piece(result.state).status).toBe('approved');
    expect(currentReview(result.state, piece(state).id)?.status).toBe('approved');
    expect(result.state.responses.at(-1)?.reviewId).toBe('review-oliva-1');
    expect(state).toEqual(original);
  });
  it('rejects a stale version number', () => {
    errorCode(() => applyCommand(createSeed(today), respond({ version: 2 }), context()), 'STALE_REVIEW');
  });
  it('deduplicates a retry even after approval and rejects reuse for different data', () => {
    const ctx = context();
    const first = applyCommand(createSeed(today), respond(), ctx);
    const retry = applyCommand(first.state, respond(), ctx);
    expect(retry.entityId).toBe(first.entityId);
    expect(retry.state).toEqual(first.state);
    errorCode(() => applyCommand(first.state, respond({ comment: 'Otro texto' }), ctx), 'IDEMPOTENCY_CONFLICT');
    errorCode(() => applyCommand(first.state, respond({ kind: 'changes', comment: 'Cambiar' }), ctx), 'IDEMPOTENCY_CONFLICT');
    errorCode(() => applyCommand(first.state, respond({ version: 3 }), ctx), 'IDEMPOTENCY_CONFLICT');
  });
  it('comments without deciding, but changes return the piece to production', () => {
    const ctx = context();
    const commented = applyCommand(createSeed(today), respond({ kind: 'comment', comment: '¿Podemos ver otra portada?' }), ctx).state;
    expect(piece(commented).status).toBe('review');
    expect(currentReview(commented, piece(commented).id)?.status).toBe('pending');
    const changed = applyCommand(commented, respond({ kind: 'changes', comment: 'Usar otra portada.', idempotencyKey: 'changes-2' }), ctx).state;
    expect(piece(changed).status).toBe('production');
    expect(currentReview(changed, piece(changed).id)?.status).toBe('changes');
  });
  it('requires comments for changes and for comment-only responses', () => {
    for (const kind of ['changes', 'comment'] as const) errorCode(() => applyCommand(createSeed(today), respond({ kind, comment: '  ' }), context()), 'VALIDATION');
  });
  it('records WhatsApp answers with the internal recorder', () => {
    const result = applyCommand(createSeed(today), respond({ source: 'whatsapp' }), context()).state;
    expect(result.responses.at(-1)?.recordedBy).toBe('member-lucia');
    expect(getClientView(result, 'demo-review').responses.at(-1)?.recordedBy).toBeNull();
  });
  it('creates detached snapshots and supersedes older approvals', () => {
    const ctx = context();
    const approved = applyCommand(createSeed(today), respond(), ctx).state;
    const incoming = structuredClone(asset);
    const revised = applyCommand(approved, { type: 'create-review', pieceId: piece(approved).id, expectedRevision: piece(approved).revision, caption: 'Versión dos', assets: [incoming] }, ctx).state;
    incoming.name = 'Mutación posterior';
    expect(currentReview(revised, piece(revised).id)).toMatchObject({ version: 2, caption: 'Versión dos', status: 'pending' });
    expect(currentReview(revised, piece(revised).id)?.assets[0].name).toBe('Demo.svg');
    expect(revised.reviews.find(review => review.id === 'review-oliva-1')?.status).toBe('superseded');
    expect(approved.reviews.find(review => review.id === 'review-oliva-1')?.status).toBe('approved');
    errorCode(() => applyCommand(revised, respond({ idempotencyKey: 'late-response' }), ctx), 'STALE_REVIEW');
    errorCode(() => getClientView(revised, 'demo-review'), 'STALE_REVIEW');
  });
  it('rejects a stale review draft without invalidating a newer approval', () => {
    const ctx = context();
    const original = createSeed(today);
    const staleDraft: Command = { type: 'create-review', pieceId: piece(original).id, expectedRevision: piece(original).revision, caption: 'Texto del formulario viejo', assets: [asset] };
    const second = applyCommand(original, { ...staleDraft, caption: 'Texto actualizado de la segunda versión' }, ctx);
    const approved = applyCommand(second.state, respond({ reviewId: second.entityId, version: 2 }), ctx).state;
    const snapshot = structuredClone(approved);

    errorCode(() => applyCommand(approved, staleDraft, ctx), 'CONFLICT');

    expect(approved).toEqual(snapshot);
    expect(piece(approved)).toMatchObject({ status: 'approved', caption: 'Texto actualizado de la segunda versión' });
    expect(currentReview(approved, piece(approved).id)).toMatchObject({ id: second.entityId, version: 2, status: 'approved' });
    expect(approved.reviews.filter(review => review.pieceId === piece(approved).id)).toHaveLength(2);
  });
  it('requires the piece revision captured before editing a review', () => {
    const ctx = context();
    const original = createSeed(today);
    const staleDraft: Command = { type: 'create-review', pieceId: piece(original).id, expectedRevision: piece(original).revision, caption: 'Texto viejo', assets: [asset] };
    const edited = applyCommand(original, { type: 'update-piece', pieceId: piece(original).id, expectedRevision: piece(original).revision, patch: { caption: 'Borrador nuevo del equipo' } }, ctx).state;
    const snapshot = structuredClone(edited);

    errorCode(() => applyCommand(edited, staleDraft, ctx), 'CONFLICT');
    const { expectedRevision: _revision, ...missingRevision } = staleDraft;
    errorCode(() => applyCommand(edited, missingRevision as Command, ctx), 'CONFLICT');
    expect(edited).toEqual(snapshot);

    const refreshed = applyCommand(edited, { ...staleDraft, expectedRevision: piece(edited).revision, caption: piece(edited).caption }, ctx).state;
    expect(currentReview(refreshed, piece(edited).id)).toMatchObject({ version: 2, caption: 'Borrador nuevo del equipo', status: 'pending' });
  });
  it('invalidates pending and approved versions when copy changes, preserving the old snapshot', () => {
    for (const approved of [false, true]) {
      const ctx = context();
      const state = approved ? applyCommand(createSeed(today), respond(), ctx).state : createSeed(today);
      const priorCaption = currentReview(state, piece(state).id)?.caption;
      const result = applyCommand(state, { type: 'update-piece', pieceId: piece(state).id, expectedRevision: piece(state).revision, patch: { caption: 'Texto nuevo', status: approved ? 'approved' : 'review' } }, ctx).state;
      expect(piece(result).status).toBe('production');
      expect(result.reviews.find(review => review.id === 'review-oliva-1')).toMatchObject({ caption: priorCaption, status: 'superseded' });
      expect(currentReview(result, piece(state).id)).toBeUndefined();
      errorCode(() => applyCommand(result, respond({ idempotencyKey: 'stale-new' }), ctx), 'STALE_REVIEW');
    }
  });
  it('removing an approval through an internal state change prevents later scheduling', () => {
    const state = createSeed(today);
    const id = 'piece-oliva-approved';
    const result = applyCommand(state, { type: 'update-piece', pieceId: id, expectedRevision: 1, patch: { status: 'production' } }, context()).state;
    errorCode(() => applyCommand(result, { type: 'update-piece', pieceId: id, expectedRevision: 2, patch: { status: 'scheduled' } }, context()), 'APPROVAL_REQUIRED');
  });
});

describe('material and manual communication', () => {
  it('receiving files does not complete a request and duplicate delivery is a no-op', () => {
    const ctx = context();
    const command: Command = { type: 'receive-material', requestId: 'material-oliva-1', assets: [asset] };
    const result = applyCommand(createSeed(today), command, ctx).state;
    expect(result.materials[0].status).toBe('received');
    expect(result.materials[0].assets).toHaveLength(1);
    expect(applyCommand(result, command, ctx).state).toEqual(result);
    const reorderedAsset = Object.fromEntries(Object.entries(asset).reverse()) as unknown as Asset;
    expect(applyCommand(result, { ...command, assets: [reorderedAsset] }, ctx).state).toEqual(result);
    errorCode(() => applyCommand(result, { ...command, assets: [{ ...asset, size: 999 }] }, ctx), 'ASSET_CONFLICT');
  });
  it('requires received material to complete and supports explicitly reopening', () => {
    const ctx = context();
    const state = createSeed(today);
    errorCode(() => applyCommand(state, { type: 'complete-material', requestId: 'material-oliva-1' }, ctx), 'MATERIAL_REQUIRED');
    const received = applyCommand(state, { type: 'receive-material', requestId: 'material-oliva-1', assets: [asset] }, ctx).state;
    const complete = applyCommand(received, { type: 'complete-material', requestId: 'material-oliva-1' }, ctx).state;
    expect(complete.materials[0].status).toBe('complete');
    errorCode(() => applyCommand(complete, { type: 'receive-material', requestId: 'material-oliva-1', assets: [asset] }, ctx), 'REQUEST_COMPLETE');
    const reopened = applyCommand(complete, { type: 'reopen-material', requestId: 'material-oliva-1' }, ctx).state;
    expect(reopened.materials[0].status).toBe('pending');
    expect(reopened.materials[0].assets).toHaveLength(1);
  });
  it('rejects duplicate open material requests', () => {
    errorCode(() => applyCommand(createSeed(today), { type: 'create-material', pieceId: 'piece-oliva-material', instructions: 'Otro pedido', dueDate: null }, context()), 'ACTIVE_REQUEST');
  });
  it('creating a share never marks a request as sent', () => {
    const state = createSeed(today);
    state.reviews[0].sentAt = null;
    const shared = applyCommand(state, { type: 'create-share', scope: 'review', targetId: 'review-oliva-1' }, context()).state;
    expect(shared.reviews[0].sentAt).toBeNull();
    expect(applyCommand(shared, { type: 'mark-sent', scope: 'review', targetId: 'review-oliva-1' }, context()).state.reviews[0].sentAt).toBe('2026-09-06T16:00:00.000Z');
  });
  it('accepts an answer before the team records sending', () => {
    const state = createSeed(today);
    state.reviews[0].sentAt = null;
    expect(piece(applyCommand(state, respond(), context()).state).status).toBe('approved');
  });
});

describe('public scope and privacy', () => {
  it('projects only visible content for one client and removes internal fields', () => {
    const state = createSeed(today);
    state.pieces.push({ ...piece(state), id: 'hidden-oliva', visibleToClient: false, internalNote: 'SECRET-HIDDEN' });
    const view = getClientView(state, 'demo-calendar');
    expect(view.pieces).toHaveLength(3);
    expect(view.pieces.every(item => item.clientId === 'client-oliva')).toBe(true);
    const serialized = JSON.stringify(view);
    for (const forbidden of ['internalNote', 'ownerId', 'members', 'shares', 'phone', 'contactName', 'SECRET-HIDDEN', 'Nota privada', 'member-lucia', 'Lucía']) expect(serialized).not.toContain(forbidden);
    expect(view.activities.every(item => item.visibility === 'client')).toBe(true);
    view.pieces[0].title = 'Cambio en proyección';
    expect(state.pieces[0].title).not.toBe('Cambio en proyección');
  });
  it('never exposes drafts that have not been prepared for review', () => {
    const state = createSeed(today);
    state.pieces[0].caption = 'BORRADOR-INTERNO';
    expect(JSON.stringify(getClientView(state, 'demo-calendar'))).not.toContain('BORRADOR-INTERNO');
  });
  it('request links reveal just the authorized request and no neighboring requests', () => {
    const state = createSeed(today);
    const reviewView = getClientView(state, 'demo-review');
    expect(reviewView.pieces).toHaveLength(1);
    expect(reviewView.reviews.map(review => review.id)).toEqual(['review-oliva-1']);
    expect(reviewView.materials).toEqual([]);
    expect(reviewView.activities).toEqual([]);
    const materialView = getClientView(state, 'demo-material');
    expect(materialView.pieces).toHaveLength(1);
    expect(materialView.reviews).toEqual([]);
    expect(materialView.materials.map(material => material.id)).toEqual(['material-oliva-1']);
  });
  it('explicit request links can resolve a request hidden from the read-only calendar', () => {
    const state = createSeed(today);
    piece(state).visibleToClient = false;
    expect(getClientView(state, 'demo-review').reviews).toHaveLength(1);
    expect(getClientView(state, 'demo-calendar').pieces.some(item => item.id === piece(state).id)).toBe(false);
  });
  it('rejects unknown, revoked, mismatched, and archived links', () => {
    const state = createSeed(today);
    errorCode(() => getClientView(state, 'unknown'), 'INVALID_LINK');
    const revoked = applyCommand(state, { type: 'revoke-share', shareId: 'share-review-oliva' }, context()).state;
    errorCode(() => getClientView(revoked, 'demo-review'), 'INVALID_LINK');
    errorCode(() => assertPublicCommandAccess(revoked, 'demo-review', respond()), 'INVALID_LINK');
    const mismatch = structuredClone(state);
    mismatch.shares[1].clientId = 'client-norte';
    errorCode(() => getClientView(mismatch, 'demo-review'), 'INVALID_LINK');
    const archived = applyCommand(state, { type: 'update-piece', pieceId: piece(state).id, expectedRevision: 1, patch: { archived: true } }, context()).state;
    errorCode(() => getClientView(archived, 'demo-review'), 'INVALID_LINK');
    errorCode(() => applyCommand(archived, respond(), context()), 'ARCHIVED');
    expect(getClientView(archived, 'demo-calendar').pieces.some(item => item.id === piece(state).id)).toBe(false);
  });
  it('rejects writes through a calendar token and wrong-target or wrong-scope actions', () => {
    const state = createSeed(today);
    errorCode(() => assertPublicCommandAccess(state, 'demo-calendar', respond()), 'FORBIDDEN');
    errorCode(() => assertPublicCommandAccess(state, 'demo-review', respond({ reviewId: 'review-norte-1' })), 'FORBIDDEN');
    errorCode(() => assertPublicCommandAccess(state, 'demo-review', respond({ source: 'whatsapp' })), 'FORBIDDEN');
    errorCode(() => assertPublicCommandAccess(state, 'demo-material', { type: 'complete-material', requestId: 'material-oliva-1' }), 'FORBIDDEN');
    errorCode(() => assertPublicCommandAccess(state, 'demo-review', { type: 'create-share', scope: 'calendar', targetId: 'client-oliva' }), 'FORBIDDEN');
    expect(() => assertPublicCommandAccess(state, 'demo-review', respond())).not.toThrow();
    expect(() => assertPublicCommandAccess(state, 'demo-material', { type: 'receive-material', requestId: 'material-oliva-1', assets: [asset] })).not.toThrow();
  });
  it('omits provider IDs, checksums, dangerous URLs and URLs carrying credentials', () => {
    const state = createSeed(today);
    state.reviews[0].assets = [
      { ...asset, id: 'private', driveFileId: 'google-file-secret', checksum: 'hash-secret', url: 'https://files.example.test/a?access_token=secret' },
      { ...asset, id: 'danger', url: 'javascript:alert(1)' },
      { ...asset, id: 'userinfo', url: 'https://name:password@files.example.test/a' },
      { ...asset, id: 'traversal', url: '/demo/../private/file' },
      { ...asset, id: 'ok', url: 'https://public.example.test/photo.jpg' },
    ];
    const publicAssets = getClientView(state, 'demo-review').reviews[0].assets;
    expect(publicAssets.slice(0, 4).every(item => item.url === undefined)).toBe(true);
    expect(publicAssets[4].url).toBe('https://public.example.test/photo.jpg');
    expect(JSON.stringify(publicAssets)).not.toContain('google-file-secret');
    expect(JSON.stringify(publicAssets)).not.toContain('hash-secret');
  });
});
