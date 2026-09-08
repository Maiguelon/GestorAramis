import type { Asset, Command, CommandContext, CommandResult, Piece, Review, ShareScope, WorkspaceState } from '../../contracts/domain';

export class DomainError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

const fail = (code: string, message: string): never => { throw new DomainError(code, message); };
const required = (value: string, label: string) => {
  if (typeof value !== 'string' || !value.trim()) fail('VALIDATION', `${label} es obligatorio.`);
  return value.trim();
};

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateDate(value: string | null): void {
  if (value !== null && !isCalendarDate(value)) fail('VALIDATION', 'La fecha debe ser una fecha válida con formato AAAA-MM-DD.');
}

export function isPlanMonth(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function validatePlan(plan: unknown): void {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) fail('VALIDATION', 'El plan mensual no es válido.');
  const values = plan as Record<string, unknown>;
  if (Object.keys(values).some(key => !['posts', 'reels'].includes(key)) || !['posts', 'reels'].every(key => Number.isSafeInteger(values[key]) && Number(values[key]) >= 0 && Number(values[key]) <= 200)) fail('VALIDATION', 'Cada cantidad mensual debe ser un entero entre 0 y 200.');
}

function validateClientFields(patch: Record<string, unknown>): void {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) fail('VALIDATION', 'Los datos del cliente no son válidos.');
  if (Object.keys(patch).some(key => !['name', 'contactName', 'phone', 'monthlyPlan'].includes(key))) fail('VALIDATION', 'La actualización incluye campos no admitidos.');
  if (patch.name !== undefined) required(patch.name as string, 'El nombre');
  if (patch.contactName !== undefined && typeof patch.contactName !== 'string') fail('VALIDATION', 'El contacto no es válido.');
  if (patch.phone !== undefined && typeof patch.phone !== 'string') fail('VALIDATION', 'El teléfono no es válido.');
  if (patch.monthlyPlan !== undefined) validatePlan(patch.monthlyPlan);
}

function clientInitials(name: string): string { return name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase(); }

function validateAssets(assets: Asset[]): void {
  if (!Array.isArray(assets)) fail('VALIDATION', 'Los archivos no son válidos.');
  const ids = new Set<string>();
  for (const asset of assets) {
    if (!asset || typeof asset !== 'object') fail('VALIDATION', 'El archivo no es válido.');
    required(asset.id, 'El identificador del archivo');
    required(asset.name, 'El nombre del archivo');
    required(asset.mimeType, 'El tipo del archivo');
    if (ids.has(asset.id)) fail('VALIDATION', 'Un archivo está repetido.');
    ids.add(asset.id);
    if (!Number.isSafeInteger(asset.size) || asset.size < 0) fail('VALIDATION', 'El tamaño del archivo no es válido.');
    if (asset.source !== 'demo' && asset.source !== 'drive') fail('VALIDATION', 'El origen del archivo no es válido.');
  }
}

function sameAsset(left: Asset, right: Asset): boolean {
  return left.id === right.id && left.name === right.name && left.mimeType === right.mimeType && left.size === right.size && left.url === right.url && left.driveFileId === right.driveFileId && left.checksum === right.checksum && left.source === right.source;
}

function findPiece(state: WorkspaceState, pieceId: string): Piece {
  const piece = state.pieces.find(item => item.id === pieceId);
  if (!piece) return fail('NOT_FOUND', 'No encontramos ese contenido.');
  if (piece.archived) return fail('ARCHIVED', 'El contenido está archivado.');
  return piece;
}

function latestReview(state: WorkspaceState, pieceId: string): Review | undefined {
  return state.reviews.filter(review => review.pieceId === pieceId).sort((a, b) => b.version - a.version)[0];
}

function invalidateReviews(state: WorkspaceState, piece: Piece): void {
  for (const review of state.reviews) {
    if (review.pieceId === piece.id && (review.status === 'pending' || review.status === 'approved')) review.status = 'superseded';
  }
  if (['review', 'approved', 'scheduled', 'published'].includes(piece.status)) piece.status = 'production';
}

