import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset, Command } from '../contracts/domain';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  getCalls = 0;
  setCalls = 0;
  failReads = false;
  failWrites = false;
  onGet: ((count: number, key: string) => void) | undefined;
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) {
    if (this.failReads) throw new Error('SecurityError');
    const value = this.values.get(key) ?? null;
    this.onGet?.(++this.getCalls, key);
    return value;
  }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) {
    this.setCalls++;
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.values.set(key, value);
  }
}

const asset: Asset = { id: 'local-file', name: 'Video de prueba.mp4', mimeType: 'video/mp4', size: 1_024, source: 'demo' };
const respond = (patch: Partial<Extract<Command, { type: 'respond-review' }>> = {}): Extract<Command, { type: 'respond-review' }> => ({ type: 'respond-review', reviewId: 'review-oliva-1', version: 1, kind: 'approved', comment: '', authorName: 'Cliente de prueba', source: 'link', idempotencyKey: 'api-response-1', ...patch });
const update = (revision = 1): Command => ({ type: 'update-piece', pieceId: 'piece-oliva-review', expectedRevision: revision, patch: { title: 'Actualizado desde el panel' } });
let storage: MemoryStorage;
let browser: EventTarget;

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_APP_MODE', 'demo');
  storage = new MemoryStorage();
  browser = new EventTarget();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', browser);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('demo storage and isolation', () => {
  it('initializes once and restores changed state after a module reload', async () => {
    const first = await import('../src/lib/api');
    expect(first.readWorkspace().pieces).toHaveLength(7);
    expect(storage.setCalls).toBe(1);
    first.readWorkspace();
    expect(storage.setCalls).toBe(1);
    first.runCommand(update());
    vi.resetModules();
    const reloaded = await import('../src/lib/api');
    expect(reloaded.readWorkspace().pieces.find(piece => piece.id === 'piece-oliva-review')?.title).toBe('Actualizado desde el panel');
    expect(storage.setCalls).toBe(2);
  });
  it('does not expose cached mutable state through reads or command results', async () => {
    const api = await import('../src/lib/api');
    const state = api.readWorkspace();
    state.pieces[0].title = 'Mutación sin guardar';
    state.reviews[0].assets[0].name = 'Archivo alterado';
    expect(api.readWorkspace().pieces[0].title).not.toBe('Mutación sin guardar');
    expect(api.readWorkspace().reviews[0].assets[0].name).not.toBe('Archivo alterado');
    const result = api.runCommand(update());
    result.state.pieces[0].title = 'Otra mutación';
    expect(api.readWorkspace().pieces[0].title).not.toBe('Otra mutación');
  });
  it('fails closed outside demo mode instead of inventing a server connection', async () => {
    vi.stubEnv('VITE_APP_MODE', 'production');
    const api = await import('../src/lib/api');
    expect(() => api.readWorkspace()).toThrow('El servicio compartido todavía no está conectado.');
    expect(() => api.runCommand(update())).toThrow('El servicio compartido todavía no está conectado.');
    expect(() => api.resetDemo()).toThrow('El servicio compartido todavía no está conectado.');
    expect(storage.setCalls).toBe(0);
  });
  it('reports inaccessible storage without replacing it with an in-memory success', async () => {
    storage.failReads = true;
    const api = await import('../src/lib/api');
    expect(() => api.readWorkspace()).toThrow('No podemos acceder a los datos locales.');
    expect(storage.setCalls).toBe(0);
  });
  it('preserves corrupt JSON and rejects missing or invalid relational data', async () => {
    const api = await import('../src/lib/api');
    const state = api.readWorkspace();
    for (const raw of ['{truncated', JSON.stringify({ schemaVersion: 1, pieces: [], shares: [] }), JSON.stringify({ ...state, materials: null }), JSON.stringify({ ...state, pieces: [...state.pieces, state.pieces[0]] }), JSON.stringify({ ...state, pieces: state.pieces.map(piece => ({ ...piece, clientId: 'missing-client' })) })]) {
      storage.setItem(api.DEMO_STORAGE_KEY, raw);
      const writes = storage.setCalls;
      expect(() => api.readWorkspace()).toThrow('Sus datos no fueron reemplazados.');
      expect(storage.getItem(api.DEMO_STORAGE_KEY)).toBe(raw);
      expect(storage.setCalls).toBe(writes);
    }
  });
  it('does not seed over an existing empty/corrupted string', async () => {
    const api = await import('../src/lib/api');
    storage.setItem(api.DEMO_STORAGE_KEY, '');
    expect(() => api.readWorkspace()).toThrow('Sus datos no fueron reemplazados.');
    expect(storage.getItem(api.DEMO_STORAGE_KEY)).toBe('');
  });
  it('a failed write leaves persisted and cached state intact, with no success notification', async () => {
    const api = await import('../src/lib/api');
    const before = api.readWorkspace();
    const raw = storage.getItem(api.DEMO_STORAGE_KEY);
    const listener = vi.fn();
    api.subscribe(listener);
    storage.failWrites = true;
    expect(() => api.runCommand(update())).toThrow('No se guardó el cambio.');
    storage.failWrites = false;
    expect(storage.getItem(api.DEMO_STORAGE_KEY)).toBe(raw);
    expect(api.readWorkspace()).toEqual(before);
    expect(listener).not.toHaveBeenCalled();
  });
  it('reset replaces data only after saving successfully and can recover corrupted data', async () => {
    const api = await import('../src/lib/api');
    api.runCommand(update());
    const raw = storage.getItem(api.DEMO_STORAGE_KEY);
    storage.failWrites = true;
    expect(() => api.resetDemo()).toThrow('No se guardó el cambio.');
    expect(storage.getItem(api.DEMO_STORAGE_KEY)).toBe(raw);
    storage.failWrites = false;
    storage.setItem(api.DEMO_STORAGE_KEY, '{broken');
    api.resetDemo();
    expect(api.readWorkspace().pieces.find(piece => piece.id === 'piece-oliva-review')?.title).toBe('Tu rincón favorito');
  });
  it('does not report a persisted command as failed when a subscriber throws', async () => {
    const api = await import('../src/lib/api');
    api.readWorkspace();
    api.subscribe(() => { throw new Error('View broke'); });
    const second = vi.fn();
    api.subscribe(second);
    expect(() => api.runCommand(update())).not.toThrow();
    expect(second).toHaveBeenCalledOnce();
    expect(api.readWorkspace().pieces.find(piece => piece.id === 'piece-oliva-review')?.title).toBe('Actualizado desde el panel');
  });
});

