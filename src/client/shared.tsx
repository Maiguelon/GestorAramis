import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowUpRight, ShieldCheck } from 'lucide-react';
import type { ClientView } from '../../contracts/domain';
import { readClientView, subscribe } from '../lib/api';

export function useClientView(token: string) {
  const read = () => {
    try { return { view: readClientView(token), error: '' }; }
    catch (error) { return { view: null, error: error instanceof Error ? error.message : 'No pudimos abrir este enlace.' }; }
  };
  const [result, setResult] = useState<{ view: ClientView | null; error: string }>(read);
  useEffect(() => {
    setResult(read());
    return subscribe(() => setResult(read()));
  }, [token]);
  return result;
}

export function dateLabel(value: string | null, options?: Intl.DateTimeFormatOptions) {
  if (!value) return 'Fecha por definir';
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('es-AR', options ?? { day: 'numeric', month: 'long' }).format(new Date(year, month - 1, day));
}

export function bytesLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ClientHeader({ name, page }: { name: string; page: string }) {
  return <>
    <div className="client-demo"><span><i /> Demostración · datos ficticios locales</span><a href="/">Volver al equipo <ArrowUpRight size={13} /></a></div>
    <header className="client-header"><a href="/" className="client-brand" aria-label="Aramís, volver al equipo"><span className="client-brand-symbol">a.</span><span>aramís<span className="client-brand-sub">ESTUDIO CREATIVO</span></span></a><div className="client-header-right"><span>{name}</span><small>{page}</small></div></header>
  </>;
}

export function ClientFooter() {
  return <footer className="client-footer"><span>Hecho con intención. Por <strong>aramís.</strong></span><span><ShieldCheck size={14} /> Enlace privado</span></footer>;
}

export function Unavailable({ error }: { error: string }) {
  return <div className="client-app"><ClientHeader name="Tu espacio" page="Acceso por enlace" /><main className="client-unavailable"><span className="client-section-kicker">NO PUDIMOS ABRIRLO</span><h1>Este enlace no está disponible.</h1><p>{error || 'Pedile al equipo de Aramís un enlace actualizado.'}</p><p>Si te llegó por WhatsApp, podés responder en ese mismo chat para pedir uno nuevo.</p><a className="client-btn client-btn-secondary" href="/"><ArrowLeft size={16} /> Volver a la demostración</a></main><ClientFooter /></div>;
}
