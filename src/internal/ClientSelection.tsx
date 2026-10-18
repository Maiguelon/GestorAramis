import { useEffect, useId, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Client } from '../../contracts/domain';
import ClientAvatar from '../components/ClientAvatar';
import './multi-client.css';

export default function ClientSelection({ clients, multiple, selected, onMultiple, onChange }: {
  clients: Client[]; multiple: boolean; selected: string[];
  onMultiple: (value: boolean) => void; onChange: (ids: string[]) => void;
}) {
  const id = useId();
  const dropdown = useRef<HTMLDetailsElement>(null);
  const chosen = selected.flatMap(id => clients.find(client => client.id === id) ?? []);
  const all = clients.length > 0 && clients.every(client => selected.includes(client.id));
  const summary = all ? `Todos los clientes · ${chosen.length}` : chosen.length > 2
    ? `${chosen.slice(0, 2).map(client => client.name).join(', ')} y ${chosen.length - 2} más`
    : chosen.map(client => client.name).join(', ') || 'Elegí los clientes';
  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !dropdown.current?.contains(event.target) && dropdown.current) dropdown.current.open = false;
    }
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);
  function toggle(clientId: string, checked: boolean) {
    onChange(checked ? [...selected, clientId] : selected.filter(id => id !== clientId));
  }
  return <div className="client-selection">
    <div className="client-selection-heading">
      <label id={`${id}-label`} htmlFor={multiple ? undefined : id}>{multiple ? 'Clientes' : 'Cliente'}</label>
      <label className="multi-client-toggle"><input type="checkbox" checked={multiple} onChange={event => onMultiple(event.target.checked)}/>Varios clientes</label>
    </div>
    {multiple ? <details ref={dropdown} className="client-selection-dropdown" onKeyDown={event => {
      if (event.key === 'Escape' && dropdown.current?.open) { event.preventDefault(); event.stopPropagation(); dropdown.current.open = false; }
    }}>
      <summary aria-labelledby={`${id}-label ${id}-summary`}><span id={`${id}-summary`}>{summary}</span><ChevronDown size={16}/></summary>
      <div className="client-selection-options" role="group" aria-label="Seleccionar clientes">
        <label className="client-selection-all"><input type="checkbox" checked={all} onChange={event => onChange(event.target.checked ? [...selected, ...clients.filter(client => !selected.includes(client.id)).map(client => client.id)] : [])}/>Seleccionar todos</label>
        {clients.map(client => <label key={client.id}><input type="checkbox" aria-label={client.name} checked={selected.includes(client.id)} onChange={event => toggle(client.id, event.target.checked)}/><ClientAvatar client={client}/><span>{client.name}</span></label>)}
      </div>
    </details> : <select id={id} name="clientId" value={selected[0] ?? ''} onChange={event => onChange([event.target.value])} required>
      {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
    </select>}
  </div>;
}