function targetPiece(state: WorkspaceState, scope: ShareScope, targetId: string): Piece | undefined {
  if (scope === 'calendar') {
    if (!state.clients.some(client => client.id === targetId)) fail('NOT_FOUND', 'No encontramos ese cliente.');
    return undefined;
  }
  const request = scope === 'review' ? state.reviews.find(item => item.id === targetId) : state.materials.find(item => item.id === targetId);
  if (!request) return fail('NOT_FOUND', 'No encontramos esa solicitud.');
  return findPiece(state, request.pieceId);
}

/** Pure local domain. Authentication/provider verification belongs to the API adapter. */
export function applyCommand(input: WorkspaceState, command: Command, context: CommandContext): CommandResult {
  const state = structuredClone(input);
  required(context.actor, 'El integrante');
  if (!Number.isFinite(Date.parse(context.now))) fail('VALIDATION', 'La fecha de la operación no es válida.');
  const actor = state.members.find(member => member.id === context.actor)?.name ?? context.actor;
  const activity = (piece: Piece, text: string, visibility: 'internal' | 'client' = 'internal') => {
    state.activities.push({ id: context.newId(), pieceId: piece.id, text, actor, createdAt: context.now, visibility });
    piece.revision += 1;
    piece.updatedAt = context.now;
  };
  let entityId = '';
  switch (command.type) {
    case 'create-client': {
      validateClientFields(command.input);
      const name = required(command.input.name, 'El nombre');
      if (typeof command.input.contactName !== 'string' || typeof command.input.phone !== 'string') fail('VALIDATION', 'Los datos de contacto no son válidos.');
      validatePlan(command.input.monthlyPlan);
      entityId = context.newId();
      state.clients.push({ id: entityId, name, initials: clientInitials(name), color: ['#8b2634', '#5c9cd9', '#f4b943'][state.clients.length % 3], contactName: command.input.contactName.trim(), phone: command.input.phone.trim(), monthlyPlan: structuredClone(command.input.monthlyPlan), revision: 0, generatedMonths: [] });
      break;
    }
    case 'update-client': {
      const client = state.clients.find(item => item.id === command.clientId);
      if (!client) return fail('NOT_FOUND', 'No encontramos ese cliente.');
      if ((client.revision ?? 0) !== command.expectedRevision) fail('CONFLICT', 'El cliente cambió. Actualizá la vista antes de guardar.');
      validateClientFields(command.patch);
      for (const [key, value] of Object.entries(command.patch)) if (value !== undefined) Object.assign(client, { [key]: typeof value === 'string' ? value.trim() : structuredClone(value) });
      client.initials = clientInitials(client.name);
      client.revision = (client.revision ?? 0) + 1;
      entityId = client.id;
      break;
    }
    case 'generate-month': {
      const client = state.clients.find(item => item.id === command.clientId);
      if (!client) return fail('NOT_FOUND', 'No encontramos ese cliente.');
      if (!isPlanMonth(command.month)) fail('VALIDATION', 'Elegí un mes válido.');
      if (!state.members.some(member => member.id === command.ownerId)) fail('VALIDATION', 'Elegí un responsable del equipo.');
      if (client.generatedMonths?.includes(command.month)) fail('MONTH_EXISTS', 'La base de este mes ya fue generada. Podés agregar o archivar piezas manualmente.');
      const plan = client.monthlyPlan ?? { posts: 0, reels: 0 };
      validatePlan(plan);
      if (!plan.posts && !plan.reels) fail('EMPTY_PLAN', 'Definí la cantidad de posteos o reels antes de generar el mes.');
      const existing = state.pieces.filter(piece => piece.clientId === client.id && !piece.archived && (piece.planMonth ?? piece.plannedDate?.slice(0, 7) ?? piece.createdAt.slice(0, 7)) === command.month);
      for (const format of ['post', 'reel'] as const) {
        const total = format === 'post' ? plan.posts : plan.reels;
        const count = existing.filter(piece => format === 'post' ? ['post', 'carousel'].includes(piece.format) : piece.format === format).length;
        for (let index = count + 1; index <= total; index += 1) {
          const piece: Piece = { id: context.newId(), clientId: client.id, title: `${format === 'post' ? 'Posteo' : 'Reel'} ${String(index).padStart(2, '0')}`, format, status: 'planned', ownerId: command.ownerId, plannedDate: null, planMonth: command.month, workArea: 'marketing', productionStage: 'ready', script: '', teamAssets: [], visibleToClient: false, caption: '', internalNote: '', archived: false, revision: 0, createdAt: context.now, updatedAt: context.now };
          state.pieces.push(piece);
          activity(piece, `Contenido creado desde el plan de ${command.month}.`);
        }
      }
      client.generatedMonths = [...(client.generatedMonths ?? []), command.month];
      client.revision = (client.revision ?? 0) + 1;
      entityId = client.id;
      break;
    }
    case 'create-piece': {
      if (!state.clients.some(client => client.id === command.input.clientId)) fail('NOT_FOUND', 'No encontramos ese cliente.');
      if (!state.members.some(member => member.id === command.input.ownerId)) fail('VALIDATION', 'Elegí un responsable del equipo.');
      validateDate(command.input.plannedDate ?? null);
      const format = command.input.format ?? 'post';
      if (!['reel', 'carousel', 'post', 'story'].includes(format)) fail('VALIDATION', 'El formato no es válido.');
      if (command.input.planMonth !== undefined && !isPlanMonth(command.input.planMonth)) fail('VALIDATION', 'Elegí un mes válido.');
      if (command.input.workArea !== undefined && !['marketing', 'design'].includes(command.input.workArea)) fail('VALIDATION', 'El área no es válida.');
      if (command.input.title !== undefined && typeof command.input.title !== 'string') fail('VALIDATION', 'El título no es válido.');
      entityId = context.newId();
      const piece: Piece = { id: entityId, clientId: command.input.clientId, title: command.input.title?.trim() || ({ post: 'Posteo sin título', reel: 'Reel sin título', carousel: 'Carrusel sin título', story: 'Historia sin título' }[format]), planMonth: command.input.planMonth ?? command.input.plannedDate?.slice(0, 7) ?? context.now.slice(0, 7), workArea: command.input.workArea ?? 'marketing', productionStage: 'ready', script: '', teamAssets: [], format, status: 'planned', ownerId: command.input.ownerId, plannedDate: command.input.plannedDate ?? null, visibleToClient: false, caption: '', internalNote: '', archived: false, revision: 0, createdAt: context.now, updatedAt: context.now };
      state.pieces.push(piece);
      activity(piece, 'Contenido creado.');
      break;
    }
    case 'update-piece': {
      const piece = findPiece(state, command.pieceId);
      if (piece.revision !== command.expectedRevision) fail('CONFLICT', 'El contenido cambió. Actualizá la vista antes de guardar.');
      const patch = command.patch;
      const allowed = ['title', 'format', 'ownerId', 'plannedDate', 'visibleToClient', 'caption', 'internalNote', 'archived', 'status', 'planMonth', 'workArea', 'productionStage', 'script', 'teamAssets'];
      if (Object.keys(patch).some(key => !allowed.includes(key))) fail('VALIDATION', 'La actualización incluye campos no admitidos.');
      if (patch.planMonth !== undefined && !isPlanMonth(patch.planMonth)) fail('VALIDATION', 'Elegí un mes válido.');
      if (patch.workArea !== undefined && !['marketing', 'design'].includes(patch.workArea)) fail('VALIDATION', 'El área no es válida.');
      if (patch.productionStage !== undefined && !['ready', 'recording', 'editing'].includes(patch.productionStage)) fail('VALIDATION', 'La etapa de producción no es válida.');
      if (patch.script !== undefined && typeof patch.script !== 'string') fail('VALIDATION', 'El guion no es válido.');
      if (patch.teamAssets !== undefined) validateAssets(patch.teamAssets);
      if (patch.title !== undefined) required(patch.title, 'El título');
      if (patch.ownerId !== undefined && !state.members.some(member => member.id === patch.ownerId)) fail('VALIDATION', 'Elegí un responsable del equipo.');
      if (patch.format !== undefined && !['reel', 'carousel', 'post', 'story'].includes(patch.format)) fail('VALIDATION', 'El formato no es válido.');
      if (patch.plannedDate !== undefined) validateDate(patch.plannedDate);
      if (patch.caption !== undefined && typeof patch.caption !== 'string') fail('VALIDATION', 'El texto no es válido.');
      if (patch.internalNote !== undefined && typeof patch.internalNote !== 'string') fail('VALIDATION', 'La nota no es válida.');
      if (patch.visibleToClient !== undefined && typeof patch.visibleToClient !== 'boolean') fail('VALIDATION', 'La visibilidad no es válida.');
      if (patch.archived !== undefined && typeof patch.archived !== 'boolean') fail('VALIDATION', 'El estado de archivo no es válido.');
      if (piece.status === 'published' && ((patch.caption !== undefined && patch.caption !== piece.caption) || (patch.status !== undefined && patch.status !== 'published'))) fail('PUBLISHED_IMMUTABLE', 'Este contenido ya se publicó. Creá una nueva pieza para preparar otra versión.');
      if (patch.status !== undefined) {
        if (!['planned', 'production', 'review', 'approved', 'scheduled', 'published'].includes(patch.status)) fail('VALIDATION', 'El estado no es válido.');
        if (['review', 'approved'].includes(patch.status) && patch.status !== piece.status) fail('INVALID_TRANSITION', 'Ese estado se actualiza mediante una revisión.');
        if (['scheduled', 'published'].includes(patch.status)) {
          const approved = latestReview(state, piece.id);
          if (approved?.status !== 'approved' || approved.caption !== piece.caption || (patch.caption !== undefined && patch.caption !== piece.caption)) fail('APPROVAL_REQUIRED', 'Necesitás una aprobación vigente antes de programar o publicar.');
        }
      }
      const captionChanged = patch.caption !== undefined && patch.caption !== piece.caption;
      const leavesReview = patch.status !== undefined && ['planned', 'production'].includes(patch.status) && patch.status !== piece.status;
      if (captionChanged || leavesReview || (patch.archived === true && piece.status !== 'published')) invalidateReviews(state, piece);
      const safePatch = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as typeof patch;
      // A simultaneous caption edit cannot restore review/approved after invalidation.
      if (captionChanged && (safePatch.status === 'review' || safePatch.status === 'approved')) delete safePatch.status;
      Object.assign(piece, structuredClone(safePatch));
      if (patch.title !== undefined) piece.title = patch.title.trim();
      if (patch.archived === true) {
        const targets = new Set([...state.reviews.filter(item => item.pieceId === piece.id), ...state.materials.filter(item => item.pieceId === piece.id)].map(item => item.id));
        for (const share of state.shares) if (share.scope !== 'calendar' && targets.has(share.targetId)) share.revokedAt ??= context.now;
      }
      activity(piece, captionChanged ? 'Texto actualizado; se requiere una nueva revisión.' : patch.archived ? 'Contenido archivado.' : 'Contenido actualizado.');
      entityId = piece.id;
      break;
    }
    case 'create-review': {
      const piece = findPiece(state, command.pieceId);
      if (piece.revision !== command.expectedRevision) fail('CONFLICT', 'El contenido cambió. Actualizá la vista antes de preparar otra revisión.');
      if (piece.status === 'published') fail('PUBLISHED_IMMUTABLE', 'Este contenido ya se publicó. Creá una nueva pieza para preparar otra versión.');
      validateAssets(command.assets);
      if (!command.assets.length) fail('VALIDATION', 'Agregá al menos un archivo para enviar a revisión.');
      if (typeof command.caption !== 'string') fail('VALIDATION', 'El texto no es válido.');
      const version = (latestReview(state, piece.id)?.version ?? 0) + 1;
      invalidateReviews(state, piece);
      entityId = context.newId();
      state.reviews.push({ id: entityId, pieceId: piece.id, version, caption: command.caption, assets: structuredClone(command.assets), status: 'pending', createdAt: context.now, sentAt: null });
      piece.caption = command.caption;
      piece.status = 'review';
      activity(piece, `Versión ${version} preparada para revisión.`, 'client');
      break;
    }
    case 'respond-review': {
      const review = state.reviews.find(item => item.id === command.reviewId);
      if (!review) return fail('NOT_FOUND', 'No encontramos esa revisión.');
      const piece = findPiece(state, review.pieceId);
      required(command.idempotencyKey, 'La clave de la respuesta');
      const authorName = required(command.authorName, 'Tu nombre');
      if (typeof command.comment !== 'string') fail('VALIDATION', 'El comentario no es válido.');
      const comment = command.comment.trim();
      if (!['approved', 'changes', 'comment'].includes(command.kind)) fail('VALIDATION', 'La respuesta no es válida.');
      if (!['link', 'whatsapp'].includes(command.source)) fail('VALIDATION', 'El origen de la respuesta no es válido.');
      if (command.kind !== 'approved' && !comment) fail('VALIDATION', 'Escribí un comentario para continuar.');
      entityId = `response:${encodeURIComponent(review.id)}:${encodeURIComponent(command.idempotencyKey)}`;
      const existing = state.responses.find(item => item.id === entityId);
      if (existing) {
        if (command.version !== review.version || existing.kind !== command.kind || existing.comment !== comment || existing.authorName !== authorName || existing.source !== command.source) fail('IDEMPOTENCY_CONFLICT', 'Esa respuesta ya se registró con otros datos.');
        return { state, entityId };
      }
      if (review.version !== command.version || latestReview(state, piece.id)?.id !== review.id || review.status !== 'pending' || piece.status !== 'review' || review.caption !== piece.caption) fail('STALE_REVIEW', 'Esta versión ya no está pendiente. Abrí la revisión actual.');
      state.responses.push({ id: entityId, reviewId: review.id, kind: command.kind, comment, authorName, source: command.source, recordedBy: command.source === 'whatsapp' ? context.actor : null, createdAt: context.now });
      if (command.kind === 'approved') { review.status = 'approved'; piece.status = 'approved'; }
      if (command.kind === 'changes') { review.status = 'changes'; piece.status = 'production'; }
      activity(piece, command.kind === 'approved' ? `Versión ${review.version} aprobada.` : command.kind === 'changes' ? `Cambios solicitados para la versión ${review.version}.` : `Comentario recibido en la versión ${review.version}.`, 'client');
      break;
    }
    case 'create-material': {
      const piece = findPiece(state, command.pieceId);
      validateDate(command.dueDate);
      if (state.materials.some(item => item.pieceId === piece.id && item.status !== 'complete')) fail('ACTIVE_REQUEST', 'Ya hay un pedido de material abierto para este contenido.');
      entityId = context.newId();
      state.materials.push({ id: entityId, pieceId: piece.id, instructions: required(command.instructions, 'Las instrucciones'), dueDate: command.dueDate, status: 'pending', assets: [], createdAt: context.now, sentAt: null });
      activity(piece, 'Pedido de material preparado.', 'client');
      break;
    }
    case 'receive-material': {
      const request = state.materials.find(item => item.id === command.requestId);
      if (!request) return fail('NOT_FOUND', 'No encontramos ese pedido.');
      const piece = findPiece(state, request.pieceId);
      if (request.status === 'complete') fail('REQUEST_COMPLETE', 'Este pedido ya fue completado.');
      validateAssets(command.assets);
      if (!command.assets.length) fail('VALIDATION', 'Agregá al menos un archivo.');
      let added = false;
      for (const asset of command.assets) {
        const existing = request.assets.find(item => item.id === asset.id);
        if (existing && !sameAsset(existing, asset)) fail('ASSET_CONFLICT', 'Ese archivo ya fue registrado con otros datos.');
        if (!existing) { request.assets.push(structuredClone(asset)); added = true; }
      }
      if (added) { request.status = 'received'; activity(piece, 'Material recibido; falta la verificación de Aramis.', 'client'); }
      entityId = request.id;
      break;
    }
    case 'complete-material':
    case 'reopen-material': {
      const request = state.materials.find(item => item.id === command.requestId);
      if (!request) return fail('NOT_FOUND', 'No encontramos ese pedido.');
      const piece = findPiece(state, request.pieceId);
      if (command.type === 'complete-material') {
        if (!request.assets.length) fail('MATERIAL_REQUIRED', 'Registrá el material recibido antes de completar el pedido.');
        if (request.status === 'complete') return { state, entityId: request.id };
        request.status = 'complete';
        activity(piece, 'Aramis verificó y completó el pedido de material.', 'client');
      } else {
        if (state.materials.some(item => item.pieceId === piece.id && item.id !== request.id && item.status !== 'complete')) fail('ACTIVE_REQUEST', 'Ya hay otro pedido abierto para este contenido.');
        request.status = 'pending';
        activity(piece, 'Se solicitó material adicional.', 'client');
      }
      entityId = request.id;
      break;
    }
    case 'create-share': {
      if (!['calendar', 'review', 'material'].includes(command.scope)) fail('VALIDATION', 'El alcance del enlace no es válido.');
      const piece = targetPiece(state, command.scope, command.targetId);
      if (command.scope === 'review') {
        const review = state.reviews.find(item => item.id === command.targetId)!;
        if (review.status === 'superseded' || latestReview(state, review.pieceId)?.id !== review.id) fail('STALE_REVIEW', 'No se puede compartir una versión anterior.');
      }
      const existing = state.shares.find(item => item.scope === command.scope && item.targetId === command.targetId && !item.revokedAt);
      if (existing) return { state, entityId: existing.id };
      const token = required(context.token(), 'El enlace');
      if (state.shares.some(item => item.token === token)) fail('TOKEN_CONFLICT', 'No se pudo generar un enlace único.');
      entityId = context.newId();
      state.shares.push({ id: entityId, token, scope: command.scope, targetId: command.targetId, clientId: piece?.clientId ?? command.targetId, revokedAt: null, createdAt: context.now });
      break;
    }
    case 'revoke-share': {
      const share = state.shares.find(item => item.id === command.shareId);
      if (!share) return fail('NOT_FOUND', 'No encontramos ese enlace.');
      share.revokedAt ??= context.now;
      entityId = share.id;
      break;
    }
    case 'mark-sent': {
      targetPiece(state, command.scope, command.targetId);
      const request = command.scope === 'review' ? state.reviews.find(item => item.id === command.targetId)! : state.materials.find(item => item.id === command.targetId)!;
      const piece = findPiece(state, request.pieceId);
      if (command.scope === 'review' && (latestReview(state, piece.id)?.id !== request.id || (request as Review).status !== 'pending')) fail('STALE_REVIEW', 'Sólo se puede marcar el envío de la revisión pendiente.');
      if (command.scope === 'material' && request.status === 'complete') fail('REQUEST_COMPLETE', 'Este pedido ya está completo.');
      if (!state.shares.some(item => item.scope === command.scope && item.targetId === command.targetId && !item.revokedAt)) fail('SHARE_REQUIRED', 'Prepará el enlace antes de registrar el envío.');
      request.sentAt = context.now;
      activity(piece, 'Envío por WhatsApp registrado.');
      entityId = request.id;
      break;
    }
    default: return fail('UNKNOWN_COMMAND', 'La operación no está admitida.');
  }
  return { state, entityId };
}
