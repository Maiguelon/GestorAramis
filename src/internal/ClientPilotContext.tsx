import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Piece } from '../../contracts/domain';
import type { PilotAction, PilotStaffView } from '../../contracts/client-pilot';
import { PilotError, staffPilot } from '../lib/client-pilot';
import { sharedWorkspace } from '../lib/shared-api';
import './client-pilot.css';

type PendingAction = PilotAction & { key: string };
interface Controller {
  view: PilotStaffView | null;
  error: string;
  notice: string;
  busy: boolean;
  pending: PendingAction | null;
  refresh: () => Promise<void>;
  save: (action: PilotAction, retry?: PendingAction) => Promise<boolean>;
}
const Context = createContext<Controller | null>(null);
export const useClientPilot = () => useContext(Context);

/** The header toggle and review tab share one publication state and retry boundary. */
export function ClientPilotProvider({ clientId, revision, children }: { clientId: string; revision?: number; children: ReactNode }) {
  const [view, setView] = useState<PilotStaffView | null>(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false), [pending, setPending] = useState<PendingAction | null>(null);
  const readSerial = useRef(0), busyRef = useRef(false), pendingRef = useRef<PendingAction | null>(null);

  const refresh = useCallback(async () => {
    if (pendingRef.current) return;
    const serial = ++readSerial.current;
    try {
      const data = await staffPilot({ action: 'staff-view', clientId });
      if (serial === readSerial.current && !pendingRef.current) { setView(data); setError(''); }
    } catch (error) {
      if (serial === readSerial.current && !pendingRef.current) setError(error instanceof Error ? error.message : 'No pudimos cargar el acceso.');
    }
  }, [clientId]);
  useEffect(() => { void refresh(); }, [refresh, revision]);
  useEffect(() => {
    const update = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = setInterval(update, 30_000);
    window.addEventListener('focus', update);
    return () => { clearInterval(timer); window.removeEventListener('focus', update); };
  }, [refresh]);

  async function save(action: PilotAction, retry?: PendingAction) {
    if (busyRef.current || (pendingRef.current && !retry)) return false;
    const payload = retry ?? { ...action, key: crypto.randomUUID() };
    busyRef.current = true;
    pendingRef.current = payload;
    readSerial.current++;
    setBusy(true); setPending(payload); setError(''); setNotice('');
    try {
      const data = await staffPilot(payload);
      readSerial.current++;
      setView(data); setPending(null); pendingRef.current = null; setNotice('Cambio guardado.');
      void sharedWorkspace.refresh();
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No pudimos confirmar el cambio.');
      if (error instanceof PilotError && ['VALIDATION', 'CONFLICT', 'INVALID_TRANSITION', 'NOT_FOUND', 'forbidden'].includes(error.code)) {
        setPending(null); pendingRef.current = null; void sharedWorkspace.refresh();
      }
      return false;
    } finally { busyRef.current = false; setBusy(false); }
  }

  return <Context.Provider value={{ view, error, notice, busy, pending, refresh, save }}>{children}</Context.Provider>;
}

export function ClientPilotFeedback() {
  const state = useClientPilot();
  if (!state) return null;
  return <>{state.error && <div role="alert" className="error-banner">{state.error}{state.pending && <button type="button" className="button secondary" disabled={state.busy} onClick={() => void state.save(state.pending!, state.pending!)}>Reintentar la misma operación</button>}</div>}{state.notice && <p role="status" className="notice-banner">{state.notice}</p>}</>;
}

export function ClientCalendarVisibility({ piece, disabled, onBusy }: { piece: Piece; disabled: boolean; onBusy: (value: boolean) => void }) {
  const state = useClientPilot();
  const pending = !!state?.pending, busy = !!state?.busy;
  useEffect(() => { onBusy(busy || pending); return () => onBusy(false); }, [busy, pending, onBusy]);
  if (!state) return null;
  const visible = !!state.view?.pieces.some(p => p.id === piece.id);
  return <div className="piece-client-visibility">
    <label className="visibility-field">
      <input type="checkbox" checked={visible} disabled={disabled || busy || pending || !state.view} onChange={() => {
        if (visible && !confirm('¿Ocultar del calendario? También se retiran las revisiones pendientes de esta pieza.')) return;
        void state.save({ action: visible ? 'calendar-hide' : 'calendar-show', clientId: piece.clientId, pieceId: piece.id, expectedRevision: piece.revision });
      }}/>
      <span><strong>Mostrar en el calendario del cliente</strong><small>{!state.view ? 'Cargando visibilidad…' : visible ? 'Visible: título, formato, fecha y estado. Las revisiones se comparten en Cliente.' : 'Comparte título, formato, fecha y estado. Las revisiones se comparten en Cliente.'}</small></span>
    </label>
    <ClientPilotFeedback/>
  </div>;
}
