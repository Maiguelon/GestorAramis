import { pieceClientNames } from '../../contracts/piece-clients';
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { Copy, ArrowLeft, Pencil, Save } from 'lucide-react';
import { FORMAT_LABELS, type Command, type Piece } from '../../contracts/domain';
import { APP_MODE, useWorkspace } from '../lib/api';
import { sharedWorkspace } from '../lib/shared-api';
import PieceClientAvatar from '../components/PieceClientAvatar';
import './piece-text.css';

type Workspace = ReturnType<typeof useWorkspace>;
type TextDraft = {script:string;caption:string};
const textOf=(piece:Piece):TextDraft=>({script:piece.script??'',caption:piece.caption});
export default function PieceText({pieceId}:{pieceId:string}){
 const workspace=useWorkspace(),piece=workspace.state.pieces.find(item=>item.id===pieceId);
 useEffect(()=>{document.title=piece&&!piece.archived?`${piece.title} · Texto · Aramis`:'Texto no disponible · Aramis';},[piece?.title,piece?.archived]);
 if(!piece||!workspace.state.clients.some(item=>item.id===piece.clientId))return <Unavailable/>;
 return <TextPage key={pieceId} piece={piece} workspace={workspace}/>;
}
function Unavailable(){return <main className="piece-text-page"><h1>Esta pieza no está disponible</h1><p>Puede haberse archivado o no estar disponible en este espacio.</p><a className="button secondary" href="/">Volver al panel</a></main>;}
function TextPage({piece,workspace}:{piece:Piece;workspace:Workspace}){
 const {state,execute,error,shared,retryPending}=workspace;
 const restored=useRef(APP_MODE==='demo'?null:sharedWorkspace.getPendingCommand());
 const pendingText=restored.current?.type==='update-piece'&&restored.current.pieceId===piece.id&&Object.keys(restored.current.patch).every(k=>['script','caption'].includes(k))?restored.current:null;
 const [editing,setEditing]=useState(!!pendingText),[baseline,setBaseline]=useState(piece);
 const [draft,setDraft]=useState<TextDraft>(()=>({...textOf(piece),...pendingText?.patch}));
 const [notice,setNotice]=useState(''),[saveError,setSaveError]=useState(''),[saving,setSaving]=useState(false);
 const savingRef=useRef(false),leaving=useRef(false);
 const story=baseline.format==='story';
 const dirty=editing&&(draft.caption!==baseline.caption||(!story&&draft.script!==(baseline.script??'')));
 const conflict=dirty&&(baseline.revision!==piece.revision||baseline.format!==piece.format);
 const captionLocked=piece.status==='published'||(!!piece.deliveries?.length&&['review','approved','scheduled'].includes(piece.status));
 const uncertain=APP_MODE!=='demo'&&shared.uncertain,busy=saving||(APP_MODE!=='demo'&&shared.busy),blocked=busy||uncertain;
 const captionChanged=draft.caption!==baseline.caption;
 useEffect(()=>{if(!dirty&&!blocked&&baseline.revision!==piece.revision){setBaseline(piece);setDraft(textOf(piece));}},[piece,dirty,blocked,baseline.revision]);
 useEffect(()=>{
   if(!dirty&&!blocked)return;
   const protect=(event:BeforeUnloadEvent)=>{if(!leaving.current){event.preventDefault();event.returnValue='';}};
   window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect);
 },[dirty,blocked]);
 function adopt(saved:Piece){setDraft(textOf(saved));setBaseline(saved);setSaveError('');setNotice('Cambios guardados.');}
 async function save(){
   if(savingRef.current||blocked||!dirty||conflict||piece.archived||(captionLocked&&captionChanged))return;
   const patch:Extract<Command,{type:'update-piece'}>['patch']={};
   if(!story&&draft.script!==(baseline.script??''))patch.script=draft.script;
   if(captionChanged)patch.caption=draft.caption;
   savingRef.current=true;setSaving(true);setSaveError('');setNotice('');
   try{const result=await execute({type:'update-piece',pieceId:piece.id,expectedRevision:baseline.revision,patch});const saved=result.state.pieces.find(p=>p.id===piece.id);if(saved)adopt(saved);}
   catch(e){setSaveError(e instanceof Error?e.message:'No pudimos guardar los cambios.');}
   finally{savingRef.current=false;setSaving(false);}
 }
 async function retry(){
   if(savingRef.current||busy)return;
   savingRef.current=true;setSaving(true);setSaveError('');const pending=sharedWorkspace.getPendingCommand();
   try{const result=await retryPending();const saved=result?.state.pieces.find(p=>p.id===piece.id);
     if(saved&&pending?.type==='update-piece'&&pending.pieceId===piece.id&&Object.keys(pending.patch).every(k=>['script','caption'].includes(k)))adopt(saved);
   }catch(e){setSaveError(e instanceof Error?e.message:'No pudimos confirmar el guardado.');}
   finally{savingRef.current=false;setSaving(false);}
 }
 const saveRef=useRef(save);saveRef.current=save;
 useEffect(()=>{const shortcut=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();void saveRef.current();}};window.addEventListener('keydown',shortcut);return()=>window.removeEventListener('keydown',shortcut);},[]);
 function start(){setBaseline(piece);setDraft(textOf(piece));setEditing(true);setNotice('');setSaveError('');}
 function discard(){if(blocked||dirty&&!confirm('¿Descartar los cambios sin guardar?'))return;setBaseline(piece);setDraft(textOf(piece));setSaveError('');setNotice('');setEditing(false);}
 function reload(){if(blocked||dirty&&!confirm('¿Cargar la versión actual y descartar tu borrador?'))return;setBaseline(piece);setDraft(textOf(piece));setSaveError('');setNotice('Datos actuales cargados.');}
 function navigate(event:MouseEvent<HTMLAnchorElement>){
   if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
   if(blocked){event.preventDefault();setSaveError('Esperá a que termine el guardado o reintentá para confirmarlo.');return;}
   if(dirty){if(!confirm('¿Salir y descartar los cambios sin guardar?'))event.preventDefault();else leaving.current=true;}
 }
 async function copy(text:string){try{await navigator.clipboard.writeText(text);setNotice('Texto copiado.');}catch{setNotice('No se pudo copiar. Podés seleccionar el texto y copiarlo manualmente.');}}
 const update=(field:keyof TextDraft,value:string)=>{setDraft(current=>({...current,[field]:value}));setNotice('');};
 if(piece.archived&&!dirty&&!uncertain)return <Unavailable/>;
 return <div className="piece-text-shell"><header className="piece-text-toolbar"><a href="/" className="text-button" onClick={navigate}><ArrowLeft size={15}/>Panel</a><span>Sólo equipo · {APP_MODE==='demo'?'Demostración local':'Espacio compartido'}</span><div className="piece-text-editor-actions">
   {editing?<><span role="status" className="piece-text-save-status">{busy?'Guardando…':uncertain?'Guardado sin confirmar':dirty?'Cambios sin guardar':'Guardado'}</span><button className="button secondary" disabled={blocked} onClick={discard}>{dirty?'Cancelar':'Volver a lectura'}</button><button className="button primary" disabled={blocked||!dirty||conflict||piece.archived||(captionLocked&&captionChanged)} onClick={()=>void save()}><Save size={16}/>Guardar cambios</button></>:<button className="button primary" disabled={blocked||piece.archived} onClick={start}><Pencil size={16}/>Editar</button>}
 </div></header><main className="piece-text-page"><div className="piece-text-client"><PieceClientAvatar piece={piece} clients={state.clients}/><div><strong>{pieceClientNames(piece,state.clients)}</strong><span>{FORMAT_LABELS[piece.format]}{piece.plannedDate?` · ${new Intl.DateTimeFormat('es-AR',{day:'numeric',month:'long'}).format(new Date(piece.plannedDate+'T12:00:00'))}`:''}</span></div></div><h1>{piece.title}</h1><p className="piece-text-update">{editing?'Editá el texto y guardá con Ctrl + S. Para compartirlo, usá Actualizar vista del cliente desde la pieza.':'Vista de lectura · Se actualiza al guardar cambios en la pieza.'}</p>
   {(saveError||error)&&<p role="alert" className="error-banner">{saveError||error}</p>}
   {uncertain&&<div className="notice-banner"><p>Hay un guardado sin confirmar. Reintentá la misma operación antes de seguir editando.</p><button className="button secondary" disabled={busy} onClick={()=>void retry()}>Reintentar guardado</button></div>}
   {conflict&&<div className="notice-banner" role="alert"><p>La pieza cambió mientras editabas. Tu borrador sigue acá; copiá lo que necesites antes de cargar la versión actual.</p><button className="button secondary" disabled={blocked} onClick={reload}>Cargar datos actuales</button></div>}
   {piece.archived&&<p role="alert" className="error-banner">La pieza fue archivada. Podés copiar tu borrador, pero no guardar cambios.</p>}
   {notice&&<p role="status" className="notice-banner">{notice}</p>}
   {editing?<fieldset className="piece-text-fields" disabled={blocked}>
     {story?<><EditorField title="Contenido de la historia" value={draft.caption} onChange={value=>update('caption',value)} locked={captionLocked} frozen={piece.archived} autoFocus/>{!!baseline.script?.trim()&&<TextSection title="Indicaciones anteriores · sólo equipo" text={baseline.script} copy={copy}/>}</>:<><EditorField title={baseline.format==='reel'?'Guion e instrucciones':'Texto por placas e instrucciones'} value={draft.script} onChange={value=>update('script',value)} frozen={piece.archived} autoFocus/><EditorField title="Caption" value={draft.caption} onChange={value=>update('caption',value)} locked={captionLocked} frozen={piece.archived} compact/></>}
   </fieldset>:piece.format==='story'?<><TextSection title="Contenido de la historia" text={piece.caption} empty="Todavía no hay contenido guardado para esta historia." copy={copy}/>{!!piece.script?.trim()&&<TextSection title="Indicaciones anteriores · sólo equipo" text={piece.script} copy={copy}/>}</>:<><TextSection title={piece.format==='reel'?'Guion e instrucciones':'Texto por placas e instrucciones'} text={piece.script??''} empty="Todavía no hay guion ni instrucciones guardados." copy={copy}/><TextSection title="Caption" text={piece.caption} empty="Todavía no hay caption guardado." copy={copy}/></>}
   {piece.internalNote&&<TextSection title="Notas para el equipo" text={piece.internalNote} copy={copy}/>}</main></div>;
}
function EditorField({title,value,onChange,locked=false,frozen=false,compact=false,autoFocus=false}:{title:string;value:string;onChange:(value:string)=>void;locked?:boolean;frozen?:boolean;compact?:boolean;autoFocus?:boolean}){
 const input=useRef<HTMLTextAreaElement>(null);
 useLayoutEffect(()=>{if(input.current){input.current.style.height='auto';input.current.style.height=`${input.current.scrollHeight+2}px`;}},[value]);
 return <section className="piece-text-section piece-text-editor"><label><span>{title}</span><textarea ref={input} aria-label={title} className={compact?'compact':''} value={value} readOnly={locked||frozen} autoFocus={autoFocus&&!locked&&!frozen} maxLength={100000} onChange={event=>onChange(event.target.value)} rows={compact?5:12}/></label>{locked&&<p className="form-hint">Este texto está bloqueado por su estado de revisión o publicación. Pedí cambios desde Entrega antes de modificarlo.</p>}</section>;
}
function TextSection({title,text,empty,copy}:{title:string;text:string;empty?:string;copy:(text:string)=>void}){return <section className="piece-text-section"><div><h2>{title}</h2>{text&&<button className="text-button" onClick={()=>copy(text)} aria-label={`Copiar ${title.toLowerCase()}`}><Copy size={15}/>Copiar</button>}</div>{text?<p className="piece-text-content">{text}</p>:<p className="piece-text-empty">{empty}</p>}</section>;}
