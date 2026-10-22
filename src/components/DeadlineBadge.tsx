import { Clock3 } from 'lucide-react';
import './deadline-badge.css';

export default function DeadlineBadge({ label }: { label: string | null }) {
  if (!label) return null;
  if (label === 'Fecha vencida') return <small>{label}</small>;
  return <small className={`deadline-badge deadline-${label === 'Vence hoy' ? 'today' : 'tomorrow'}`}><Clock3 size={12} aria-hidden="true"/><span>{label}</span></small>;
}
