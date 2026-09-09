import { createContext, useContext, useEffect, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { createClient, type Session } from '@supabase/supabase-js';
import { sharedWorkspace } from '../lib/shared-api';
import './staff-access.css';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
let client: ReturnType<typeof createClient> | null = null;
try {
  if (url && publishableKey && new URL(url).protocol === 'https:') client = createClient(url, publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
} catch { /* Missing or malformed configuration never falls back to demo. */ }
const StaffContext = createContext<{ signOut: () => Promise<void>; email: string }>({ signOut: async () => {}, email: '' });
export const useStaffAccess = () => useContext(StaffContext);

export default function StaffAccess({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [starting, setStarting] = useState(true);
  const [notice, setNotice] = useState('');
  const snapshot = useSyncExternalStore(sharedWorkspace.subscribe, sharedWorkspace.getSnapshot);
  useEffect(() => {
    if (!client) { setStarting(false); return; }
    let active = true, authEvents = 0;
    function accept(next: Session | null) {
      if (!active) return;
      sharedWorkspace.setSession(next?.user.id ?? null, next?.access_token ?? null);
      setSession(next); setStarting(false);
      if (next) void sharedWorkspace.refresh();
    }
    const { data } = client.auth.onAuthStateChange((_event, next) => { authEvents++; accept(next); });
    const revision = authEvents;
    void client.auth.getSession().then(({ data, error }) => { if (!active || authEvents !== revision) return; if (error) setNotice('No pudimos recuperar la sesión. Volvé a ingresar.'); accept(error ? null : data.session); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!session) return;
    const refresh = () => { if (document.visibilityState !== 'hidden') void sharedWorkspace.refresh(); };
    const timer = window.setInterval(refresh, 15_000);
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [session?.user.id]);
  async function signOut() {
    sharedWorkspace.setSession(null, null); setSession(null); setNotice('');
    try {
      const result = await client?.auth.signOut({ scope: 'local' });
      if (result?.error) setNotice('Cerramos la sesión en este navegador. No pudimos confirmar la revocación en el servicio; revisá tu conexión.');
    } catch { setNotice('Cerramos la vista. No pudimos completar el cierre de sesión; volvé a intentar con conexión antes de dejar este dispositivo.'); }
  }
  if (!client) return <AccessPage><h1>Falta configurar el acceso</h1><p>El equipo debe terminar la conexión con Supabase antes de abrir este entorno. Los datos de la demostración siguen separados.</p></AccessPage>;
  if (starting) return <AccessPage><h1>Abriendo el espacio…</h1></AccessPage>;
  if (!session) return <AccessPage><h1>Ingresar al equipo</h1><p>Usá la cuenta que te habilitó Aramis.</p>{notice && <p role="alert" className="error-banner">{notice}</p>}<LoginForm /></AccessPage>;
  if (!snapshot.workspace) return <AccessPage><h1>{snapshot.loading ? 'Cargando el espacio…' : 'No pudimos abrir el espacio'}</h1>{snapshot.error && <p role="alert" className="error-banner">{snapshot.error}</p>}<div className="settings-actions"><button className="button primary" disabled={snapshot.loading} onClick={() => void sharedWorkspace.refresh()}>Volver a intentar</button><button className="button secondary" onClick={() => void signOut()}>Cerrar sesión</button></div></AccessPage>;
  return <StaffContext.Provider value={{ signOut, email: session.user.email ?? '' }}>{children}</StaffContext.Provider>;
}
function AccessPage({ children }: { children: ReactNode }) { return <main className="staff-access-page"><section className="staff-access-card"><div className="staff-access-logo"><img src="/brand/aramis.svg" alt="Aramis" /></div>{children}</section></main>; }
function LoginForm() {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !client) return;
    const form = new FormData(event.currentTarget); setBusy(true); setError('');
    try {
      const { error } = await client.auth.signInWithPassword({ email: String(form.get('email')).trim(), password: String(form.get('password')) });
      if (error) setError(error.status === 429 ? 'Hubo varios intentos. Esperá unos minutos para volver a ingresar.'
        : error.code === 'invalid_credentials' || error.status === 400 && error.message === 'Invalid login credentials' ? 'No pudimos ingresar: el correo o la contraseña no coinciden con la cuenta de Gestor Aramis.'
        : error.code === 'email_not_confirmed' ? 'El correo de esta cuenta todavía no está confirmado. Revisá su alta en Supabase.'
        : !error.status || error.status >= 500 ? 'No pudimos conectar con el servicio de acceso. Revisá tu conexión y volvé a intentar.'
        : 'No pudimos ingresar. Revisá correo, contraseña y conexión.');
    } catch { setError('No pudimos conectar. Revisá tu conexión y volvé a intentar.'); }
    finally { setBusy(false); }
  }
  return <form className="form-stack" onSubmit={submit}><label>Correo<input type="email" name="email" autoComplete="username" required disabled={busy} autoFocus /></label><label>Contraseña<input type="password" name="password" autoComplete="current-password" required disabled={busy} /></label>{error && <p role="alert" className="error-banner">{error}</p>}<button className="button primary" type="submit" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</button><p className="form-hint">Si necesitás acceso o recuperar tu contraseña, contactá a quien administra el espacio.</p></form>;
}
