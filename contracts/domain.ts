export type PieceStatus = 'planned' | 'production' | 'review' | 'approved' | 'scheduled' | 'published';
export type ContentFormat = 'reel' | 'carousel' | 'post' | 'story';
export type RequestStatus = 'pending' | 'received' | 'complete';
export type DecisionKind = 'approved' | 'changes' | 'comment';
export type ShareScope = 'calendar' | 'review' | 'material';

export type WorkArea = 'marketing' | 'design';
export type ProductionStage = 'ready' | 'recording' | 'editing';
export interface MonthlyPlan { posts: number; reels: number }
export interface Client { id: string; name: string; initials: string; color: string; contactName: string; phone: string; monthlyPlan?: MonthlyPlan; revision?: number; generatedMonths?: string[] }
export interface Member { id: string; name: string; initials: string }
export interface Asset { id: string; name: string; mimeType: string; size: number; url?: string; driveFileId?: string; checksum?: string; source: 'demo' | 'drive' }
export interface Piece { planMonth?: string; workArea?: WorkArea; productionStage?: ProductionStage; script?: string; teamAssets?: Asset[]; id: string; clientId: string; title: string; format: ContentFormat; status: PieceStatus; ownerId: string; plannedDate: string | null; visibleToClient: boolean; caption: string; internalNote: string; archived: boolean; revision: number; createdAt: string; updatedAt: string }
export interface Review { id: string; pieceId: string; version: number; caption: string; assets: Asset[]; status: 'pending' | 'approved' | 'changes' | 'superseded'; createdAt: string; sentAt: string | null }
export interface MaterialRequest { id: string; pieceId: string; instructions: string; dueDate: string | null; status: RequestStatus; assets: Asset[]; createdAt: string; sentAt: string | null }
export interface ResponseRecord { id: string; reviewId: string; kind: DecisionKind; comment: string; authorName: string; source: 'link' | 'whatsapp'; recordedBy: string | null; createdAt: string }
export interface Share { id: string; token: string; scope: ShareScope; targetId: string; clientId: string; revokedAt: string | null; createdAt: string }
export interface Activity { id: string; pieceId: string; text: string; actor: string; createdAt: string; visibility: 'internal' | 'client' }
export interface WorkspaceState { schemaVersion: 1; clients: Client[]; members: Member[]; pieces: Piece[]; reviews: Review[]; materials: MaterialRequest[]; responses: ResponseRecord[]; shares: Share[]; activities: Activity[] }
export type PublicPiece = Omit<Piece, 'internalNote' | 'ownerId' | 'planMonth' | 'workArea' | 'productionStage' | 'script' | 'teamAssets'>;
export interface ClientView { client: Pick<Client, 'id' | 'name' | 'initials' | 'color'>; pieces: PublicPiece[]; reviews: Review[]; materials: MaterialRequest[]; responses: ResponseRecord[]; activities: Activity[]; scope: ShareScope; targetId: string }

export type ClientInput = Pick<Client, 'name' | 'contactName' | 'phone'> & { monthlyPlan: MonthlyPlan };
export type Command =
 | { type: 'create-client'; input: ClientInput }
 | { type: 'update-client'; clientId: string; expectedRevision: number; patch: Partial<ClientInput> }
 | { type: 'generate-month'; clientId: string; month: string; ownerId: string }
 | { type: 'create-piece'; input: { clientId: string; title?: string; ownerId: string; planMonth?: string; workArea?: WorkArea; format?: ContentFormat; plannedDate?: string | null } }
 | { type: 'update-piece'; pieceId: string; expectedRevision: number; patch: Partial<Pick<Piece, 'title' | 'format' | 'ownerId' | 'plannedDate' | 'visibleToClient' | 'caption' | 'internalNote' | 'archived' | 'status' | 'planMonth' | 'workArea' | 'productionStage' | 'script' | 'teamAssets'>> }
 | { type: 'create-review'; pieceId: string; expectedRevision: number; caption: string; assets: Asset[] }
 | { type: 'respond-review'; reviewId: string; version: number; kind: DecisionKind; comment: string; authorName: string; source: 'link' | 'whatsapp'; idempotencyKey: string }
 | { type: 'create-material'; pieceId: string; instructions: string; dueDate: string | null }
 | { type: 'receive-material'; requestId: string; assets: Asset[] }
 | { type: 'complete-material'; requestId: string }
 | { type: 'reopen-material'; requestId: string }
 | { type: 'create-share'; scope: ShareScope; targetId: string }
 | { type: 'revoke-share'; shareId: string }
 | { type: 'mark-sent'; scope: 'review' | 'material'; targetId: string };
export interface CommandContext { actor: string; now: string; newId: () => string; token: () => string }
export interface CommandResult { state: WorkspaceState; entityId: string }
export const STATUS_LABELS: Record<PieceStatus, string> = { planned: 'En preparación', production: 'En producción', review: 'Para aprobar', approved: 'Aprobado', scheduled: 'Programado', published: 'Publicado' };
export const FORMAT_LABELS: Record<ContentFormat, string> = { reel: 'Reel', carousel: 'Carrusel', post: 'Post', story: 'Historia' };
