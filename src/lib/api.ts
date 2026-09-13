import { useEffect, useState } from 'react';
import type { Command, CommandResult, WorkspaceState } from '../../contracts/domain';
import { applyCommand, DomainError, isCalendarDate, isPlanMonth } from '../domain/engine';
import { validClientLogo } from '../../contracts/client-logo';
import { createSeed } from '../domain/seed';
import { assertPublicCommandAccess, getClientView } from '../domain/selectors';
import { sharedWorkspace } from './shared-api';

export const APP_MODE = import.meta.env.VITE_APP_MODE || 'demo';
export const DEMO_STORAGE_KEY = 'aramis.workspace.demo.v1';
const listeners = new Set<() => void>();
let cached: WorkspaceState | undefined;
let cachedRaw: string | null | undefined;
function assertDemo() { if (APP_MODE !== 'demo') throw new DomainError('NOT_CONNECTED', 'El servicio compartido todavía no está conectado.'); }
function notify() {
  for (const listener of listeners) {
    // A failed view must not turn an already persisted operation into a reported write failure.
    try { listener(); } catch { /* Subscribers are responsible for their own error UI. */ }
  }
}
function readRaw(): string | null {
  try { return localStorage.getItem(DEMO_STORAGE_KEY); }
  catch { throw new DomainError('STORAGE_UNAVAILABLE', 'No podemos acceder a los datos locales. Habilitá el almacenamiento de este sitio y volvé a intentar.'); }
}
function writeRaw(raw: string): void {
  try { localStorage.setItem(DEMO_STORAGE_KEY, raw); }
  catch { throw new DomainError('STORAGE_WRITE_FAILED', 'No se guardó el cambio. El almacenamiento local está lleno o no está disponible. Tus datos anteriores siguen intactos.'); }
}

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const strings = (value: Record<string, unknown>, keys: string[]) => keys.every(key => typeof value[key] === 'string');
const nullableString = (value: unknown) => value === null || typeof value === 'string';
const timestamp = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const calendarDate = (value: unknown) => value === null || (typeof value === 'string' && isCalendarDate(value));
const oneOf = (value: unknown, options: string[]) => typeof value === 'string' && options.includes(value);
const arrayOf = (value: unknown, test: (item: Record<string, unknown>) => boolean): boolean => Array.isArray(value) && value.every(item => object(item) && test(item));
function isDemoAsset(value: Record<string, unknown>): boolean {
  return strings(value, ['id', 'name', 'mimeType']) && Number.isSafeInteger(value.size) && Number(value.size) >= 0 && value.source === 'demo' && value.driveFileId === undefined && value.checksum === undefined && (value.url === undefined || (typeof value.url === 'string' && /^\/demo\/[a-z0-9-]+\.svg$/.test(value.url)));
}
function assertDemoAssets(command: Command): void {
  if (command.type === 'update-piece' && command.patch.teamAssets !== undefined && (!Array.isArray(command.patch.teamAssets) || !command.patch.teamAssets.every(asset => object(asset) && isDemoAsset(asset)))) throw new DomainError('DEMO_ASSETS_ONLY', 'El material del equipo sólo admite archivos locales en esta demostración.');
  if (command.type === 'receive-material' || command.type === 'create-review') {
    if (!Array.isArray(command.assets) || !command.assets.every(asset => object(asset) && isDemoAsset(asset))) throw new DomainError('DEMO_ASSETS_ONLY', 'Esta demostración sólo registra archivos de prueba locales. No carga archivos en Drive ni acepta enlaces externos.');
  }
}

const optional = (value: unknown, test: (item: unknown) => boolean) => value === undefined || test(value);
const plan = (value: unknown) => object(value) && Object.keys(value).every(key => ['posts', 'reels'].includes(key)) && ['posts', 'reels'].every(key => Number.isSafeInteger(value[key]) && Number(value[key]) >= 0 && Number(value[key]) <= 200);
const months = (value: unknown) => Array.isArray(value) && value.every(isPlanMonth) && new Set(value).size === value.length;

