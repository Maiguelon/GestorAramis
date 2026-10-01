import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences, type NotificationSettings } from '../../contracts/notifications';
import { APP_MODE } from './api';
import { SharedApiError,sharedWorkspace } from './shared-api';

export interface PreferenceSave {requestId:string;preferences:Omit<NotificationPreferences,'revision'>&{expectedRevision:number}}
export class NotificationSettingsError extends Error { constructor(message:string,public definitive=false){super(message);} }
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function validPreferences(v:unknown):v is NotificationPreferences{
 return object(v)&&['design','marketing','unassigned'].includes(String(v.audience))
  &&['daily','six_hours','hourly','immediate'].includes(String(v.cadence))&&typeof v.enabled==='boolean'
  &&typeof v.dailyTime==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v.dailyTime)
  &&Number.isInteger(v.revision)&&Number(v.revision)>=0;
}
async function request(body?:PreferenceSave):Promise<NotificationSettings>{
 let response:Response;
 try{response=await sharedWorkspace.authenticatedFetch('/api/notifications/preferences',body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});}
 catch(error){
  if(error instanceof SharedApiError)throw new NotificationSettingsError(error.message);
  throw new NotificationSettingsError(body?'No pudimos confirmar el guardado. Usá Reintentar guardado.':'No pudimos cargar los avisos. Revisá la conexión y volvé a intentar.');
 }
 const value:unknown=await response.json().catch(()=>null);
 if(!response.ok){
  const code=object(value)?String(value.code):'';
  const message=code==='CONFLICT'?'La configuración cambió en otra pestaña. Tu selección sigue acá; cargá la configuración actual antes de volver a guardar.'
   :response.status===401?'La sesión venció. Volvé a ingresar.'
   :response.status===403?'Tu cuenta no tiene acceso a estos avisos.'
   :response.status===400?'Revisá el área, la frecuencia y el horario elegidos.'
   :'No pudimos confirmar la configuración. Volvé a intentar.';
  throw new NotificationSettingsError(message,response.status>=400&&response.status<500&&![408,425,429].includes(response.status));
 }
 if(!object(value)||!validPreferences(value.preferences)||typeof value.sendingEnabled!=='boolean')throw new NotificationSettingsError('El servicio devolvió una configuración incompleta.');
 return value as unknown as NotificationSettings;
}
const demoKey=(member:string)=>`aramis.notification.demo.v1.${member}`;
function demoRecord(member:string):Record<string,unknown>|null{
 const raw=localStorage.getItem(demoKey(member));
 try{const value:unknown=raw?JSON.parse(raw):null;return object(value)?value:null;}catch{return null;}
}
export async function readNotificationSettings(member:string):Promise<NotificationSettings>{
 if(APP_MODE!=='demo')return request();
 const record=demoRecord(member),pref=record?.preferences??record;
 return {preferences:validPreferences(pref)?pref:{...DEFAULT_NOTIFICATION_PREFERENCES},sendingEnabled:false,lastEmail:null};
}
export async function saveNotificationSettings(member:string,operation:PreferenceSave):Promise<NotificationSettings>{
 if(APP_MODE!=='demo')return request(operation);
 const receipt=demoRecord(member);
 if(receipt?.requestId===operation.requestId){
  if(JSON.stringify(receipt.operation)!==JSON.stringify(operation))throw new NotificationSettingsError('Ese guardado corresponde a otra configuración.',true);
  return readNotificationSettings(member);
 }
 const current=await readNotificationSettings(member);
 if(current.preferences.revision!==operation.preferences.expectedRevision)throw new NotificationSettingsError('La configuración cambió. Cargá la configuración actual.',true);
 const {expectedRevision,...fields}=operation.preferences;
 const preferences={...fields,revision:expectedRevision+1};
 if(!validPreferences(preferences))throw new NotificationSettingsError('Revisá la configuración.',true);
 // Preference and replay receipt are committed in a single localStorage write.
 localStorage.setItem(demoKey(member),JSON.stringify({preferences,requestId:operation.requestId,operation}));
 return {...current,preferences};
}

// Separate from business-command journal: an uncertain settings write must replay its own UUID.
export const preferenceJournalKey=(member:string)=>`aramis.notification.pending.v1.${APP_MODE}.${member}`;
export function readPreferenceSave(member:string):PreferenceSave|null{
 const raw=sessionStorage.getItem(preferenceJournalKey(member));if(!raw)return null;
 const v:unknown=JSON.parse(raw);
 if(!object(v)||typeof v.requestId!=='string'||!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(v.requestId)||!object(v.preferences)
   ||!validPreferences({...v.preferences,revision:v.preferences.expectedRevision}))throw new NotificationSettingsError('No pudimos recuperar el guardado pendiente.');
 return v as unknown as PreferenceSave;
}
