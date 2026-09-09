import { useSyncExternalStore } from 'react';
import type { Command, CommandResult } from '../../contracts/domain';
import { sharedWorkspace } from '../lib/shared-api';

export function hasPendingSave(type: Command['type'], targetId?: string) {
  const command = sharedWorkspace.getPendingCommand();
  return !!command && command.type === type && (!targetId || ('clientId' in command && command.clientId === targetId) || ('pieceId' in command && command.pieceId === targetId));
}
export default function PendingSave({ type, targetId, onConfirmed, onError }: { type: Command['type']; targetId?: string; onConfirmed: (result: CommandResult) => void; onError: (message: string) => void }) {
  const snapshot = useSyncExternalStore(sharedWorkspace.subscribe, sharedWorkspace.getSnapshot);
  if (!snapshot.uncertain || !hasPendingSave(type, targetId)) return null;
  return <div className="notice-banner"><p>El cambio sigue pendiente de confirmación. Podés verificarlo sin enviarlo como una operación nueva.</p><button type="button" className="button secondary" disabled={snapshot.busy} onClick={async () => { try { const result = await sharedWorkspace.retryPending(); if (result) onConfirmed(result); } catch (error) { onError(error instanceof Error ? error.message : 'No pudimos confirmar el guardado.'); } }}>Reintentar guardado</button></div>;
}
