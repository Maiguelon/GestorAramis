import type { WorkerEnv } from './index';
import { hashShareToken, verifySupabaseUser } from './authz';
import { ServiceError, type Fetcher } from './errors';
import { callWorkspaceRpc } from './workspace-repository';
import { decryptRefreshToken, encryptRefreshToken, exchangeGoogleCode, prepareGoogleOAuth, refreshGoogleTokens, type GoogleTokens, type OAuthState } from './google-oauth';
import { checkDriveUpload, ensureDriveFolder, generateDriveId, getDriveAccount, initiateDriveUpload, streamDriveAsset, streamTeamDriveAsset, type UploadExpectation } from './drive';
import type { Piece } from '../contracts/domain';

type Envelope = { iv: number[]; ciphertext: number[] };
interface Connection { generation: string; encryptedTokens: Envelope; accountEmail: string; accountPermissionId: string; rootFolderId: string | null }
interface Upload { uploadId: string; pieceId: string; clientId: string; name: string; mimeType: string; size: number; fingerprint: string; driveFileId: string; folderId: string; generation: string; encryptedSession: Envelope | null; status: string }
interface TeamAsset { id: string; pieceId: string; clientId: string; workspaceId: string; name: string; mimeType: string; size: number; driveFileId: string; checksum: string; generation: string }
type CoreConfig = { url: string; publishableKey: string; workspaceId: string };
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const HEADERS = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' };
const TYPES = new Set(['video/mp4','video/webm','video/quicktime','video/x-m4v','image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','image/avif','application/pdf','application/octet-stream']);
const MAX_FILE = 2 * 1024 ** 3;
const json = (value: unknown, headers: Record<string,string> = {}) => Response.json(value, { headers: { ...HEADERS, ...headers } });
const id = (value: unknown) => { if (typeof value !== 'string' || !UUID.test(value)) throw new ServiceError('VALIDATION',400); return value; };

/** Applies a timeout to receiving headers, never to a successfully streaming body. */
function headerTimeout(fetcher: Fetcher): Fetcher {
  return async (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try { return await fetcher(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal,controller.signal]) : controller.signal }); }
    finally { clearTimeout(timer); }
  };
}

function googleConfig(env: WorkerEnv) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI || !env.DRIVE_ENCRYPTION_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) throw new ServiceError('configuration_missing',503);
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: env.GOOGLE_REDIRECT_URI };
}
async function keyFor(env: WorkerEnv) {
  try {
    const bytes = Uint8Array.from(atob(env.DRIVE_ENCRYPTION_KEY ?? ''), c => c.charCodeAt(0));
    if (bytes.length !== 32) throw new Error();
    return await crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
  } catch { throw new ServiceError('configuration_missing',503); }
}
async function seal(value: unknown, key: CryptoKey, context: string) { return encryptRefreshToken(JSON.stringify(value),key,context); }
async function open<T>(value: Envelope,key:CryptoKey,context:string):Promise<T> {
  try { return JSON.parse(await decryptRefreshToken(value,key,context)) as T; }
  catch { throw new ServiceError('google_reconnect_required',502); }
}

/** Server credential is only used for this narrow RPC; it checks staff membership again. */
export function driveRpc(env: WorkerEnv, config:CoreConfig, userId:string, fetcher:Fetcher) {
  return async <T>(action:string,payload:unknown = {}):Promise<T> => {
    if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new ServiceError('configuration_missing',503);
    const secret = env.SUPABASE_SERVICE_ROLE_KEY;
    const response = await fetcher(`${config.url}/rest/v1/rpc/aramis_drive`, {
      method:'POST',redirect:'manual',headers:{apikey:secret,'Content-Type':'application/json',...(secret.startsWith('eyJ') ? {Authorization:`Bearer ${secret}`} : {})},
      body:JSON.stringify({p_workspace_id:config.workspaceId,p_user_id:userId,p_action:action,p_payload:payload}),
    }).catch(()=>{throw new ServiceError('service_unavailable',503);});
    const body = await response.json().catch(()=>null) as Record<string,unknown> | null;
    if (!response.ok) {
      if (body?.code === '42501') throw new ServiceError('forbidden',403);
      const domain:Record<string,number> = {VALIDATION:400,NOT_FOUND:404,ARCHIVED:409,CONFLICT:409,IDEMPOTENCY_CONFLICT:409,ACCOUNT_CONFLICT:409,ASSET_MISMATCH:409,FOLDER_NOT_FOUND:409};
      if (body?.code === 'P0001' && typeof body.message === 'string' && domain[body.message]) throw new ServiceError(body.message,domain[body.message]);
      throw new ServiceError('service_unavailable',503);
    }
    return body as T;
  };
}
type Rpc = ReturnType<typeof driveRpc>;

