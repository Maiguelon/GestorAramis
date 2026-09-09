import { describe, expect, it, vi } from 'vitest';
import type { Command, WorkspaceState } from '../contracts/domain';
import { SharedWorkspaceStore } from '../src/lib/shared-api';

const uuid = '00000000-0000-4000-8000-000000000001';
const state = (): WorkspaceState => ({ schemaVersion: 1, clients: [], members: [{ id: 'member-remote', name: 'Miguel', initials: 'M' }], pieces: [], reviews: [], materials: [], responses: [], shares: [], activities: [] });
const workspace = () => ({ state: state(), memberId: 'member-remote', workspaceId: 'workspace', workspaceName: 'Aramis' });
const command: Command = { type: 'create-client', input: { name: 'Cliente remoto', phone: '', contactName: '', monthlyPlan: { posts: 3, reels: 1 } } };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const memoryJournal = () => { const data = new Map<string, string>(); return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } }; };

describe('adaptador compartido del equipo', () => {
  it.each(['', '/api', '/api/'])('resuelve una única ruta /api con base %s', async (base) => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(json(workspace()));
    const store = new SharedWorkspaceStore(base, transport);
    store.setSession('user', 'access'); await store.refresh();
    expect(transport.mock.calls[0][0]).toBe('/api/workspace');
  });
  it('exige sesión y carga el miembro del servidor, sin consultar ni escribir la demo', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(json(workspace()));
    const store = new SharedWorkspaceStore('', transport);
    await expect(store.execute(command)).rejects.toMatchObject({ code: 'SESSION_REQUIRED' });
    expect(transport).not.toHaveBeenCalled();
    store.setSession('user', 'access'); await store.refresh();
    expect(store.getSnapshot().workspace?.memberId).toBe('member-remote');
    expect(transport.mock.calls[0][1]).toMatchObject({ headers: { Authorization: 'Bearer access' }, credentials: 'omit', cache: 'no-store' });
  });
  it('conserva UUID y comando después de respuesta perdida y no deja crear otra operación', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(json(workspace())).mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(json({ state: state(), entityId: 'client-created' }));
    const store = new SharedWorkspaceStore('', transport, () => uuid);
    store.setSession('user', 'token'); await store.refresh();
    await expect(store.execute(command)).rejects.toMatchObject({ code: 'UNCERTAIN_WRITE' });
    await expect(store.execute({ ...command, input: { ...command.input, name: 'Otro' } })).rejects.toMatchObject({ code: 'UNRESOLVED_WRITE' });
    await store.retryPending();
    const attempts = transport.mock.calls.filter(([path]) => path === '/api/commands');
    expect(attempts).toHaveLength(2); expect(attempts[0][1]?.body).toBe(attempts[1][1]?.body);
    expect(JSON.parse(attempts[0][1]?.body as string)).toEqual({ command, requestId: uuid });
    expect(store.getSnapshot()).toMatchObject({ uncertain: false, busy: false, error: '' });
  });
  it('restaura el UUID pendiente después de recargar y lo limpia después de confirmar', async () => {
    const journal = memoryJournal();
    const first = new SharedWorkspaceStore('', vi.fn<typeof fetch>().mockResolvedValueOnce(json(workspace())).mockRejectedValue(new TypeError('lost')), () => uuid, journal);
    first.setSession('user', 'token'); await first.refresh(); await expect(first.execute(command)).rejects.toThrow();
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(json(workspace())).mockResolvedValueOnce(json({ state: state(), entityId: 'created' }));
    const reloaded = new SharedWorkspaceStore('', transport, () => crypto.randomUUID(), journal);
    reloaded.setSession('user', 'new-token'); await reloaded.refresh();
    expect(reloaded.getSnapshot().uncertain).toBe(true); await reloaded.retryPending();
    expect(JSON.parse(transport.mock.calls[1][1]?.body as string).requestId).toBe(uuid); expect(journal.data.size).toBe(0);
  });
  it('no envía el cambio si no puede registrar el reintento', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(json(workspace()));
    const journal = memoryJournal(); journal.setItem = () => { throw new Error('blocked'); };
    const store = new SharedWorkspaceStore('', transport, () => uuid, journal);
    store.setSession('user', 'token'); await store.refresh();
    await expect(store.execute(command)).rejects.toMatchObject({ code: 'RETRY_STORAGE_UNAVAILABLE' });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('un conflicto confirmado permite un nuevo UUID; conserva el error comprensible', async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async path => path === '/api/workspace' ? json(workspace()) : json({ code: 'CONFLICT' }, 409));
    const newId = vi.fn(() => crypto.randomUUID());
    const store = new SharedWorkspaceStore('', transport, newId);
    store.setSession('user', 'token'); await store.refresh();
    await expect(store.execute(command)).rejects.toThrow('Los datos cambiaron');
    await expect(store.execute(command)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(newId).toHaveBeenCalledTimes(2); expect(store.getSnapshot().uncertain).toBe(false);
  });
  it('un 5xx o un éxito incompleto conservan el mismo guardado pendiente', async () => {
    for (const response of [json({ code: 'unavailable' }, 503), json({ entityId: 'id' })]) {
      const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(json(workspace())).mockResolvedValueOnce(response);
      const store = new SharedWorkspaceStore('', transport, () => uuid); store.setSession('user', 'token'); await store.refresh();
      await expect(store.execute(command)).rejects.toMatchObject({ code: 'UNCERTAIN_WRITE' }); expect(store.getSnapshot().uncertain).toBe(true);
    }
  });
  it('ignora lecturas antiguas recibidas después de guardar', async () => {
    const oldRead = deferred<Response>(); let count = 0;
    const saved = state(); saved.clients.push({ id: 'client-new', name: 'Nuevo', initials: 'N', color: '#123456', contactName: '', phone: '' });
    const transport = vi.fn<typeof fetch>().mockImplementation(async path => path === '/api/commands' ? json({ state: saved, entityId: 'client-new' }) : count++ === 0 ? json(workspace()) : oldRead.promise);
    const store = new SharedWorkspaceStore('', transport, () => uuid); store.setSession('user', 'token'); await store.refresh();
    const read = store.refresh(); await store.execute(command); oldRead.resolve(json(workspace())); await read;
    expect(store.getSnapshot().workspace?.state.clients[0]?.id).toBe('client-new');
  });
  it('renovar token conserva los datos y usa el token nuevo', async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => json(workspace()));
    const store = new SharedWorkspaceStore('', transport); store.setSession('user', 'one'); await store.refresh();
    store.setSession('user', 'two'); expect(store.getSnapshot().workspace).not.toBeNull(); await store.refresh();
    expect(transport.mock.calls[1][1]?.headers).toMatchObject({ Authorization: 'Bearer two' });
  });
  it('cerrar sesión elimina datos y diario y una respuesta tardía no los resucita', async () => {
    const late = deferred<Response>(), journal = memoryJournal();
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(json(workspace())).mockImplementationOnce(() => late.promise);
    const store = new SharedWorkspaceStore('', transport, () => uuid, journal); store.setSession('user', 'token'); await store.refresh();
    const write = store.execute(command); store.setSession(null, null);
    expect(store.getSnapshot()).toMatchObject({ workspace: null, uncertain: false, busy: false }); expect(journal.data.size).toBe(0);
    late.resolve(json({ state: state(), entityId: 'old' })); await expect(write).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    expect(store.getSnapshot().workspace).toBeNull();
  });
  it('un cambio de cuenta rechaza también las lecturas pendientes de la anterior', async () => {
    const late = deferred<Response>();
    const transport = vi.fn<typeof fetch>().mockImplementationOnce(() => late.promise).mockResolvedValueOnce(json({ ...workspace(), workspaceName: 'Nueva cuenta' }));
    const store = new SharedWorkspaceStore('', transport); store.setSession('old', 'one'); const old = store.refresh();
    store.setSession('new', 'two'); await store.refresh(); late.resolve(json(workspace())); await old;
    expect(store.getSnapshot().workspace?.workspaceName).toBe('Nueva cuenta');
  });
  it('revocación del permiso borra el estado privado aunque el código sea propio del servidor', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(json(workspace())).mockResolvedValueOnce(json({ code: 'forbidden' }, 403));
    const store = new SharedWorkspaceStore('', transport); store.setSession('user', 'token'); await store.refresh(); await store.refresh();
    expect(store.getSnapshot().workspace).toBeNull(); expect(store.getSnapshot().error).toContain('no tiene acceso');
  });
  it('rechaza medios y comandos de cliente sin hacer solicitudes', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(json(workspace())); const store = new SharedWorkspaceStore('', transport);
    store.setSession('user', 'token'); await store.refresh();
    await expect(store.execute({ type: 'create-share', scope: 'calendar', targetId: 'x' })).rejects.toMatchObject({ code: 'NOT_CONNECTED' });
    await expect(store.execute({ type: 'update-piece', pieceId: 'x', expectedRevision: 0, patch: { teamAssets: [] } })).rejects.toMatchObject({ code: 'NOT_CONNECTED' });
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