/** Local data integrity check; it is not an authentication/security boundary. */
function parseWorkspace(raw: string): WorkspaceState {
  const invalid = () => new DomainError('STORAGE_CORRUPT', 'No pudimos leer esta demostración. Sus datos no fueron reemplazados. Podés restablecerlos desde Ajustes.');
  let state: unknown;
  try { state = JSON.parse(raw); } catch { throw invalid(); }
  if (!object(state) || state.schemaVersion !== 1 ||
    !arrayOf(state.clients, item => strings(item, ['id', 'name', 'initials', 'color', 'contactName', 'phone']) && optional(item.logo, validClientLogo) && optional(item.monthlyPlan, plan) && optional(item.generatedMonths, months) && optional(item.revision, value => Number.isSafeInteger(value) && Number(value) >= 0)) ||
    !arrayOf(state.members, item => strings(item, ['id', 'name', 'initials'])) ||
    !arrayOf(state.pieces, item => strings(item, ['id', 'clientId', 'title', 'ownerId', 'caption', 'internalNote', 'createdAt', 'updatedAt']) && oneOf(item.format, ['reel', 'carousel', 'post', 'story']) && oneOf(item.status, ['planned', 'production', 'review', 'approved', 'scheduled', 'published']) && calendarDate(item.plannedDate) && typeof item.visibleToClient === 'boolean' && typeof item.archived === 'boolean' && Number.isSafeInteger(item.revision) && Number(item.revision) >= 0 && optional(item.planMonth, isPlanMonth) && optional(item.workArea, value => oneOf(value, ['marketing', 'design'])) && optional(item.productionStage, value => oneOf(value, ['ready', 'recording', 'editing'])) && optional(item.script, value => typeof value === 'string') && optional(item.teamAssets, value => arrayOf(value, isDemoAsset) && new Set((value as Array<{ id: string }>).map(asset => asset.id)).size === (value as unknown[]).length)) ||
    !arrayOf(state.reviews, item => strings(item, ['id', 'pieceId', 'caption', 'createdAt']) && Number.isSafeInteger(item.version) && Number(item.version) > 0 && oneOf(item.status, ['pending', 'approved', 'changes', 'superseded']) && nullableString(item.sentAt) && arrayOf(item.assets, isDemoAsset)) ||
    !arrayOf(state.materials, item => strings(item, ['id', 'pieceId', 'instructions', 'createdAt']) && calendarDate(item.dueDate) && oneOf(item.status, ['pending', 'received', 'complete']) && nullableString(item.sentAt) && arrayOf(item.assets, isDemoAsset)) ||
    !arrayOf(state.responses, item => strings(item, ['id', 'reviewId', 'comment', 'authorName', 'createdAt']) && oneOf(item.kind, ['approved', 'changes', 'comment']) && oneOf(item.source, ['link', 'whatsapp']) && nullableString(item.recordedBy)) ||
    !arrayOf(state.shares, item => strings(item, ['id', 'token', 'targetId', 'clientId', 'createdAt']) && oneOf(item.scope, ['calendar', 'review', 'material']) && nullableString(item.revokedAt)) ||
    !arrayOf(state.activities, item => strings(item, ['id', 'pieceId', 'text', 'actor', 'createdAt']) && oneOf(item.visibility, ['internal', 'client']))) throw invalid();
  const parsed = state as unknown as WorkspaceState;
  const collections = [parsed.clients, parsed.members, parsed.pieces, parsed.reviews, parsed.materials, parsed.responses, parsed.shares, parsed.activities];
  if (collections.some(items => items.some(item => !item.id) || new Set(items.map(item => item.id)).size !== items.length)) throw invalid();
  if (collections.some(items => items.some(item => ('createdAt' in item && !timestamp(item.createdAt)) || ('updatedAt' in item && !timestamp(item.updatedAt)) || ('sentAt' in item && item.sentAt !== null && !timestamp(item.sentAt)) || ('revokedAt' in item && item.revokedAt !== null && !timestamp(item.revokedAt))))) throw invalid();
  const clientIds = new Set(parsed.clients.map(item => item.id));
  const memberIds = new Set(parsed.members.map(item => item.id));
  const pieceIds = new Set(parsed.pieces.map(item => item.id));
  const reviewIds = new Set(parsed.reviews.map(item => item.id));
  if (parsed.pieces.some(item => !clientIds.has(item.clientId) || !memberIds.has(item.ownerId)) || parsed.reviews.some(item => !pieceIds.has(item.pieceId)) || parsed.materials.some(item => !pieceIds.has(item.pieceId)) || parsed.responses.some(item => !reviewIds.has(item.reviewId)) || parsed.activities.some(item => !pieceIds.has(item.pieceId)) || new Set(parsed.shares.map(item => item.token)).size !== parsed.shares.length) throw invalid();
  for (const share of parsed.shares) {
    if (!clientIds.has(share.clientId) || !share.token) throw invalid();
    if (share.scope === 'calendar') { if (share.targetId !== share.clientId) throw invalid(); }
    else {
      const request = share.scope === 'review' ? parsed.reviews.find(item => item.id === share.targetId) : parsed.materials.find(item => item.id === share.targetId);
      if (!request || parsed.pieces.find(item => item.id === request.pieceId)?.clientId !== share.clientId) throw invalid();
    }
  }
  return parsed;
}

