// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import type { Piece, WorkspaceState } from '../contracts/domain';

const W = '10000000-0000-4000-8000-000000000001', U = '00000000-0000-4000-8000-000000000001';
const C = '20000000-0000-4000-8000-000000000001', G = randomUUID();
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
type Envelope = { state: WorkspaceState; entityId: string };
const entity = (value: Envelope) => value.state.pieces.find(p => p.id === value.entityId)!;

describe('staff history and restore in PostgreSQL (local, no hosted service)', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite(); await db.exec(await readFile('supabase/tests/bootstrap.sql', 'utf8'));
    for (const file of (await readdir('supabase/migrations')).sort()) {
      await db.exec(await readFile('supabase/migrations/' + file, 'utf8'));
      if (file === '202609060001_initial.sql') await db.exec(await readFile('supabase/tests/fixtures.sql', 'utf8'));
    }
    await drive('connection-save', { expectedGeneration: null, generation: G, encryptedTokens: { iv: Array(12).fill(1), ciphertext: Array(32).fill(2) }, accountEmail: 'fixture@example.test', accountPermissionId: 'fixture', rootFolderId: null });
  }, 30_000);
  afterAll(async () => { await db?.close(); });

  async function command(payload: unknown, requestId = randomUUID(), user = U, workspace = W) {
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${user}'`);
    try { return (await db.query<{ value: Envelope }>('select public.aramis_command($1,$2,$3) value', [workspace, JSON.stringify(payload), requestId])).rows[0].value; }
    finally { await db.exec('reset role; reset request.jwt.claim.sub'); }
  }
  async function drive(action: string, payload: unknown = {}, user = U, workspace = W) {
    await db.exec('set role service_role');
    try { return (await db.query<{ value: any }>('select public.aramis_drive($1,$2,$3,$4) value', [workspace, user, action, JSON.stringify(payload)])).rows[0].value; }
    finally { await db.exec('reset role'); }
  }
  const update = async (p: Piece, patch: Record<string, unknown>) => entity(await command({ type: 'update-piece', pieceId: p.id, expectedRevision: p.revision, patch }));
  const restore = (p: Piece) => ({ type: 'restore-piece', pieceId: p.id, expectedRevision: p.revision });
  async function setup() {
    let p = entity(await command({ type: 'create-piece', input: { clientId: C, title: 'Historial sintético', plannedDate: '2026-09-01', planMonth: '2026-08' } }));
    p = await update(p, { status: 'production', workArea: 'design', caption: 'Texto conservado', script: 'Guion conservado', internalNote: 'Nota privada' });
    const folder = 'material-' + p.id, deliveryFolder = 'delivery-' + p.id;
    await drive('folder-put', { logicalKey: 'piece:' + p.id, folderId: folder });
    await drive('folder-put', { logicalKey: 'piece:' + p.id + ':delivery', folderId: deliveryFolder });
    const assets: string[] = [];
    for (const [name, parent] of [['toma.mp4', folder], ['final.png', deliveryFolder]]) {
      const upload = await drive('upload-put', { uploadId: randomUUID(), pieceId: p.id, name, mimeType: name.endsWith('png') ? 'image/png' : 'video/mp4', size: 12, fingerprint: 'a'.repeat(64), driveFileId: 'file-' + randomUUID(), folderId: parent, generation: G, encryptedSession: null });
      const asset = await drive('upload-complete', { uploadId: upload.uploadId, asset: { driveFileId: upload.driveFileId, mimeType: upload.mimeType, size: 12, checksum: 'a'.repeat(32), driveRevisionId: 'pinned-revision' } });
      assets.push(asset.id);
    }
    p.revision += 2;
    p = entity(await command({ type: 'submit-delivery', pieceId: p.id, expectedRevision: p.revision, assetIds: [assets[1]] }));
    p = entity(await command({ type: 'review-delivery', pieceId: p.id, expectedRevision: p.revision, deliveryId: p.deliveries![0].id, decision: 'approved', comment: 'Decisión anterior', source: 'team' }));
    return { p, assets, folder };
  }

  it('recovers once, preserves exact delivery history and rejects reuse of its previous approval', async () => {
    let { p, assets } = await setup();
    const original = structuredClone(p);
    const reviewId = randomUUID(), shareId = randomUUID();
    await db.query("insert into public.reviews(id,workspace_id,client_id,piece_id,version,caption,status,sealed_at) values($1,$2,$3,$4,1,$5,'approved',now())", [reviewId, W, C, p.id, p.caption]);
    await db.query("insert into public.shares(id,workspace_id,client_id,scope,review_id,token_hash) values($1,$2,$3,'review',$4,$5)", [shareId, W, C, reviewId, 'a'.repeat(64)]);
    p = await update(p, { archived: true });
    const request = restore(p), key = randomUUID();
    const result = await command(request, key); p = entity(result);
    expect(p).toMatchObject({ archived: false, status: 'planned', workArea: 'marketing', productionStage: 'ready', visibleToClient: false, planMonth: '2026-08', plannedDate: '2026-09-01', caption: original.caption, script: original.script, internalNote: original.internalNote });
    const { invalidatedAt: _invalidatedAt, ...previousDecision } = original.deliveries![0];
    expect(p.deliveries![0]).toMatchObject(previousDecision);
    expect(p.deliveries![0].invalidatedAt).toBeTruthy();
    expect((await command(request, key)).state.activities.filter(a => a.pieceId === p.id && a.text === 'Contenido recuperado a planificación.')).toHaveLength(1);
    expect((await db.query<{ revoked_at: string | null }>('select revoked_at from public.shares where id=$1', [shareId])).rows[0].revoked_at).toBeTruthy();
    expect((await db.query<{ status: string }>('select status from public.reviews where id=$1', [reviewId])).rows[0].status).toBe('superseded');
    expect((await drive('list-assets', { pieceId: p.id })).map((a: { id: string }) => a.id)).toEqual(assets);
    await expect(command(request)).rejects.toThrow('CONFLICT');
    await expect(command({ ...request, expectedRevision: p.revision }, key)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    await expect(command(restore(p))).rejects.toThrow('INVALID_TRANSITION');
    p = await update(p, { status: 'production', workArea: 'design' });
    await expect(command({ type: 'update-piece', pieceId: p.id, expectedRevision: p.revision, patch: { status: 'scheduled' } })).rejects.toThrow('APPROVAL_REQUIRED');
    p = entity(await command({ type: 'submit-delivery', pieceId: p.id, expectedRevision: p.revision, assetIds: [assets[1]] }));
    expect(p.deliveries).toHaveLength(2);
    expect(p.deliveries![0].invalidatedAt).toBeNull();
    p = entity(await command({ type: 'review-delivery', pieceId: p.id, expectedRevision: p.revision, deliveryId: p.deliveries![0].id, decision: 'approved', comment: '', source: 'team' }));
    expect((await update(p, { status: 'scheduled' })).status).toBe('scheduled');
  });

  it('reads explicitly selected archived assets but retains every write and tenant boundary', async () => {
    let { p, assets, folder } = await setup(); p = await update(p, { archived: true });
    expect((await drive('list-assets', { pieceId: p.id })).map((a: { id: string }) => a.id)).toEqual(assets);
    expect(await drive('get-asset', { assetId: assets[1] })).toMatchObject({ id: assets[1], purpose: 'delivery', driveRevisionId: 'pinned-revision' });
    expect((await drive('list-assets')).some((a: { pieceId: string }) => a.pieceId === p.id)).toBe(false);
    await expect(drive('upload-put', { uploadId: randomUUID(), pieceId: p.id, name: 'new.png', mimeType: 'image/png', size: 12, fingerprint: 'a'.repeat(64), driveFileId: 'new-file', folderId: folder, generation: G, encryptedSession: null })).rejects.toThrow('NOT_FOUND');
    await expect(db.query('select public.aramis_drive_import($1,$2,$3,$4,$5,now(),$6)', [W, U, p.id, folder, G, '[]'])).rejects.toThrow('NOT_FOUND');
    await expect(db.query('select public.aramis_drive_trash($1,$2,$3,$4)', [W, U, assets[0], G])).rejects.toThrow('NOT_FOUND');
    await expect(command({ type: 'update-piece', pieceId: p.id, expectedRevision: p.revision, patch: { archived: false } })).rejects.toThrow('ARCHIVED');
    for (const user of [uid(2), uid(4), uid(5), uid(99)]) {
      await expect(drive('list-assets', { pieceId: p.id }, user)).rejects.toMatchObject({ code: '42501' });
      await expect(drive('get-asset', { assetId: assets[1] }, user)).rejects.toMatchObject({ code: '42501' });
      await expect(command(restore(p), randomUUID(), user)).rejects.toMatchObject({ code: '42501' });
    }
    await expect(command({ ...restore(p), expectedRevision: 1.5 })).rejects.toThrow('VALIDATION');
    await expect(command({ ...restore(p), patch: { status: 'approved' } })).rejects.toThrow('VALIDATION');
    await expect(command({ ...restore(p), pieceId: '40000000-0000-4000-8000-000000000004' })).rejects.toThrow('NOT_FOUND');
  });

  it('keeps restore helper private and outer authorization/idempotency in their existing order', async () => {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await db.exec('set role ' + role);
      try { await expect(db.query('select app_private.restore_piece_command($1,$2,$3)', [W, '{}', 'Fake'])).rejects.toMatchObject({ code: '42501' }); }
      finally { await db.exec('reset role'); }
    }
    const source = (await db.query<{ source: string }>("select pg_get_functiondef('public.aramis_command(uuid,jsonb,uuid)'::regprocedure) source")).rows[0].source;
    expect(source.indexOf('for update;')).toBeLessThan(source.indexOf('command_receipts where'));
    expect(source.indexOf('for share of m;')).toBeLessThan(source.indexOf('command_receipts where'));
    expect(source.indexOf('command_receipts where')).toBeLessThan(source.indexOf('app_private.restore_piece_command'));
    const guard = (await db.query<{ definer: boolean; config: string[] }>("select prosecdef definer,proconfig config from pg_proc where oid='public.aramis_command(uuid,jsonb,uuid)'::regprocedure")).rows[0];
    expect(guard.definer).toBe(true); expect(guard.config).toContain('search_path=""');
  });

  it('serializes competing restores and records only the successful recovery', async () => {
    let { p } = await setup(); p = await update(p, { archived: true });
    const request = restore(p);
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${U}'`);
    let results: PromiseSettledResult<unknown>[];
    try { results = await Promise.allSettled([randomUUID(), randomUUID()].map(key => db.query('select public.aramis_command($1,$2,$3)', [W, JSON.stringify(request), key]))); }
    finally { await db.exec('reset role; reset request.jwt.claim.sub'); }
    expect(results!.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results!.filter(r => r.status === 'rejected')).toHaveLength(1);
    const stored = (await db.query<{ revision: number; status: string; archived: boolean }>('select revision,status,archived from public.pieces where id=$1', [p.id])).rows[0];
    expect(stored).toEqual({ revision: p.revision + 1, status: 'planned', archived: false });
    expect((await db.query('select id from public.activity where piece_id=$1 and text=$2', [p.id, 'Contenido recuperado a planificación.'])).rows).toHaveLength(1);
  });
});
