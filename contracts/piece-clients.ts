import type { Client, Piece } from './domain';

/** clientId remains the stable storage anchor; clientIds is a fixed recipient selection. */
export function pieceClientIds(piece: Pick<Piece, 'clientId' | 'clientIds'>): string[] {
  return piece.clientIds?.length ? piece.clientIds : [piece.clientId];
}
export function isMultiClient(piece: Pick<Piece, 'clientId' | 'clientIds'>): boolean {
  return pieceClientIds(piece).length > 1;
}
export function belongsToClient(piece: Pick<Piece, 'clientId' | 'clientIds'>, clientId: string): boolean {
  return pieceClientIds(piece).includes(clientId);
}
export function clientsForPiece(piece: Pick<Piece, 'clientId' | 'clientIds'>, clients: Client[]): Client[] {
  return pieceClientIds(piece).flatMap(id => clients.find(client => client.id === id) ?? []);
}
export function pieceClientNames(piece: Pick<Piece, 'clientId' | 'clientIds'>, clients: Client[]): string {
  return clientsForPiece(piece, clients).map(client => client.name).join(', ');
}
export function pieceClientLabel(piece: Pick<Piece, 'clientId' | 'clientIds'>, clients: Client[]): string {
  const names = clientsForPiece(piece, clients).map(client => client.name);
  return names.length > 2 ? `${names.slice(0, 2).join(', ')} y ${names.length - 2} más` : names.join(', ');
}