function readSnapshot(): { state: WorkspaceState; raw: string } {
  assertDemo();
  const raw = readRaw();
  if (cached && raw === cachedRaw && raw !== null) return { state: structuredClone(cached), raw };
  if (raw === null) {
    const state = createSeed();
    const initialized = JSON.stringify(state);
    // Do not replace data that another tab wrote during initialization.
    if (readRaw() !== null) return readSnapshot();
    writeRaw(initialized);
    cached = structuredClone(state); cachedRaw = initialized;
    return { state, raw: initialized };
  }
  const state = parseWorkspace(raw);
  cached = structuredClone(state); cachedRaw = raw;
  return { state, raw };
}
export function readWorkspace(): WorkspaceState { return readSnapshot().state; }

function commit(command: Command, actor: string, token?: string): CommandResult {
  const snapshot = readSnapshot();
  if (token !== undefined) assertPublicCommandAccess(snapshot.state, token, command);
  assertDemoAssets(command);
  const result = applyCommand(snapshot.state, command, { actor, now: new Date().toISOString(), newId: () => crypto.randomUUID(), token: () => `${crypto.randomUUID()}${crypto.randomUUID()}` });
  // localStorage has no transaction primitive. Detect an intervening write and fail closed;
  // genuinely simultaneous cross-tab writes still require the future server transaction.
  if (readRaw() !== snapshot.raw) throw new DomainError('CONFLICT', 'Los datos cambiaron en otra pestaña. Actualizá la vista antes de guardar.');
  const raw = JSON.stringify(result.state);
  if (raw !== snapshot.raw) writeRaw(raw);
  cached = structuredClone(result.state); cachedRaw = raw;
  notify();
  return result;
}
export function runCommand(command: Command) { return commit(command, 'member-lucia'); }
export function readClientView(token: string) { return getClientView(readWorkspace(), token); }
export function runPublicCommand(command: Command, token: string) {
  const { entityId } = commit(command, 'Cliente · demostración', token);
  return { entityId };
}
export function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
if (typeof window !== 'undefined') window.addEventListener('storage', event => { if (!event.key || event.key === DEMO_STORAGE_KEY) { cached = undefined; cachedRaw = undefined; notify(); } });
export function resetDemo() {
  assertDemo();
  const state = createSeed();
  const raw = JSON.stringify(state);
  // setItem replaces atomically or throws: never delete the old demo before saving its replacement.
  writeRaw(raw);
  cached = structuredClone(state); cachedRaw = raw;
  notify();
}
export function useWorkspace() {
  const [state, setState] = useState(() => APP_MODE === 'demo' ? readWorkspace() : sharedWorkspace.getSnapshot().workspace!.state);
  const [error, setError] = useState('');
  const [shared, setShared] = useState(sharedWorkspace.getSnapshot);
  useEffect(() => APP_MODE === 'demo' ? subscribe(() => { try { setState(readWorkspace()); } catch (error) { setError(error instanceof Error ? error.message : 'No pudimos leer los datos.'); } }) : sharedWorkspace.subscribe(() => { const next = sharedWorkspace.getSnapshot(); setShared(next); if (next.workspace) setState(next.workspace.state); if (!next.busy && !next.uncertain && !next.error) setError(''); }), []);
  async function execute(command: Command): Promise<CommandResult> {
    try { const result = APP_MODE === 'demo' ? runCommand(command) : await sharedWorkspace.execute(command); setError(''); return result; }
    catch (error) { setError(error instanceof Error ? error.message : 'No pudimos guardar el cambio.'); throw error; }
  }
  return { state, execute, error: APP_MODE === 'demo' ? error : shared.error || error, memberId: APP_MODE === 'demo' ? 'member-lucia' : shared.workspace?.memberId ?? '', shared, retryPending: sharedWorkspace.retryPending };
}
