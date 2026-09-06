import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PieceStatus } from '../../contracts/domain';
import { STATUS_LABELS } from '../../contracts/domain';
export function Status({ status }: { status: PieceStatus }) { return <span className={`status-pill status-${status}`}><i />{STATUS_LABELS[status]}</span>; }
export function Modal({ open, onClose, title, description, children, wide = false }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; wide?: boolean }) {
  return <Dialog.Root open={open} onOpenChange={value => { if (!value) onClose(); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className={`dialog-content ${wide ? 'dialog-wide' : ''}`} aria-describedby={description ? undefined : undefined}><div className="dialog-heading"><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description className={description ? '' : 'sr-only'}>{description || 'Gestioná los datos de esta pieza de contenido.'}</Dialog.Description></div><Dialog.Close className="icon-button" aria-label="Cerrar"><X size={20} /></Dialog.Close></div>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function Empty({ children }: { children: ReactNode }) { return <div className="empty-state">{children}</div>; }
