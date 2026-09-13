// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import type { Piece, WorkspaceState } from '../contracts/domain';

interface Envelope { state: WorkspaceState; memberId: string; workspaceId: string; workspaceName: string; entityId: string }
const id = (prefix: number, suffix = 1) => `${prefix}0000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const W = id(1), C = id(2), M = id(3);

describe('shared staff RPCs in PostgreSQL (PGlite, not hosted Supabase)', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    for (const path of ['supabase/tests/bootstrap.sql', 'supabase/migrations/202609060001_initial.sql', 'supabase/tests/fixtures.sql', 'supabase/migrations/202609080001_shared_workspace.sql', 'supabase/migrations/202609120001_client_logo.sql']) await db.exec(await readFile(path, 'utf8'));
  }, 30_000);
  afterAll(async () => { await db?.close(); });
  async function asUser<T>(user: number, sql: string, params: unknown[] = []) {
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${id(0, user)}'`);
    try { return (await db.query<T>(sql, params)).rows; }
    finally { await db.exec('reset role; reset request.jwt.claim.sub;'); }
  }
  async function snapshot(user = 1, workspace = W) {
    return (await asUser<{ value: Envelope }>(user, 'select public.aramis_workspace($1) as value', [workspace]))[0].value;
  }
  async function command(command: unknown, requestId: string = randomUUID(), user = 1, workspace = W) {
    return (await asUser<{ value: Envelope }>(user, 'select public.aramis_command($1,$2::jsonb,$3) as value', [workspace, JSON.stringify(command), requestId]))[0].value;
  }
  const createClient = (posts = 2, reels = 1) => command({ type: 'create-client', input: { name: ' Nuevo Cliente ', contactName: ' Contacto ', phone: ' 123 ', monthlyPlan: { posts, reels } } });
  const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6pAAAAABJRU5ErkJggg==';
  it('saves client logos transactionally, preserves them on partial updates and removes them explicitly', async () => {
    const created = await createClient();
    const clientId = created.entityId;
    const requestId = randomUUID();
    const patch = { type: 'update-client', clientId, expectedRevision: 0, patch: { logo } };
    const saved = await command(patch, requestId);
    expect(saved.state.clients.find(client => client.id === clientId)).toMatchObject({ logo, revision: 1 });
    expect((await command(patch, requestId)).state.clients.find(client => client.id === clientId)?.revision).toBe(1);
    await expect(command({ ...patch, patch: { logo: null } })).rejects.toThrow('CONFLICT');
    const renamed = await command({ type: 'update-client', clientId, expectedRevision: 1, patch: { name: 'Logo conservado' } });
    expect(renamed.state.clients.find(client => client.id === clientId)?.logo).toBe(logo);
    const removed = await command({ type: 'update-client', clientId, expectedRevision: 2, patch: { logo: null } });
    expect(removed.state.clients.find(client => client.id === clientId)?.logo).toBeNull();
  });
  it('rejects external URLs, SVG, invalid types and oversized logos without changing the client', async () => {
    const created = await createClient();
    for (const invalid of ['https://example.com/logo.png', 'data:image/svg+xml;base64,AAAA', 42, 'data:image/png;base64,iVBORw0KGgo' + 'A'.repeat(48000)]) {
      await expect(command({ type: 'update-client', clientId: created.entityId, expectedRevision: 0, patch: { logo: invalid } })).rejects.toThrow('VALIDATION');
    }
    expect((await snapshot()).state.clients.find(client => client.id === created.entityId)).toMatchObject({ revision: 0, logo: null });
  });
  const createPiece = (clientId = C, input: Record<string, unknown> = {}) => command({ type: 'create-piece', input: { clientId, ...input } });
  const updatePiece = (piece: Piece, patch: Record<string, unknown>, requestId?: string) => command({ type: 'update-piece', pieceId: piece.id, expectedRevision: piece.revision, patch }, requestId);
  function entityPiece(result: Envelope) { return result.state.pieces.find(p => p.id === result.entityId)!; }
  async function seedReview(piece: Piece, status = 'approved', version = 1, caption = piece.caption, sealed = true) {
    const reviewId = randomUUID();
    await db.query('insert into public.reviews(id,workspace_id,client_id,piece_id,version,caption,status,sealed_at) values($1,$2,$3,$4,$5,$6,$7,$8)', [reviewId, W, piece.clientId, piece.id, version, caption, status, sealed ? '2026-09-08T12:00:00Z' : null]);
    return reviewId;
  }

  it('projects private staff state, archived pieces and no raw hashes/provider URLs', async () => {
    const result = await snapshot();
    expect(result).toMatchObject({ workspaceId: W, workspaceName: 'Agencia A', memberId: M, state: { schemaVersion: 1, shares: [] } });
    expect(result.state.pieces).toHaveLength(4);
    expect(result.state.pieces.some(p => p.archived)).toBe(true);
    expect(result.state.pieces.find(p => p.id === id(4))).toMatchObject({ caption: 'BORRADOR PRIVADO sin aprobar', internalNote: 'Privado del equipo', script: '', teamAssets: [] });
    expect(result.state.members).toHaveLength(1);
    expect(result.state.clients.map(c => c.id)).not.toContain(id(2, 3));
    expect(JSON.stringify(result)).not.toMatch(/token_hash|mock-drive-id|user_id|workspace_id/);
  });

  it.each([2, 3, 4, 5, 99])('rejects customer/other tenant/inactive/unknown identity %s before reading or mutating', async user => {
    await expect(snapshot(user)).rejects.toMatchObject({ code: '42501' });
    await expect(command({ type: 'create-client', input: { name: 'Unauthorized', contactName: '', phone: '', monthlyPlan: { posts: 0, reels: 0 } } }, randomUUID(), user)).rejects.toMatchObject({ code: '42501' });
  });

  it('requires actual authenticated identity; anon cannot invoke public RPCs', async () => {
    await db.exec('set role anon;');
    try {
      await expect(db.query('select public.aramis_workspace($1)', [W])).rejects.toMatchObject({ code: '42501' });
      await expect(db.query('select public.aramis_command($1,$2,$3)', [W, '{}', randomUUID()])).rejects.toMatchObject({ code: '42501' });
    } finally { await db.exec('reset role;'); }
    await db.exec('set role authenticated; reset request.jwt.claim.sub;');
    try { await expect(db.query('select public.aramis_workspace($1)', [W])).rejects.toMatchObject({ code: '42501' }); }
    finally { await db.exec('reset role;'); }
  });

  it('fixes search_path for both entry points and serializes workspace commands before membership recheck', async () => {
    const rows = (await db.query<{ proname: string; prosecdef: boolean; proconfig: string[]; source: string }>(
      "select proname,prosecdef,proconfig,pg_get_functiondef(oid) as source from pg_proc where pronamespace='public'::regnamespace and proname in ('aramis_workspace','aramis_command') order by proname",
    )).rows;
    expect(rows).toHaveLength(2);
    for (const row of rows) { expect(row.prosecdef).toBe(true); expect(row.proconfig).toContain('search_path=""'); }
    const source = rows.find(row => row.proname === 'aramis_command')!.source;
    expect(source.indexOf('public.workspaces where id=p_workspace_id for update')).toBeLessThan(source.indexOf('for share of m'));
    expect(source.indexOf('for share of m')).toBeLessThan(source.indexOf('select * into v_receipt'));
  });

  it('keeps plans and scripts staff-only and denies direct writes, receipts and helper calls', async () => {
    const piece = entityPiece(await createPiece());
    await updatePiece(piece, { visibleToClient: true, script: 'PRIVATE_SCRIPT', internalNote: 'PRIVATE_NOTE' });
    for (const user of [2, 3, 4, 5]) {
      expect(await asUser(user, 'select * from public.client_plans where workspace_id=$1', [W])).toEqual([]);
      expect(await asUser(user, 'select * from public.piece_production where workspace_id=$1', [W])).toEqual([]);
    }
    const customerRows = await asUser(2, 'select * from public.pieces where id=$1', [piece.id]);
    expect(customerRows).toHaveLength(1);
    expect(JSON.stringify(customerRows)).not.toMatch(/PRIVATE_SCRIPT|PRIVATE_NOTE|script|plan_month/);
    await expect(asUser(1, 'update public.client_plans set posts=100')).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(1, 'update public.piece_production set script=$1', ['bypass'])).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(1, 'select * from app_private.command_receipts')).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(1, "select app_private.initials('bypass')")).rejects.toMatchObject({ code: '42501' });
  });

  it('creates and edits plan/client details with revisions and derives display initials', async () => {
    const created = await createClient();
    expect(created.state.clients.find(c => c.id === created.entityId)).toMatchObject({ name: 'Nuevo Cliente', initials: 'NC', contactName: 'Contacto', phone: '123', monthlyPlan: { posts: 2, reels: 1 }, revision: 0, generatedMonths: [] });
    const updated = await command({ type: 'update-client', clientId: created.entityId, expectedRevision: 0, patch: { name: 'El Nombre', monthlyPlan: { posts: 3, reels: 2 } } });
    expect(updated.state.clients.find(c => c.id === created.entityId)).toMatchObject({ name: 'El Nombre', initials: 'EN', revision: 1, monthlyPlan: { posts: 3, reels: 2 } });
    await expect(command({ type: 'update-client', clientId: created.entityId, expectedRevision: 0, patch: { phone: 'stale' } })).rejects.toThrow('CONFLICT');
    expect((await snapshot()).state.clients.find(c => c.id === created.entityId)?.phone).toBe('123');
  });

  it('creates untitled work for the caller and keeps plan month independent of calendar date', async () => {
    const created = await createPiece(C, { format: 'reel', title: '', planMonth: '2026-08', plannedDate: '2026-09-14' });
    const piece = entityPiece(created);
    expect(piece).toMatchObject({ title: 'Reel sin título', ownerId: M, status: 'planned', format: 'reel', planMonth: '2026-08', plannedDate: '2026-09-14', revision: 1, workArea: 'marketing', productionStage: 'ready', visibleToClient: false });
    const updated = await updatePiece(piece, { script: 'Toma 1\nToma 2', caption: 'Copy', internalNote: 'Detalle privado', status: 'production', workArea: 'design', productionStage: 'editing', plannedDate: '2026-09-15' });
    expect(entityPiece(updated)).toMatchObject({ script: 'Toma 1\nToma 2', caption: 'Copy', internalNote: 'Detalle privado', status: 'production', revision: 2, workArea: 'design', productionStage: 'editing', planMonth: '2026-08' });
    expect(updated.state.activities.find(a => a.pieceId === piece.id)?.actor).toBe('Persona de prueba');
  });

  it('generates only missing quantities, counts carousels as posts, and never regenerates archived slots', async () => {
    const client = await createClient(3, 1);
    const extra = entityPiece(await createPiece(client.entityId, { format: 'carousel', planMonth: '2026-10', plannedDate: '2026-10-12', title: 'Keep me' }));
    const generated = await command({ type: 'generate-month', clientId: client.entityId, month: '2026-10', ownerId: M });
    const pieces = generated.state.pieces.filter(p => p.clientId === client.entityId);
    expect(pieces).toHaveLength(4);
    expect(pieces.find(p => p.id === extra.id)).toEqual(extra);
    expect(pieces.filter(p => p.id !== extra.id).map(p => p.title).sort()).toEqual(['Posteo 02', 'Posteo 03', 'Reel 01']);
    expect(pieces.filter(p => p.id !== extra.id).every(p => p.plannedDate === null && p.planMonth === '2026-10')).toBe(true);
    await updatePiece(pieces.find(p => p.id !== extra.id)!, { archived: true });
    await expect(command({ type: 'generate-month', clientId: client.entityId, month: '2026-10', ownerId: M })).rejects.toThrow('MONTH_EXISTS');
    expect((await snapshot()).state.pieces.filter(p => p.clientId === client.entityId)).toHaveLength(4);
  });

  it('empty plans fail without recording a generated month or receipt', async () => {
    const client = await createClient(0, 0);
    const key = randomUUID();
    await expect(command({ type: 'generate-month', clientId: client.entityId, month: '2026-11', ownerId: M }, key)).rejects.toThrow('EMPTY_PLAN');
    expect((await snapshot()).state.clients.find(c => c.id === client.entityId)?.generatedMonths).toEqual([]);
    expect((await db.query('select * from app_private.command_receipts where request_id=$1', [key])).rows).toEqual([]);
  });

  it.each(['create-client', 'update-client', 'generate-month', 'create-piece', 'update-piece'])('retries %s without duplicate mutations/history and returns current state', async type => {
    const client = await createClient();
    const piece = entityPiece(await createPiece(client.entityId));
    const request = {
      'create-client': { type, input: { name: 'Retry', contactName: '', phone: '', monthlyPlan: { posts: 1, reels: 0 } } },
      'update-client': { type, clientId: client.entityId, expectedRevision: 0, patch: { phone: 'changed' } },
      'generate-month': { type, clientId: client.entityId, month: '2027-01', ownerId: M },
      'create-piece': { type, input: { clientId: client.entityId } },
      'update-piece': { type, pieceId: piece.id, expectedRevision: piece.revision, patch: { title: 'Updated' } },
    }[type]!;
    const key = randomUUID();
    const first = await command(request, key);
    expect(await command(request, key)).toEqual(first);
    await expect(command({ type: 'create-piece', input: { clientId: C, title: 'Different payload' } }, key)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    const other = await createClient();
    const replay = await command(request, key);
    expect(replay.entityId).toBe(first.entityId);
    expect(replay.state.clients.some(c => c.id === other.entityId)).toBe(true);
  });

  it('stale competing writes accept one revision and reject the other without partial effects', async () => {
    const piece = entityPiece(await createPiece());
    // PGlite queues one connection. This verifies compare-and-swap contention, not multi-process locks.
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${id(0)}'`);
    let results: PromiseSettledResult<unknown>[];
    try {
      results = await Promise.allSettled(['First', 'Second'].map(title => db.query('select public.aramis_command($1,$2::jsonb,$3)', [W, JSON.stringify({ type: 'update-piece', pieceId: piece.id, expectedRevision: piece.revision, patch: { title, script: title } }), randomUUID()])));
    } finally { await db.exec('reset role; reset request.jwt.claim.sub;'); }
    expect(results!.map(r => r.status)).toEqual(['fulfilled', 'rejected']);
    const state = (await snapshot()).state;
    expect(state.pieces.find(p => p.id === piece.id)).toMatchObject({ title: 'First', script: 'First', revision: piece.revision + 1 });
    expect(state.activities.filter(a => a.pieceId === piece.id)).toHaveLength(2);
  });

  it('rolls back all rows and receipt if a later statement fails', async () => {
    const client = await createClient();
    // Inject a deterministic DB failure after the second piece insertion during generation.
    await db.exec(`create function app_private.test_fail_generation() returns trigger language plpgsql as $$ begin
      if new.client_id='${client.entityId}' and new.title='Posteo 02' then raise exception 'injected_failure'; end if; return new; end $$;
      create trigger test_fail_generation before insert on public.pieces for each row execute function app_private.test_fail_generation();`);
    const key = randomUUID();
    const request = { type: 'generate-month', clientId: client.entityId, month: '2028-01', ownerId: M };
    try { await expect(command(request, key)).rejects.toThrow('injected_failure'); }
    finally { await db.exec('drop trigger test_fail_generation on public.pieces; drop function app_private.test_fail_generation();'); }
    const state = (await snapshot()).state;
    expect(state.pieces.filter(p => p.clientId === client.entityId)).toEqual([]);
    expect(state.clients.find(c => c.id === client.entityId)?.generatedMonths).toEqual([]);
    expect((await db.query('select * from app_private.command_receipts where request_id=$1', [key])).rows).toEqual([]);
    expect((await command(request, key)).state.pieces.filter(p => p.clientId === client.entityId)).toHaveLength(3);
  });

  it('rechecks disabled membership even on a previously successful request replay', async () => {
    const key = randomUUID();
    const request = { type: 'create-piece', input: { clientId: C } };
    await command(request, key);
    await db.query('update public.members set active=false where id=$1', [M]);
    try {
      await expect(command(request, key)).rejects.toMatchObject({ code: '42501' });
      await expect(snapshot()).rejects.toMatchObject({ code: '42501' });
    } finally { await db.query('update public.members set active=true where id=$1', [M]); }
  });

  it('scopes retry receipts to the authenticated person and records the actual staff actor', async () => {
    await db.query('insert into auth.users(id) values($1)', [id(0, 6)]);
    await db.query("insert into public.profiles(user_id,display_name) values($1,'Otra persona')", [id(0, 6)]);
    await db.query("insert into public.members(id,workspace_id,user_id,role) values($1,$2,$3,'staff')", [id(3, 6), W, id(0, 6)]);
    const request = { type: 'create-piece', input: { clientId: C } }, key = randomUUID();
    const first = await command(request, key);
    const second = await command(request, key, 6);
    expect(second.entityId).not.toBe(first.entityId);
    expect(entityPiece(second).ownerId).toBe(id(3, 6));
    expect(second.state.activities.find(a => a.pieceId === second.entityId)?.actor).toBe('Otra persona');
    expect((await command(request, key, 6)).entityId).toBe(second.entityId);
    await db.query('update public.members set active=false where id=$1', [id(3, 6)]);
  });

  it('cannot change a foreign tenant client/piece or assign nonstaff/inactive/foreign owners', async () => {
    await expect(command({ type: 'update-client', clientId: id(2, 3), expectedRevision: 0, patch: { name: 'Intrusion' } })).rejects.toThrow('NOT_FOUND');
    await expect(command({ type: 'update-piece', pieceId: id(4, 4), expectedRevision: 1, patch: { title: 'Intrusion' } })).rejects.toThrow('NOT_FOUND');
    await expect(createPiece(id(2, 3))).rejects.toThrow('NOT_FOUND');
    for (const ownerId of [id(3, 2), id(3, 4), id(3, 5)]) await expect(createPiece(C, { ownerId })).rejects.toThrow('VALIDATION');
    const piece = entityPiece(await createPiece());
    await expect(updatePiece(piece, { ownerId: id(3, 4) })).rejects.toThrow('VALIDATION');
  });

  it.each([
    { type: 'create-client', input: { name: '', phone: '', contactName: '', monthlyPlan: { posts: 0, reels: 0 } } },
    { type: 'create-client', input: { name: 'x', phone: '', contactName: '', monthlyPlan: { posts: 201, reels: 0 } } },
    { type: 'create-client', input: { name: 'x', phone: '', contactName: '', monthlyPlan: { posts: 1.5, reels: 0 } } },
    { type: 'create-client', input: { name: 'x', phone: '', contactName: '', monthlyPlan: { posts: 1 } } },
    { type: 'create-piece', input: { clientId: C, format: 'invented' } },
    { type: 'create-piece', input: { clientId: C, plannedDate: '2026-02-31' } },
    { type: 'create-piece', input: { clientId: C, planMonth: '2026-13' } },
    { type: 'create-piece', input: { clientId: C, workArea: null } },
    { type: 'create-piece', input: { clientId: C, ownerId: 'not-a-uuid' } },
    { type: 'create-piece', input: { clientId: C }, actor: id(0, 4) },
  ])('rejects malformed payload atomically: %j', async request => {
    const previous = await snapshot();
    await expect(command(request)).rejects.toThrow('VALIDATION');
    expect(await snapshot()).toEqual(previous);
  });

  it('rejects unsupported features and injected Drive assets without receipts', async () => {
    const piece = entityPiece(await createPiece());
    await expect(command({ type: 'create-review', pieceId: piece.id, assets: [], caption: '', expectedRevision: piece.revision })).rejects.toThrow('FEATURE_UNAVAILABLE');
    await expect(updatePiece(piece, { teamAssets: [] })).rejects.toThrow('FEATURE_UNAVAILABLE');
    await expect(updatePiece(piece, { teamAssets: [{ driveFileId: 'unverified' }] })).rejects.toThrow('FEATURE_UNAVAILABLE');
  });

  it('rejects nulls, coercion and unknown patch fields without changing any part of a piece', async () => {
    const piece = entityPiece(await createPiece());
    for (const patch of [
      { caption: null }, { script: null }, { internalNote: false }, { title: null }, { title: '' },
      { plannedDate: false }, { plannedDate: '2026-2-01' }, { plannedDate: '2026-04-31' },
      { planMonth: null }, { planMonth: 202608 }, { productionStage: null }, { productionStage: 'unknown' },
      { workArea: null }, { workArea: 'all' }, { archived: null }, { archived: 'true' }, { visibleToClient: 1 },
      { ownerId: null }, { status: null }, { status: 'APPROVED' }, { format: null },
      { workspaceId: id(1, 2) }, { clientId: id(2, 3) }, { revision: 999 }, { id: randomUUID() },
    ]) await expect(updatePiece(piece, patch)).rejects.toThrow('VALIDATION');
    for (const expectedRevision of [null, '1', -1, 1.5]) {
      await expect(command({ type: 'update-piece', pieceId: piece.id, expectedRevision, patch: { title: 'No' } })).rejects.toThrow('VALIDATION');
    }
    expect((await snapshot()).state.pieces.find(p => p.id === piece.id)).toEqual(piece);
  });

  it('does not allow arbitrary review/approved or publish without current sealed approval', async () => {
    const piece = entityPiece(await createPiece());
    for (const status of ['review', 'approved']) await expect(updatePiece(piece, { status })).rejects.toThrow('INVALID_TRANSITION');
    for (const status of ['scheduled', 'published']) await expect(updatePiece(piece, { status })).rejects.toThrow('APPROVAL_REQUIRED');
    await seedReview(piece, 'approved', 1, 'different');
    await expect(updatePiece(piece, { status: 'scheduled' })).rejects.toThrow('APPROVAL_REQUIRED');
  });

  it('caption edits supersede approved snapshots and cannot restore approval in the same patch', async () => {
    const piece = entityPiece(await createPiece());
    const review = await seedReview(piece);
    await db.query("update public.pieces set status='approved' where id=$1", [piece.id]);
    const updated = await updatePiece(piece, { caption: 'Nueva versión', status: 'approved' });
    expect(entityPiece(updated)).toMatchObject({ caption: 'Nueva versión', status: 'production' });
    expect(updated.state.reviews.find(r => r.id === review)?.status).toBe('superseded');
  });

  it('only the latest review can authorize scheduling and caption cannot change while scheduling', async () => {
    const piece = entityPiece(await createPiece());
    await seedReview(piece);
    await expect(updatePiece(piece, { status: 'scheduled', caption: 'Unapproved edit' })).rejects.toThrow('APPROVAL_REQUIRED');
    await seedReview(piece, 'superseded', 2);
    await expect(updatePiece(piece, { status: 'scheduled' })).rejects.toThrow('APPROVAL_REQUIRED');
  });

  it('published caption/status is immutable while metadata and archival preserve the approved version', async () => {
    const piece = entityPiece(await createPiece());
    const review = await seedReview(piece);
    const published = entityPiece(await updatePiece(piece, { status: 'published' }));
    await expect(updatePiece(published, { caption: 'Replacement' })).rejects.toThrow('PUBLISHED_IMMUTABLE');
    await expect(updatePiece(published, { status: 'production' })).rejects.toThrow('PUBLISHED_IMMUTABLE');
    const updated = await updatePiece(published, { title: 'Metadata', internalNote: 'Publicado', archived: true });
    expect(entityPiece(updated)).toMatchObject({ status: 'published', archived: true, title: 'Metadata' });
    expect(updated.state.reviews.find(r => r.id === review)?.status).toBe('approved');
    await expect(updatePiece(entityPiece(updated), { archived: false })).rejects.toThrow('ARCHIVED');
  });

  it('archiving supersedes nonpublished approval and revokes only this piece request shares', async () => {
    const piece = entityPiece(await createPiece());
    const review = await seedReview(piece);
    await db.query("update public.pieces set status='approved' where id=$1", [piece.id]);
    const calendar = randomUUID(), share = randomUUID(), materialShare = randomUUID(), material = randomUUID();
    await db.query("insert into public.material_requests(id,workspace_id,client_id,piece_id,instructions) values($1,$2,$3,$4,'Tomas')", [material, W, piece.clientId, piece.id]);
    await db.query("insert into public.shares(id,workspace_id,client_id,scope,review_id,token_hash) values($1,$2,$3,'review',$4,repeat('1',64)),($5,$2,$3,'calendar',null,repeat('2',64))", [share, W, piece.clientId, review, calendar]);
    await db.query("insert into public.shares(id,workspace_id,client_id,scope,material_request_id,token_hash) values($1,$2,$3,'material',$4,repeat('3',64))", [materialShare, W, piece.clientId, material]);
    const archived = await updatePiece(piece, { archived: true });
    expect(archived.state.reviews.find(r => r.id === review)?.status).toBe('superseded');
    const rows = (await db.query<{ id: string; revoked_at: string | null }>('select id,revoked_at from public.shares where id=any($1::uuid[])', [[calendar, share, materialShare]])).rows;
    expect(rows.find(r => r.id === calendar)?.revoked_at).toBeNull();
    expect(rows.filter(r => r.id !== calendar).every(r => r.revoked_at !== null)).toBe(true);
    expect(archived.state.shares).toEqual([]);
  });
});