describe('public authorization at the API boundary', () => {
  it('read-only calendar links and mismatched request targets never write', async () => {
    const api = await import('../src/lib/api');
    api.readWorkspace();
    const raw = storage.getItem(api.DEMO_STORAGE_KEY);
    expect(() => api.runPublicCommand(respond(), 'demo-calendar')).toThrow('Este enlace no permite');
    expect(() => api.runPublicCommand(respond({ reviewId: 'review-norte-1' }), 'demo-review')).toThrow('Este enlace no permite');
    expect(() => api.runPublicCommand({ type: 'complete-material', requestId: 'material-oliva-1' }, 'demo-material')).toThrow('Este enlace no permite');
    expect(storage.getItem(api.DEMO_STORAGE_KEY)).toBe(raw);
  });
  it('client views never expose capabilities, hashes or neighboring request links', async () => {
    const api = await import('../src/lib/api');
    for (const token of ['demo-calendar', 'demo-review', 'demo-material']) {
      const serialized = JSON.stringify(api.readClientView(token));
      for (const forbidden of ['"shares"', '"token"', 'tokenHash', 'demo-calendar', 'demo-review', 'demo-material', '/request/']) expect(serialized).not.toContain(forbidden);
    }
    expect('getDemoRequestLink' in api).toBe(false);
  });
  it('revoked links cannot answer, including an idempotent replay of an existing answer', async () => {
    const api = await import('../src/lib/api');
    api.runPublicCommand(respond(), 'demo-review');
    api.runCommand({ type: 'revoke-share', shareId: 'share-review-oliva' });
    const raw = storage.getItem(api.DEMO_STORAGE_KEY);
    expect(() => api.runPublicCommand(respond(), 'demo-review')).toThrow('Este enlace no está disponible.');
    expect(storage.getItem(api.DEMO_STORAGE_KEY)).toBe(raw);
  });
  it('an approved answer is idempotent and survives reload without duplicate history', async () => {
    const api = await import('../src/lib/api');
    const result = api.runPublicCommand(respond(), 'demo-review');
    expect(Object.keys(result)).toEqual(['entityId']);
    expect(JSON.stringify(result)).not.toContain('internalNote');
    expect(JSON.stringify(result)).not.toContain('shares');
    const raw = storage.getItem(api.DEMO_STORAGE_KEY);
    const writes = storage.setCalls;
    vi.resetModules();
    const reloaded = await import('../src/lib/api');
    reloaded.runPublicCommand(respond(), 'demo-review');
    expect(storage.getItem(api.DEMO_STORAGE_KEY)).toBe(raw);
    expect(storage.setCalls).toBe(writes);
    expect(reloaded.readClientView('demo-review').responses.filter(response => response.id.includes('api-response-1'))).toHaveLength(1);
  });
  it('rejects stale review links even when there is a new explicitly shared review', async () => {
    const api = await import('../src/lib/api');
    api.runPublicCommand(respond({ kind: 'changes', comment: 'Otra portada' }), 'demo-review');
    const next = api.runCommand({ type: 'create-review', pieceId: 'piece-oliva-review', caption: 'Otra versión', assets: [{ ...asset, mimeType: 'image/svg+xml', url: '/demo/cover-oliva.svg' }] });
    api.runCommand({ type: 'create-share', scope: 'review', targetId: next.entityId });
    expect(() => api.runPublicCommand(respond({ idempotencyKey: 'late' }), 'demo-review')).toThrow('versión más reciente');
  });
  it('rejects Drive metadata or arbitrary URLs in both internal reviews and public material', async () => {
    const api = await import('../src/lib/api');
    api.readWorkspace();
    const raw = storage.getItem(api.DEMO_STORAGE_KEY);
    for (const invalid of [{ ...asset, source: 'drive' as const }, { ...asset, driveFileId: 'provider-id' }, { ...asset, checksum: 'provider-hash' }, { ...asset, url: 'https://files.example.test/a' }, { ...asset, url: 'javascript:alert(1)' }, { ...asset, url: '/demo/../private.svg' }]) {
      expect(() => api.runPublicCommand({ type: 'receive-material', requestId: 'material-oliva-1', assets: [invalid] }, 'demo-material')).toThrow('sólo registra archivos de prueba locales');
      expect(() => api.runCommand({ type: 'create-review', pieceId: 'piece-oliva-review', caption: 'Texto', assets: [invalid] })).toThrow('sólo registra archivos de prueba locales');
    }
    expect(storage.getItem(api.DEMO_STORAGE_KEY)).toBe(raw);
    api.runPublicCommand({ type: 'receive-material', requestId: 'material-oliva-1', assets: [asset] }, 'demo-material');
    expect(api.readClientView('demo-material').materials[0].status).toBe('received');
    expect(api.readClientView('demo-material').materials[0].assets[0].source).toBe('demo');
  });
});

