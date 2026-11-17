import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { WorkspaceStatistics } from '../contracts/statistics';

const workspace = '10000000-0000-4000-8000-000000000001';
const otherWorkspace = '10000000-0000-4000-8000-000000000002';
const reader = '00000000-0000-4000-8000-000000000001';
const clientUser = '00000000-0000-4000-8000-000000000002';
const coworker = '00000000-0000-4000-8000-000000000004';
const clientA = '20000000-0000-4000-8000-000000000001';
const clientB = '20000000-0000-4000-8000-000000000002';
const migration = '202611160001_internal_statistics.sql';
const id = (n: number) => `40000000-0000-4000-8000-00000000000${n}`;
const version = (n: number) => `80000000-0000-4000-8000-00000000000${n}`;

describe('private statistics in PostgreSQL', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(await readFile('supabase/tests/bootstrap.sql', 'utf8'));
    for (const file of (await readdir('supabase/migrations')).sort()) {
      if (file === migration) continue;
      await db.exec(await readFile('supabase/migrations/' + file, 'utf8'));
      if (file === '202609060001_initial.sql') await db.exec(await readFile('supabase/tests/fixtures.sql', 'utf8'));
    }
    await db.exec(`
      insert into public.members(workspace_id, user_id, role) values ('${workspace}', '${coworker}', 'staff');
      update public.piece_production set plan_month = '2026-10';
      update public.pieces set format = 'reel' where id = '${id(1)}';
      update public.pieces set status = 'approved' where id in ('${id(1)}', '${id(2)}', '${id(3)}', '${id(4)}');
      insert into app_private.piece_clients(workspace_id, piece_id, client_id, position)
      values ('${workspace}', '${id(2)}', '${clientA}', 1), ('${workspace}', '${id(2)}', '${clientB}', 2);
      insert into app_private.notification_events(workspace_id, piece_id, sequence, audience, kind, occurred_at)
      values ('${workspace}', '${id(1)}', 10, 'design', 'ready', '2026-09-28 03:00Z'),
        ('${workspace}', '${id(1)}', 12, 'design', 'ready', '2026-10-01 03:00Z');
      insert into app_private.deliveries(id,workspace_id,piece_id,version,caption,assets,status,created_at,created_by,source,decided_at)
      values
        ('${version(1)}','${workspace}','${id(1)}',1,'Private caption','[]','changes','2026-10-02 03:00Z','Fixture','team','2026-10-02 15:00Z'),
        ('${version(2)}','${workspace}','${id(1)}',2,'Private caption','[]','approved','2026-10-04 03:00Z','Fixture','team','2026-10-05 03:00Z'),
        ('${version(3)}','${workspace}','${id(2)}',1,'Private caption','[]','approved','2026-10-03 03:00Z','Fixture','client','2026-10-06 03:00Z'),
        ('${version(4)}','${workspace}','${id(3)}',1,'Private caption','[]','approved','2026-09-30 02:59Z','Fixture','team','2026-10-01 02:59Z'),
        ('${version(5)}','${otherWorkspace}','${id(4)}',1,'Private caption','[]','approved','2026-10-10 03:00Z','Fixture','team','2026-10-12 03:00Z');
    `);
    await db.exec(await readFile('supabase/migrations/' + migration, 'utf8'));
    await db.exec(`
      insert into app_private.statistics_readers(workspace_id, member_id)
      select workspace_id, id from public.members where workspace_id = '${workspace}' and user_id = '${reader}';
      update app_private.deliveries set status = 'pending', source = null, decided_at = null where id = '${version(2)}';
      update app_private.deliveries set status = 'approved', source = 'team', decided_at = '2026-10-10 03:00Z'
      where id = '${version(2)}';
    `);
  }, 30000);
  afterAll(async () => { await db?.close(); });

  async function asUser<T>(user: string, operation: () => Promise<T>, role = 'authenticated') {
    await db.exec(`set role ${role}; set request.jwt.claim.sub = '${user}'`);
    try { return await operation(); }
    finally { await db.exec('reset role; reset request.jwt.claim.sub'); }
  }

  async function report(user = reader, w = workspace, client: string | null = null, format: string | null = null, from = '2026-10-01', through = from) {
    return asUser(user, async () => {
      const reply = await db.query<{value: WorkspaceStatistics}>('select public.aramis_statistics($1,$2,$3,$4,$5) value',
        [w, from, through, client, format]);
      return reply.rows[0].value;
    });
  }

  it('counts final approvals once, separates multi-client work, and includes only observed times', async () => {
    const data = await report();
    expect(data).toMatchObject({
      approved: 2, clientsServed: 2,
      firstDelivery: { count: 1, medianHours: 24 },
      internalReview: { count: 2, medianHours: 18 },
      byClient: [
        { id: clientA, approved: 2, sharedApproved: 1, assigned: 1, planApproved: 1, reworked: 1 },
        { id: clientB, approved: 1, sharedApproved: 1, assigned: 1, planApproved: 1, reworked: 0 },
      ],
    });
    expect(data.clients).toHaveLength(2);
    expect(JSON.stringify(data)).not.toContain('Private caption');
    expect(await report(reader, workspace, clientB)).toMatchObject({
      approved: 1, clientsServed: 1, firstDelivery: { count: 0, medianHours: null }, byClient: [{ id: clientB }],
    });
    expect(await report(reader, workspace, null, 'post')).toMatchObject({
      approved: 1, clientsServed: 2, internalReview: { count: 0, medianHours: null },
    });
  });

  it('retains original decisions when reopened and does not count a currently undone approval', async () => {
    const audit = await db.query<{ kind: string }>('select kind from app_private.delivery_decisions where delivery_id=$1 order by id', [version(2)]);
    expect(audit.rows.map(event => event.kind)).toEqual(['approved', 'reopened', 'approved']);
    await db.exec('begin');
    try {
      await db.exec(`
        update app_private.deliveries set status='pending', source=null, decided_at=null where id='${version(2)}';
        update public.pieces set status='review' where id='${id(1)}';
      `);
      expect(await report()).toMatchObject({ approved: 1, internalReview: { count: 2, medianHours: 18 } });
    } finally { await db.exec('rollback'); }
  });

  it('denies other staff, clients, anonymous access, wrong workspaces, and revoked membership', async () => {
    for (const user of [coworker, clientUser]) await expect(report(user)).rejects.toMatchObject({ code: '42501' });
    await expect(report(reader, otherWorkspace)).rejects.toMatchObject({ code: '42501' });
    await asUser(reader, async () => {
      await expect(db.query('select * from app_private.delivery_decisions')).rejects.toMatchObject({ code: '42501' });
    });
    await asUser(reader, async () => {
      await expect(db.query("select public.aramis_statistics($1,'2026-10-01','2026-10-01',null,null)", [workspace]))
        .rejects.toMatchObject({ code: '42501' });
    }, 'anon');
    for (const [user, allowed] of [[reader, true], [coworker, false]] as const) {
      const reply = await asUser(user, () => db.query<{ allowed: boolean }>(
        "select public.aramis_workspace($1)->'canViewStatistics' allowed", [workspace]));
      expect(reply.rows[0].allowed).toBe(allowed);
    }
    await db.exec('begin');
    try {
      await db.exec(`update public.members set active=false where workspace_id='${workspace}' and user_id='${reader}'`);
      // Match the role at entry; roll back the deliberately failing statement before restoring the fixture.
      await db.exec(`set local role authenticated; set local request.jwt.claim.sub = '${reader}'`);
      await expect(db.query("select public.aramis_statistics($1,'2026-10-01','2026-10-01',null,null)", [workspace]))
        .rejects.toMatchObject({ code: '42501' });
    } finally { await db.exec('rollback'); }
  });
});
