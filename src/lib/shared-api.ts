import type { Command, CommandResult, WorkspaceState } from '../../contracts/domain';

export interface StaffWorkspace { state: WorkspaceState; memberId: string; workspaceId: string; workspaceName: string }
export interface SharedSnapshot { workspace: StaffWorkspace | null; error: string; loading: boolean; busy: boolean; uncertain: boolean }
export class SharedApiError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'SharedApiError'; }
}
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
function validState(value: unknown): value is WorkspaceState {
  return object(value) && value.schemaVersion === 1 && ['clients', 'members', 'pieces', 'reviews', 'materials', 'responses', 'shares', 'activities'].every(key => Array.isArray(value[key]));
}
function errorFrom(body: unknown, status: number) {
  const source = object(body) && object(body.error) ? body.error : body;
  const code = object(source) && typeof source.code === 'string' ? source.code : `HTTP_${status}`;
  const messages: Record<string, string> = {
    VALIDATION: 'Revisá los datos ingresados. Hay un valor que no se puede guardar.', NOT_FOUND: 'Ese registro ya no está disponible.',
    CONFLICT: 'Los datos cambiaron mientras editabas. Tu borrador sigue acá; cargá los datos actuales antes de volver a guardar.',
    ARCHIVED: 'La pieza fue archivada. No se guardaron los cambios.', MONTH_EXISTS: 'La base de ese mes ya está generada.',
    EMPTY_PLAN: 'Configurá las cantidades del plan antes de generar el mes.', INVALID_TRANSITION: 'La pieza no puede pasar a ese estado desde su estado actual.',
    APPROVAL_REQUIRED: 'La pieza requiere aprobación antes de programarla o publicarla.', PUBLISHED_IMMUTABLE: 'El texto de una pieza publicada no puede reemplazarse.',
    IDEMPOTENCY_CONFLICT: 'La solicitud de guardado ya se usó con otros datos. Recargá la vista.', FEATURE_UNAVAILABLE: 'Esta función todavía no está conectada.',
  };
  return new SharedApiError(code, status === 401 ? 'La sesión venció. Volvé a ingresar.' : status === 403 ? 'Tu cuenta no tiene acceso al equipo de Aramis.' : messages[code] ?? 'No pudimos completar la operación.');
}