describe('cross-tab conflict detection', () => {
  it('reads external updates before applying an expectedRevision command', async () => {
    const api = await import('../src/lib/api');
    const external = api.readWorkspace();
    external.pieces.find(piece => piece.id === 'piece-oliva-review')!.revision = 2;
    external.pieces.find(piece => piece.id === 'piece-oliva-review')!.title = 'Edición externa';
    storage.setItem(api.DEMO_STORAGE_KEY, JSON.stringify(external));
    expect(() => api.runCommand(update(1))).toThrow('El contenido cambió.');
    expect(api.readWorkspace().pieces.find(piece => piece.id === 'piece-oliva-review')?.title).toBe('Edición externa');
  });
  it('rejects an intervening write between authorization and commit, preserving revocation', async () => {
    const api = await import('../src/lib/api');
    const external = api.readWorkspace();
    external.shares.find(share => share.token === 'demo-review')!.revokedAt = '2026-09-06T18:00:00.000Z';
    const incoming = JSON.stringify(external);
    storage.getCalls = 0;
    storage.onGet = count => { if (count === 1) storage.setItem(api.DEMO_STORAGE_KEY, incoming); };
    expect(() => api.runPublicCommand(respond(), 'demo-review')).toThrow('Los datos cambiaron en otra pestaña.');
    storage.onGet = undefined;
    expect(storage.getItem(api.DEMO_STORAGE_KEY)).toBe(incoming);
    expect(() => api.runPublicCommand(respond(), 'demo-review')).toThrow('Este enlace no está disponible.');
  });
  it('storage events refresh subscribers and removing a subscription stops it', async () => {
    const api = await import('../src/lib/api');
    api.readWorkspace();
    const listener = vi.fn();
    const unsubscribe = api.subscribe(listener);
    const unrelated = Object.assign(new Event('storage'), { key: 'unrelated' });
    browser.dispatchEvent(unrelated);
    expect(listener).not.toHaveBeenCalled();
    browser.dispatchEvent(Object.assign(new Event('storage'), { key: api.DEMO_STORAGE_KEY }));
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    browser.dispatchEvent(Object.assign(new Event('storage'), { key: null }));
    expect(listener).toHaveBeenCalledOnce();
  });
});