async function readBody(request:Request):Promise<Record<string,unknown>> {
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') throw new ServiceError('unsupported_media_type',415);
  const reader=request.body?.getReader(); if(!reader)throw new ServiceError('VALIDATION',400);
  const parts:Uint8Array[]=[];let size=0;
  try { while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16_384){await reader.cancel();throw new ServiceError('payload_too_large',413);}parts.push(value);} }
  finally {reader.releaseLock();}
  const bytes=new Uint8Array(size);let n=0;for(const part of parts){bytes.set(part,n);n+=part.length;}
  let data:unknown;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new ServiceError('VALIDATION',400);}
  if(!data||typeof data!=='object'||Array.isArray(data))throw new ServiceError('VALIDATION',400);
  return data as Record<string,unknown>;
}
function only(data:Record<string,unknown>,names:string[]) {if(Object.keys(data).some(k=>!names.includes(k)))throw new ServiceError('VALIDATION',400);}

async function connected(rpc:Rpc,key:CryptoKey,env:WorkerEnv,workspace:string,fetcher:Fetcher) {
  const connection=await rpc<Connection|null>('connection-get');
  if(!connection)throw new ServiceError('google_reconnect_required',409);
  let tokens=await open<GoogleTokens>(connection.encryptedTokens,key,workspace+':tokens');
  if(!tokens.accessToken||!tokens.refreshToken||!Number.isFinite(tokens.expiresAt))throw new ServiceError('google_reconnect_required',502);
  if(tokens.expiresAt<Date.now()+60_000){
    tokens=await refreshGoogleTokens(googleConfig(env),tokens.refreshToken,fetcher);
    const encryptedTokens=await seal(tokens,key,workspace+':tokens');
    await rpc('connection-save',{generation:connection.generation,accountEmail:connection.accountEmail,accountPermissionId:connection.accountPermissionId,rootFolderId:connection.rootFolderId,encryptedTokens,expectedGeneration:connection.generation});
  }
  return {connection,token:tokens.accessToken};
}
async function ensureFolder(rpc:Rpc,token:string,workspaceId:string,logicalKey:string,name:string,parentId:string|undefined,fetcher:Fetcher):Promise<string> {
  let mapping=await rpc<{folderId:string;name?:string|null;parentId?:string|null}|null>('folder-get',{logicalKey});
  if(!mapping){const folderId=await generateDriveId(token,fetcher);mapping=await rpc('folder-put',{logicalKey,folderId,name:name.slice(0,200),parentId:parentId??null});}
  await ensureDriveFolder(token,{id:mapping!.folderId,name:mapping!.name??name.slice(0,200),parentId:mapping!.parentId??parentId,workspaceId,logicalKey},fetcher);
  return mapping!.folderId;
}
async function pieceFolder(rpc:Rpc,token:string,workspaceId:string,piece:Piece,clientName:string,fetcher:Fetcher) {
  // Month/name changes never move an existing piece folder.
  const root=await ensureFolder(rpc,token,workspaceId,'root','Gestor Aramis',undefined,fetcher);
  const client=await ensureFolder(rpc,token,workspaceId,`client:${piece.clientId}`,clientName,root,fetcher);
  const month=piece.planMonth ?? piece.plannedDate?.slice(0,7) ?? piece.createdAt.slice(0,7);
  const monthly=await ensureFolder(rpc,token,workspaceId,`month:${piece.clientId}:${month}`,month,client,fetcher);
  const folder=await ensureFolder(rpc,token,workspaceId,`piece:${piece.id}`,piece.title||'Sin título',monthly,fetcher);
  return ensureFolder(rpc,token,workspaceId,`piece:${piece.id}:material`,'Material',folder,fetcher);
}
const publicAsset=(a:TeamAsset)=>({id:a.id,name:a.name,mimeType:a.mimeType,size:a.size,source:'drive'});
function expected(upload:Upload,workspaceId:string):UploadExpectation {
  return {uploadId:upload.uploadId,workspaceId,clientId:upload.clientId,requestId:upload.pieceId,parentFolderId:upload.folderId,name:upload.name,mimeType:upload.mimeType,size:upload.size,driveFileId:upload.driveFileId};
}
async function uploadReply(upload:Upload,rpc:Rpc,key:CryptoKey,workspaceId:string) {
  if(upload.status==='complete'){const asset=await rpc<TeamAsset>('get-asset',{assetId:upload.uploadId});return json({asset:publicAsset(asset)});}
  if(!upload.encryptedSession)throw new ServiceError('upload_not_started',409);
  const session=await open<{sessionUrl:string}>(upload.encryptedSession,key,workspaceId+':upload:'+upload.uploadId);
  return json({session:{uploadId:upload.uploadId,sessionUrl:session.sessionUrl,expectedSize:upload.size,mimeType:upload.mimeType}});
}

