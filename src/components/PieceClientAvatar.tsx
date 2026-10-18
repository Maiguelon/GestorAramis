import type { Client, Piece } from '../../contracts/domain';
import { Users } from 'lucide-react';
import { clientsForPiece, isMultiClient, pieceClientIds, pieceClientNames } from '../../contracts/piece-clients';
import ClientAvatar from './ClientAvatar';
import '../internal/multi-client.css';

export default function PieceClientAvatar({ piece, clients }: { piece: Piece; clients: Client[] }) {
  const selected = clientsForPiece(piece, clients);
  if (!isMultiClient(piece)) return selected[0] ? <ClientAvatar client={selected[0]}/> : null;
  return <span className="client-avatar multi-client-avatar" role="img" aria-label={`Multicliente · ${pieceClientIds(piece).length} clientes`} title={`Multicliente: ${pieceClientNames(piece, clients)}`}>
    <Users size={21} aria-hidden="true"/>
  </span>;
}