it('installs on a fresh schema and opens an empty workspace without fictional records', async () => {
  const emptyDb = new PGlite();
  try {
    for (const path of ['supabase/tests/bootstrap.sql', 'supabase/migrations/202609060001_initial.sql', 'supabase/migrations/202609080001_shared_workspace.sql']) await emptyDb.exec(await readFile(path, 'utf8'));
    // Only authentication + membership bootstrap. No clients, plans, assets or demo fixtures.
    await emptyDb.query('insert into auth.users(id) values($1)', [id(0)]);
    await emptyDb.query("insert into public.profiles(user_id,display_name) values($1,'Equipo')", [id(0)]);
    await emptyDb.query("insert into public.workspaces(id,name) values($1,'Aramis')", [W]);
    await emptyDb.query("insert into public.members(id,workspace_id,user_id,role) values($1,$2,$3,'staff')", [M, W, id(0)]);
    await emptyDb.exec(`set role authenticated; set request.jwt.claim.sub='${id(0)}'`);
    const result = (await emptyDb.query<{ value: Envelope }>('select public.aramis_workspace($1) as value', [W])).rows[0].value;
    expect(result.state).toEqual({ schemaVersion: 1, clients: [], members: [{ id: M, name: 'Equipo', initials: 'E' }], pieces: [], reviews: [], materials: [], responses: [], shares: [], activities: [] });
  } finally { await emptyDb.close(); }
}, 30_000);