/** OAuth navigation returns only the short-lived code/state to our authenticated SPA. */
export function googleCallbackRedirect(request:Request):Response {
  if(request.method!=='GET')throw new ServiceError('method_not_allowed',405);
  const source=new URL(request.url).searchParams;const fields=new URLSearchParams();
  for(const name of ['code','state','error']){const value=source.get(name);if(value&&value.length<=4096)fields.set(name,value);}
  return new Response(null,{status:303,headers:{...HEADERS,Location:'/#drive-callback='+fields.toString()}});
}

export async function handleDriveRequest(request:Request,env:WorkerEnv,config:CoreConfig,fetcher:Fetcher):Promise<Response> {
  const url=new URL(request.url),path=url.pathname,method=request.method;
  const bounded=headerTimeout(fetcher);
  const mediaMatch=/^\/api\/drive\/assets\/([a-f0-9-]+)\/content$/i.exec(path);
  const cookieName=url.protocol==='https:'?'__Host-aramis-media':'aramis-media';
  const cookieFlags=`Path=/; HttpOnly; SameSite=Strict${url.protocol==='https:'?'; Secure':''}`;
  if(path==='/api/drive/media-session'&&method==='DELETE')return json({cleared:true},{'Set-Cookie':`${cookieName}=; ${cookieFlags}; Max-Age=0`});
  let authRequest=request;
  if(mediaMatch&&!request.headers.get('Authorization')){
    const raw=request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    if(!raw||raw.length>12_000)throw new ServiceError('unauthenticated',401);
    try {
      const parts=raw.split('.');if(parts.length!==2)throw new Error();
      const packed={iv:Array.from(atob(parts[0]),c=>c.charCodeAt(0)),ciphertext:Array.from(atob(parts[1]),c=>c.charCodeAt(0))};
      const session=await open<{authorization:string;expiresAt:number}>(packed,await keyFor(env),config.workspaceId+':media');
      if(session.expiresAt<=Date.now()||!Number.isFinite(session.expiresAt))throw new Error();
      const headers=new Headers(request.headers);headers.set('Authorization',session.authorization);authRequest=new Request(request,{headers});
    }catch{throw new ServiceError('unauthenticated',401);}
  }
  const user=await verifySupabaseUser(authRequest,config,bounded);
  const authorization=authRequest.headers.get('Authorization')!;
  // Regular staff RPC uses the user JWT; the server-only RPC rechecks this membership.
  const workspace=await callWorkspaceRpc(config,authorization,undefined,bounded) as {state:{pieces:Piece[];clients:{id:string;name:string}[]}};
  if(path==='/api/drive/status'&&method==='GET'){
    try{googleConfig(env);await keyFor(env);}catch{return json({configured:false,connected:false});}
    const statusRpc=driveRpc(env,config,user.id,bounded);
    const conn=await statusRpc<Connection|null>('connection-get');
    const root=conn?await statusRpc<{folderId:string}|null>('folder-get',{logicalKey:'root'}):null;
    return json({configured:true,connected:!!conn,...(conn?{accountEmail:conn.accountEmail,rootFolderId:root?.folderId??conn.rootFolderId}:{})});
  }
  const google=googleConfig(env),key=await keyFor(env),rpc=driveRpc(env,config,user.id,bounded);
  if(path==='/api/drive/media-session'&&method==='POST'){
    const data=await readBody(request);only(data,[]);
    const payload=await seal({authorization,expiresAt:Date.now()+600_000},key,config.workspaceId+':media');
    const packed=btoa(String.fromCharCode(...payload.iv))+'.'+btoa(String.fromCharCode(...payload.ciphertext));
    if(packed.length>3800)throw new ServiceError('configuration_missing',503);
    return json({ready:true},{'Set-Cookie':`${cookieName}=${packed}; ${cookieFlags}; Max-Age=600`});
  }
  if(path==='/api/drive/connect'&&method==='POST'){
    const data=await readBody(request);only(data,[]);
    if(new URL(google.redirectUri).origin!==url.origin)throw new ServiceError('configuration_missing',503);
    const prepared=await prepareGoogleOAuth(google,{userId:user.id,workspaceId:config.workspaceId});
    await rpc('state-put',{stateHash:prepared.record.stateHash,encryptedPayload:await seal(prepared.record,key,config.workspaceId+':state:'+prepared.record.stateHash),expiresAt:new Date(prepared.record.expiresAt).toISOString()});
    return json({url:prepared.url});
  }
  if(path==='/api/drive/callback'&&method==='POST'){
    const data=await readBody(request);only(data,['code','state']);
    if(typeof data.code!=='string'||typeof data.state!=='string')throw new ServiceError('invalid_oauth_state',403);
    const stateHash=await hashShareToken(data.state);
    const stored=await rpc<{encryptedPayload:Envelope}|null>('state-take',{stateHash});
    if(!stored)throw new ServiceError('invalid_oauth_state',403);
    const record=await open<OAuthState>(stored.encryptedPayload,key,config.workspaceId+':state:'+stateHash);
    const tokens=await exchangeGoogleCode(google,{code:data.code,state:data.state,userId:user.id,workspaceId:config.workspaceId},{consume:async hash=>hash===stateHash?record:null},bounded);
    const account=await getDriveAccount(tokens.accessToken,bounded);
    const current=await rpc<Connection|null>('connection-get');
    if(current&&current.accountPermissionId!==account.permissionId)throw new ServiceError('ACCOUNT_CONFLICT',409);
    const connection:Connection={generation:current?.generation??crypto.randomUUID(),encryptedTokens:await seal(tokens,key,config.workspaceId+':tokens'),accountEmail:account.email,accountPermissionId:account.permissionId,rootFolderId:current?.rootFolderId??null};
    await rpc('connection-save',{...connection,expectedGeneration:current?.generation??null});
    // Folder creation is lazy on the first upload: accepting OAuth never reorganizes Drive.
    return json({connected:true,accountEmail:account.email});
  }
  const assetsMatch=/^\/api\/drive\/pieces\/([a-f0-9-]+)\/assets$/i.exec(path);
  if(assetsMatch&&method==='GET'){
    const pieceId=id(assetsMatch[1]);const assets=await rpc<TeamAsset[]>('list-assets',{pieceId});
    const folder=await rpc<{folderId:string}|null>('folder-get',{logicalKey:`piece:${pieceId}:material`});
    return json({assets:assets.map(publicAsset),...(folder?{folderUrl:`https://drive.google.com/drive/folders/${encodeURIComponent(folder.folderId)}`}:{})});
  }
  if(path==='/api/drive/uploads'&&method==='POST'){
    const data=await readBody(request);only(data,['uploadId','pieceId','name','mimeType','size','fingerprint']);
    const uploadId=id(data.uploadId),pieceId=id(data.pieceId);
    if(typeof data.name!=='string'||!data.name.trim()||data.name.length>240||/[\u0000-\u001f]/.test(data.name)||typeof data.mimeType!=='string'||!TYPES.has(data.mimeType)||!Number.isSafeInteger(data.size)||Number(data.size)<=0||Number(data.size)>MAX_FILE||typeof data.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(data.fingerprint))throw new ServiceError('invalid_upload',400);
    const piece=workspace.state.pieces.find(p=>p.id===pieceId);if(!piece)throw new ServiceError('NOT_FOUND',404);if(piece.archived)throw new ServiceError('ARCHIVED',409);
    let upload=await rpc<Upload|null>('upload-get',{uploadId});
    if(upload&&['pieceId','name','mimeType','size','fingerprint'].some(k=>upload![k as keyof Upload]!==data[k]))throw new ServiceError('IDEMPOTENCY_CONFLICT',409);
    if(upload?.status==='complete')return uploadReply(upload,rpc,key,config.workspaceId);
    const {connection,token}=await connected(rpc,key,env,config.workspaceId,bounded);
    if(upload&&upload.generation!==connection.generation)throw new ServiceError('CONFLICT',409);
    if(!upload){
      const folderId=await pieceFolder(rpc,token,config.workspaceId,piece,workspace.state.clients.find(c=>c.id===piece.clientId)?.name??'Cliente',bounded);
      const driveFileId=await generateDriveId(token,bounded);
      upload=await rpc<Upload>('upload-put',{...data,driveFileId,folderId,generation:connection.generation,encryptedSession:null});
    }
    if(!upload.encryptedSession){
      const started=await initiateDriveUpload(token,expected(upload,config.workspaceId),bounded);
      upload=await rpc<Upload>('upload-update',{uploadId,encryptedSession:await seal({sessionUrl:started.sessionUrl},key,config.workspaceId+':upload:'+uploadId),status:'uploading'});
    }
    return uploadReply(upload,rpc,key,config.workspaceId);
  }
  const uploadMatch=/^\/api\/drive\/uploads\/([a-f0-9-]+)(\/complete)?$/i.exec(path);
  if(uploadMatch){
    const uploadId=id(uploadMatch[1]);const upload=await rpc<Upload|null>('upload-get',{uploadId});if(!upload)throw new ServiceError('NOT_FOUND',404);
    if(!uploadMatch[2]&&method==='GET')return uploadReply(upload,rpc,key,config.workspaceId);
    if(uploadMatch[2]&&method==='POST'){
      const body=await readBody(request);only(body,[]);
      if(upload.status==='complete')return uploadReply(upload,rpc,key,config.workspaceId);
      if(!upload.encryptedSession)throw new ServiceError('upload_not_started',409);
      const {connection,token}=await connected(rpc,key,env,config.workspaceId,bounded);
      if(connection.generation!==upload.generation)throw new ServiceError('CONFLICT',409);
      const {sessionUrl}=await open<{sessionUrl:string}>(upload.encryptedSession,key,config.workspaceId+':upload:'+uploadId);
      const result=await checkDriveUpload(token,{sessionUrl,expected:expected(upload,config.workspaceId)},bounded);
      if(result.status!=='complete')throw new ServiceError('upload_incomplete',409);
      const asset=await rpc<TeamAsset>('upload-complete',{uploadId,asset:{driveFileId:result.file.id,checksum:result.file.md5Checksum,mimeType:result.file.mimeType,size:Number(result.file.size)}});
      return json({asset:publicAsset(asset)});
    }
  }
  if(mediaMatch&&method==='GET'){
    const asset=await rpc<TeamAsset|null>('get-asset',{assetId:id(mediaMatch[1])});if(!asset)throw new ServiceError('NOT_FOUND',404);
    const {connection,token}=await connected(rpc,key,env,config.workspaceId,bounded);if(asset.generation!==connection.generation)throw new ServiceError('CONFLICT',409);
    const response=await (url.searchParams.get('download')==='1'?streamTeamDriveAsset:streamDriveAsset)(token,asset,request.headers.get('Range'),bounded);
    const headers=new Headers(response.headers);headers.set('X-Robots-Tag','noindex, nofollow');
    return new Response(response.body,{status:response.status,headers});
  }
  throw new ServiceError('not_found',404);
}
