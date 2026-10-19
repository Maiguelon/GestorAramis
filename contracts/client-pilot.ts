/** Explicit allowlists: never serialize a private Piece/Delivery into this contract. */
export interface PilotAsset { id: string; name: string; mimeType: string; size: number }
export interface PilotRequest {
  id: string; pieceId: string; kind: 'script' | 'delivery'; version: number;
  text: string; assets: PilotAsset[]; status: 'pending' | 'approved' | 'changes' | 'superseded';
  canRespond: boolean; comment: string; createdAt: string;
  /** Optional for legacy publications. New snapshots review content and caption independently. */
  separateParts?: boolean; caption?: string;
  contentStatus?: 'pending' | 'approved' | 'changes' | null;
  captionStatus?: 'pending' | 'approved' | 'changes' | null;
  comments: { text: string; author: string; createdAt: string }[];
}
export interface PilotPiece { id: string; title: string; format: 'reel' | 'post' | 'carousel' | 'story'; plannedDate: string | null; status: string }
export interface PilotView {
  client: { id: string; name: string; initials: string; color: string };
  pieces: PilotPiece[]; requests: PilotRequest[];
}
export interface PilotStaffView extends PilotView { linkActive: boolean; linkUrl?: string }
export type PilotAction =
  | { action: 'link-ensure' | 'link-rotate' | 'link-revoke'; clientId: string }
  | { action: 'calendar-show' | 'calendar-hide'; clientId: string; pieceId: string; expectedRevision: number }
  | { action: 'publish'; clientId: string; pieceId: string; expectedRevision: number; kind: 'script' | 'delivery'; text?: string; deliveryId?: string; separateParts?: boolean }
  | { action: 'withdraw'; clientId: string; requestId: string };
