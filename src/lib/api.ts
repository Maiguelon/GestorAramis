import { useEffect, useState } from 'react';
import type { Command, CommandResult, ShareScope, WorkspaceState } from '../../contracts/domain';
import { applyCommand } from '../domain/engine';
import { createSeed } from '../domain/seed';
import { assertPublicCommandAccess, getClientView } from '../domain/selectors';

export const APP_MODE = import.meta.env.VITE_APP_MODE || 'demo';
export const DEMO_STORAGE_KEY = 'aramis.workspace.demo.v1';
const listeners = new Set<() => void>();
let cached: WorkspaceState | undefined;
let cachedRaw: string | null | undefined;
function assertDemo() { if (APP_MODE !== 'demo') throw new Error('El servicio compartido todavía no está conectado.'); }
function notify() { for (const listener of listeners) listener(); }
export function readWorkspace(): WorkspaceState {
  assertDemo();
  const raw = localStorage.getItem(DEMO_STORAGE_KEY);
  if (cached && raw === cachedRaw) return cached;
  if (!raw) {
    cached = createSeed();
    cachedRaw = JSON.stringify(cached);
    localStorage.setItem(DEMO_STORAGE_KEY, cachedRaw);
    return cached;
  }
  const state = JSON.parse(raw) as WorkspaceState;
  if (state.schemaVersion !== 1 || !Array.isArray(state.pieces) || !Array.isArray(state.shares)) throw new Error('No pudimos leer esta demostración. Podés restablecer sus datos desde Ajustes.');
  cached = state; cachedRaw = raw;
  return state;
}
function commit(command: Command, actor: string): CommandResult {
  const result = applyCommand(readWorkspace(), command, { actor, now: new Date().toISOString(), newId: () => crypto.randomUUID(), token: () => `${crypto.randomUUID()}${crypto.randomUUID()}` });
  const raw = JSON.stringify(result.state);
  localStorage.setItem(DEMO_STORAGE_KEY, raw);
  cached = result.state; cachedRaw = raw;
  notify();
  return result;
}
export function runCommand(command: Command) { return commit(command, 'Equipo Aramís'); }
export function readClientView(token: string) { return getClientView(readWorkspace(), token); }
export function runPublicCommand(command: Command, token: string) {
  assertPublicCommandAccess(readWorkspace(), token, command);
  return commit(command, 'Cliente · demostración');
}
export function getDemoRequestLink(pieceId: string, scope: Extract<ShareScope, 'review' | 'material'>): string | null {
  const state = readWorkspace();
  const targets = scope === 'review' ? state.reviews.filter(review => review.pieceId === pieceId && review.status !== 'superseded').map(review => review.id) : state.materials.filter(request => request.pieceId === pieceId && request.status !== 'complete').map(request => request.id);
  const share = state.shares.find(item => item.scope === scope && targets.includes(item.targetId) && !item.revokedAt);
  return share ? `/request/${encodeURIComponent(share.token)}` : null;
}
export function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
if (typeof window !== 'undefined') window.addEventListener('storage', event => { if (!event.key || event.key === DEMO_STORAGE_KEY) { cached = undefined; cachedRaw = undefined; notify(); } });
export function resetDemo() { assertDemo(); localStorage.removeItem(DEMO_STORAGE_KEY); cached = undefined; cachedRaw = undefined; readWorkspace(); notify(); }
export function useWorkspace() {
  const [state, setState] = useState(readWorkspace);
  const [error, setError] = useState('');
  useEffect(() => subscribe(() => { try { setState(readWorkspace()); } catch (error) { setError(error instanceof Error ? error.message : 'No pudimos leer los datos.'); } }), []);
  function execute(command: Command) {
    try { const result = runCommand(command); setError(''); return result; }
    catch (error) { setError(error instanceof Error ? error.message : 'No pudimos guardar el cambio.'); throw error; }
  }
  return { state, execute, error };
}