/** Staff-only store. Session-scoped retry journal; no demo fallback or token persistence here. */
export class SharedWorkspaceStore {
  private snapshot: SharedSnapshot = { workspace: null, error: '', loading: false, busy: false, uncertain: false };
  private listeners = new Set<() => void>();
  private controllers = new Set<AbortController>();
  private userId: string | null = null;
  private token: string | null = null;
  private generation = 0;
  private readSerial = 0;
  private writeSerial = 0;
  private pending: { command: Command; requestId: string } | null = null;
  constructor(private baseUrl = '', private transport: typeof fetch = (...args) => fetch(...args), private newId = () => crypto.randomUUID(), private journal?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {}
  getSnapshot = () => this.snapshot;
  getPendingCommand = () => this.pending?.command ?? null;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<SharedSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach(listener => { try { listener(); } catch { /* View errors cannot turn a committed write into failure. */ } });
  }
  setSession(userId: string | null, accessToken: string | null) {
    if (userId === this.userId) { this.token = accessToken; return; }
    this.generation++; this.readSerial++; this.writeSerial++;
    this.controllers.forEach(controller => controller.abort()); this.controllers.clear();
    if (this.userId) this.clearJournal();
    this.userId = userId; this.token = accessToken; this.pending = null;
    try {
      const raw = userId ? this.journal?.getItem(this.journalKey()) : null;
      if (raw) {
        const entry: unknown = JSON.parse(raw);
        if (object(entry) && typeof entry.requestId === 'string' && /^[a-f0-9-]{36}$/i.test(entry.requestId) && object(entry.command) && typeof entry.command.type === 'string') this.pending = entry as unknown as NonNullable<typeof this.pending>;
      }
    } catch { /* Reads can still work; journal writes will fail closed if storage is unavailable. */ }
    this.update({ workspace: null, error: this.pending ? 'Quedó un guardado sin confirmar. Usá “Reintentar guardado” para verificarlo sin duplicarlo.' : '', loading: false, busy: false, uncertain: !!this.pending });
  }
  private journalKey() { return `aramis.shared.pending.v1.${this.userId}`; }
  private clearJournal() { try { this.journal?.removeItem(this.journalKey()); } catch { /* A retained UUID can only replay the same command. */ } }
  private async request(path: string, init: RequestInit = {}) {
    if (!this.token || !this.userId) throw new SharedApiError('SESSION_REQUIRED', 'Ingresá para abrir el espacio del equipo.');
    const controller = new AbortController(); this.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const base = this.baseUrl.replace(/\/$/, '').replace(/\/api$/, '');
      const response = await this.transport(`${base}${path}`, { ...init, credentials: 'omit', cache: 'no-store', signal: controller.signal, headers: { 'Content-Type': 'application/json', ...init.headers, Authorization: `Bearer ${this.token}` } });
      let body: unknown;
      try { body = await response.json(); } catch { body = null; }
      return { response, body };
    } finally { clearTimeout(timeout); this.controllers.delete(controller); }
  }
  async refresh(): Promise<void> {
    if (!this.userId || this.snapshot.busy) return;
    const generation = this.generation, serial = ++this.readSerial, writeSerial = this.writeSerial;
    this.update({ loading: !this.snapshot.workspace });
    try {
      const { response, body } = await this.request('/api/workspace');
      if (generation !== this.generation || serial !== this.readSerial || writeSerial !== this.writeSerial) return;
      if (!response.ok) { if (response.status === 401 || response.status === 403) this.update({ workspace: null }); throw errorFrom(body, response.status); }
      if (!object(body) || !validState(body.state) || typeof body.memberId !== 'string' || typeof body.workspaceId !== 'string' || typeof body.workspaceName !== 'string' || !body.state.members.some(member => member.id === body.memberId)) throw new SharedApiError('INVALID_RESPONSE', 'El servicio devolvió datos incompletos. Volvé a intentar.');
      this.update({ workspace: body as unknown as StaffWorkspace, error: this.snapshot.uncertain ? this.snapshot.error : '', loading: false });
    } catch (error) {
      if (generation !== this.generation || serial !== this.readSerial || writeSerial !== this.writeSerial) return;
      // Revoked permissions must remove previously loaded private data immediately.
      const forbidden = error instanceof SharedApiError && ['HTTP_401', 'HTTP_403', 'UNAUTHORIZED', 'FORBIDDEN', 'SESSION_REQUIRED', 'AUTH_REQUIRED', 'STAFF_REQUIRED', 'INVALID_SESSION'].includes(error.code);
      this.update({ loading: false, ...(forbidden ? { workspace: null } : {}), error: error instanceof Error ? error.message : 'No pudimos actualizar los datos. Volvé a intentar.' });
    }
  }
  async execute(command: Command): Promise<CommandResult> {
    if (!['create-client', 'update-client', 'generate-month', 'create-piece', 'update-piece'].includes(command.type) || (command.type === 'update-piece' && command.patch.teamAssets !== undefined)) throw new SharedApiError('NOT_CONNECTED', 'Esta función requiere la próxima integración de archivos y clientes.');
    if (!this.snapshot.workspace) throw new SharedApiError('SESSION_REQUIRED', 'Esperá a que cargue el espacio del equipo.');
    if (this.snapshot.busy) throw new SharedApiError('WRITE_IN_PROGRESS', 'Esperá a que termine de guardarse el cambio.');
    if (this.pending) {
      if (JSON.stringify(this.pending.command) !== JSON.stringify(command)) throw new SharedApiError('UNRESOLVED_WRITE', 'Primero verificá el cambio pendiente con “Reintentar guardado”.');
    } else {
      const operation = { command: structuredClone(command), requestId: this.newId() };
      try { this.journal?.setItem(this.journalKey(), JSON.stringify(operation)); }
      catch { throw new SharedApiError('RETRY_STORAGE_UNAVAILABLE', 'El navegador no permite conservar la confirmación del guardado. Habilitá el almacenamiento del sitio antes de guardar.'); }
      this.pending = operation;
    }
    return this.sendPending();
  }
  retryPending = async (): Promise<CommandResult | undefined> => {
    if (!this.pending || this.snapshot.busy) return undefined;
    return this.sendPending();
  };
  private async sendPending(): Promise<CommandResult> {
    const operation = this.pending!;
    const generation = this.generation; this.writeSerial++; this.readSerial++;
    this.update({ busy: true, error: '' });
    let definitive = false;
    try {
      const { response, body } = await this.request('/api/commands', { method: 'POST', body: JSON.stringify(operation) });
      if (generation !== this.generation) throw new SharedApiError('SESSION_CHANGED', 'La sesión cambió. No se mostrarán datos de la sesión anterior.');
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) this.update({ workspace: null });
        definitive = response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 425 && response.status !== 429;
        throw errorFrom(body, response.status);
      }
      if (!object(body) || !validState(body.state) || typeof body.entityId !== 'string') throw new SharedApiError('INVALID_RESPONSE', 'No recibimos la confirmación completa del guardado.');
      const result = body as unknown as CommandResult;
      this.pending = null; this.clearJournal();
      this.update({ workspace: { ...this.snapshot.workspace!, state: result.state }, busy: false, uncertain: false, error: '' });
      return result;
    } catch (error) {
      if (generation !== this.generation) throw new SharedApiError('SESSION_CHANGED', 'La sesión cambió. No se mostrarán datos de la sesión anterior.');
      if (definitive) { this.pending = null; this.clearJournal(); }
      const message = definitive ? error instanceof Error ? error.message : 'No se guardó el cambio.' : 'No pudimos confirmar si se guardó el cambio. Usá “Reintentar guardado” para verificarlo sin duplicarlo.';
      this.update({ busy: false, uncertain: !definitive, error: message });
      // Reload on a definitive conflict so forms can explicitly adopt the new revision.
      if (definitive) void this.refresh();
      throw new SharedApiError(definitive && error instanceof SharedApiError ? error.code : 'UNCERTAIN_WRITE', message);
    }
  }
}

const browserJournal = typeof window === 'undefined' ? undefined : {
  getItem: (key: string) => window.sessionStorage.getItem(key),
  setItem: (key: string, value: string) => window.sessionStorage.setItem(key, value),
  removeItem: (key: string) => window.sessionStorage.removeItem(key),
};
export const sharedWorkspace = new SharedWorkspaceStore(import.meta.env.VITE_API_BASE_URL || '', undefined, undefined, browserJournal);
