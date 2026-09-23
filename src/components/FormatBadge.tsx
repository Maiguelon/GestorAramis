import type { ContentFormat } from '../../contracts/domain';
import { FORMAT_LABELS } from '../../contracts/domain';
import './format-badge.css';

export default function FormatBadge({ format }: { format: ContentFormat }) {
  return <span className={`format-badge format-${format}`}>{FORMAT_LABELS[format]}</span>;
}
