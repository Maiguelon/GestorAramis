import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Mail,Save} from 'lucide-react';
import type {NotificationPreferences,NotificationSettings as Settings} from '../../contracts/notifications';
import {APP_MODE} from '../lib/api';
import {NotificationSettingsError,preferenceJournalKey,readNotificationSettings,readPreferenceSave,saveNotificationSettings,type PreferenceSave} from '../lib/notifications';
import './notification-settings.css';

export default function NotificationSettings({memberId}:{memberId:string}){
 const [data,setData]=useState<Settings|null>(null),[draft,setDraft]=useState<NotificationPreferences|null>(null);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState<PreferenceSave|null>(null);
 const alive=useRef(true),section=useRef<HTMLElement>(null);
 async function load(){
  setError('');setNotice('');
  try{
   const saved=readPreferenceSave(memberId),next=await readNotificationSettings(memberId);
   if(!alive.current)return;
   setData(next);setPending(saved);
   setDraft(saved?{audience:saved.preferences.audience,cadence:saved.preferences.cadence,enabled:saved.preferences.enabled,dailyTime:saved.preferences.dailyTime,revision:saved.preferences.expectedRevision}:next.preferences);
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'No pudimos cargar los avisos.');}
 }
 useEffect(()=>{
  alive.current=true;void load();
  if(new URLSearchParams(location.search).get('settings')==='notifications')section.current?.scrollIntoView({block:'start'});
  return()=>{alive.current=false;};
 },[memberId]);
 async function submit(event?:FormEvent){
  event?.preventDefault();if(busy||!draft)return;setBusy(true);setError('');setNotice('');
  let operation=pending,recorded=!!pending;
  try{
   if(!operation){
    const {revision,...fields}=draft;
    operation={requestId:crypto.randomUUID(),preferences:{...fields,expectedRevision:revision}};
    try{sessionStorage.setItem(preferenceJournalKey(memberId),JSON.stringify(operation));}
    catch{throw new NotificationSettingsError('El navegador no permite guardar el reintento. Habilitá el almacenamiento del sitio y volvé a intentar.',true);}
    recorded=true;
    setPending(operation);
   }
   const next=await saveNotificationSettings(memberId,operation);
   sessionStorage.removeItem(preferenceJournalKey(memberId));
   if(alive.current){setData(next);setDraft(next.preferences);setPending(null);setNotice(APP_MODE==='demo'?'Preferencias guardadas en este navegador. No se envían correos.':'Preferencias guardadas.');}
  }catch(e){
   if(e instanceof NotificationSettingsError&&e.definitive){
    let cleared=!recorded;
    try{sessionStorage.removeItem(preferenceJournalKey(memberId));cleared=true;}catch{/* Retain a recorded request until browser storage works again. */}
    if(cleared&&alive.current)setPending(null);
   }
   if(alive.current)setError(e instanceof Error?e.message:'No pudimos confirmar el guardado. Usá Reintentar guardado.');
  }finally{if(alive.current)setBusy(false);}
 }
 return <section className="settings-card notification-settings" id="notifications" ref={section}>
  <h2><Mail size={19}/>Avisos por correo</h2>
  <p>Diseño recibe piezas para producir y devoluciones. Marketing recibe entregas para revisar.</p>
  {APP_MODE==='demo'?<p className="notice-banner">Demostración local: estas preferencias no envían correos.</p>:data&&!data.sendingEnabled&&<p className="notice-banner">El envío de correos todavía no está activado. Podés dejar tus preferencias guardadas.</p>}
  {error&&<p role="alert" className="error-banner">{error}</p>}
  {!draft?<><p>Cargando configuración…</p>{error&&<button className="button secondary" onClick={()=>void load()}>Volver a intentar</button>}</>:<form onSubmit={submit} className="form-stack">
   <fieldset disabled={busy||!!pending}>
    <label className="notification-toggle"><input type="checkbox" checked={draft.enabled} onChange={e=>setDraft({...draft,enabled:e.target.checked})}/><span>Recibir avisos por correo</span></label>
    <div className="notification-fields">
     <label>Avisos de<select aria-label="Avisos de" value={draft.audience} onChange={e=>setDraft({...draft,audience:e.target.value as NotificationPreferences['audience']})}><option value="unassigned">Elegir área</option><option value="design">Diseño · para producción</option><option value="marketing">Marketing · para revisión</option></select></label>
     <label>Frecuencia<select aria-label="Frecuencia" value={draft.cadence} onChange={e=>setDraft({...draft,cadence:e.target.value as NotificationPreferences['cadence']})}><option value="daily">Una vez al día</option><option value="six_hours">Cada seis horas</option><option value="hourly">Cada hora</option><option value="immediate">Inmediato</option></select></label>
     {draft.cadence==='daily'&&<label>Horario del resumen<input aria-label="Horario del resumen" type="time" required value={draft.dailyTime} onChange={e=>setDraft({...draft,dailyTime:e.target.value})}/><small>Hora de Argentina</small></label>}
    </div>
   </fieldset>
   <p className="form-hint">{draft.audience==='unassigned'?'Elegí tu área para empezar a recibir novedades. ':''}{draft.cadence==='immediate'?'Se avisa al guardar el cambio o en la siguiente comprobación, aproximadamente en un minuto.':draft.cadence==='daily'?'Se envía un resumen en el horario elegido, sólo si hay novedades que sigan pendientes.':draft.cadence==='hourly'?'Se agrupan las novedades pendientes al inicio de cada hora de Argentina.':'Se agrupan las novedades pendientes a las 00:00, 06:00, 12:00 y 18:00 de Argentina.'}</p>
   {pending&&<p className="notice-banner">Quedó un guardado pendiente de confirmación. Reintentalo para verificarlo sin duplicar el cambio.</p>}
   <div className="settings-actions"><button type="submit" className="button primary" disabled={busy}><Save size={16}/>{busy?'Guardando…':pending?'Reintentar guardado':'Guardar avisos'}</button>{error&&!pending&&<button type="button" className="button secondary" onClick={()=>void load()}>Cargar configuración actual</button>}</div>
   {notice&&<p role="status">{notice}</p>}
  </form>}
  {data?.lastEmail&&<p className={data.lastEmail.status==='needs_review'?'error-banner':'form-hint'}>{data.lastEmail.status==='needs_review'?'Hay un envío que necesita revisión. Los avisos están retenidos hasta resolverlo.':data.lastEmail.status==='retry'?'Hay un envío pendiente; se reintentará automáticamente.':data.lastEmail.status==='sent'?`Último aviso enviado: ${new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',dateStyle:'short',timeStyle:'short'}).format(new Date(data.lastEmail.at))}`:'Las novedades se comprobarán antes del envío.'}</p>}
 </section>;
}
