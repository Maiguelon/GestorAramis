import type { WorkerEnv } from './index';
import { hashShareToken, issueShareToken, verifySupabaseUser } from './authz';
import { connected, keyFor, open, seal } from './drive-service';
import { streamPinnedDriveAsset } from './drive';
import { ServiceError, type Fetcher } from './errors';

type Config = { url: string; publishableKey: string; workspaceId: string };
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const HEADERS={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'};
const ACTIONS=new Set(['staff-view','link-ensure','link-rotate','link-revoke','calendar-show','calendar-hide','publish','withdraw']);
const uuid=(value:unknown)=>{if(typeof value!=='string'||!UUID.test(value))throw new ServiceError('VALIDATION',400);return value;};

async function body(request:Request):Promise<Record<string,unknown>> {
  if(request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')throw new ServiceError('unsupported_media_type',415);
  const reader=request.body?.getReader();if(!reader)throw new ServiceError('VALIDATION',400);
  const parts:Uint8Array[]=[];let n=0;
  try{while(true){const value=await reader.read();if(value.done)break;n+=value.value.length;if(n>420_000){await reader.cancel();throw new ServiceError('payload_too_large',413);}parts.push(value.value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(n);let i=0;for(const p of parts){bytes.set(p,i);i+=p.length;}
  let data:unknown;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new ServiceError('VALIDATION',400);}
  if(!data||typeof data!=='object'||Array.isArray(data))throw new ServiceError('VALIDATION',400);
  return data as Record<string,unknown>;
}

export function pilotRpc(env:WorkerEnv,config:Config,userId:string|null,tokenHash:string|null,fetcher:Fetcher) {
  return async <T>(action:string,payload:unknown={}):Promise<T>=>{
    const secret=env.SUPABASE_SERVICE_ROLE_KEY;if(!secret)throw new ServiceError('configuration_missing',503);
    const response=await fetcher(`${config.url}/rest/v1/rpc/aramis_client_pilot`,{
      method:'POST',redirect:'manual',headers:{apikey:secret,'Content-Type':'application/json',...(secret.startsWith('eyJ')?{Authorization:`Bearer ${secret}`}:{})},
      body:JSON.stringify({p_workspace_id:config.workspaceId,p_user_id:userId,p_token_hash:tokenHash,p_action:action,p_payload:payload}),
    }).catch(()=>{throw new ServiceError('service_unavailable',503);});
    const value=await response.json().catch(()=>null);
    if(!response.ok){
      const codes:Record<string,number>={VALIDATION:400,NOT_FOUND:404,CONFLICT:409,INVALID_ACCESS:403,INVALID_TRANSITION:409,IDEMPOTENCY_CONFLICT:409,CHANGE_REASON_REQUIRED:400};
      if(value?.code==='42501')throw new ServiceError('forbidden',403);
      if(value?.code==='P0001'&&codes[value.message])throw new ServiceError(value.message,codes[value.message]);
      throw new ServiceError('service_unavailable',503);
    }
    return value as T;
  };
}

/** Pilot capabilities are deliberately separate from legacy read-only calendar links. */
export async function handleClientPilot(request:Request,env:WorkerEnv,config:Config,fetcher:Fetcher):Promise<Response>{
  const url=new URL(request.url),path=url.pathname;
  // Stop waiting for headers; let successful video response bodies stream without a deadline.
  const bounded:Fetcher=async(input,init)=>{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30_000);try{return await fetcher(input,{...init,signal:controller.signal});}finally{clearTimeout(timer);}};
  if(path==='/api/client-pilot/staff'){
    if(request.method!=='POST')throw new ServiceError('method_not_allowed',405);
    const user=await verifySupabaseUser(request,config,bounded),data=await body(request);
    const {action,...payload}=data;
    if(typeof action!=='string'||!ACTIONS.has(action))throw new ServiceError('VALIDATION',400);
    uuid(payload.clientId);
    if(action!=='staff-view')uuid(payload.key);
    // Never accept an encrypted token or hash supplied by the browser.
    if('tokenHash' in payload||'encryptedToken' in payload)throw new ServiceError('VALIDATION',400);
    const rpc=pilotRpc(env,config,user.id,null,bounded),key=await keyFor(env);
    if(action==='link-ensure'||action==='link-rotate'){
      // The RPC ignores a new envelope on an idempotent replay; it returns the stored link.
      const issued=await issueShareToken();payload.tokenHash=issued.tokenHash;
      payload.encryptedToken=await seal(issued.token,key,`${config.workspaceId}:client:${payload.clientId}`);
    }
    const result=await rpc<Record<string,unknown>>(action,payload),encrypted=result.encryptedToken;
    delete result.encryptedToken;
    if(encrypted){
      const token=await open<string>(encrypted as Parameters<typeof open>[0],key,`${config.workspaceId}:client:${payload.clientId}`);
      result.linkUrl=`${url.origin}/cliente#${token}`;
    }
    return Response.json(result,{headers:HEADERS});
  }
  const media=/^\/api\/client\/media\/([a-f0-9-]+)\/([a-f0-9-]+)\/([a-f0-9-]+)$/.exec(path);
  if(media&&request.method==='GET'){
    const clientId=uuid(media[1]),requestId=uuid(media[2]),assetId=uuid(media[3]);
    const packed=request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('aramis-client-media='))?.split('=')[1];
    if(!packed||packed.length>3000)throw new ServiceError('INVALID_ACCESS',403);
    const key=await keyFor(env);let session:{token:string;clientId:string;expiresAt:number};
    try{session=await open(JSON.parse(atob(packed)),key,`${config.workspaceId}:client-media`);}catch{throw new ServiceError('INVALID_ACCESS',403);}
    if(session.clientId!==clientId||session.expiresAt<Date.now())throw new ServiceError('INVALID_ACCESS',403);
    const base=pilotRpc(env,config,null,await hashShareToken(session.token),bounded);
    const asset=await base<Parameters<typeof streamPinnedDriveAsset>[1]&{generation:string}>('asset',{requestId,assetId});
    const bridge=async<T>(action:string,payload:unknown={}):Promise<T>=>base<T>(action,{requestId,...(action==='connection-save'?{connection:payload}:{})});
    const {connection,token}=await connected(bridge,key,env,config.workspaceId,bounded);
    if(asset.generation!==connection.generation)throw new ServiceError('CONFLICT',409);
    const response=await streamPinnedDriveAsset(token,asset,request.headers.get('Range'),bounded,true);
    const headers=new Headers(response.headers);for(const [k,v] of Object.entries(HEADERS))headers.set(k,v);
    headers.set('Content-Security-Policy',"sandbox; default-src 'none'; frame-ancestors 'self'");
    if(url.searchParams.get('download')==='1')headers.set('Content-Disposition','attachment');
    return new Response(response.body,{status:response.status,headers});
  }
  if(path!=='/api/client/view'&&path!=='/api/client/respond')throw new ServiceError('not_found',404);
  if((path.endsWith('/view')&&request.method!=='GET')||(path.endsWith('/respond')&&request.method!=='POST'))throw new ServiceError('method_not_allowed',405);
  const token=request.headers.get('Authorization')?.replace(/^Bearer /,'')??'';
  const rpc=pilotRpc(env,config,null,await hashShareToken(token),bounded);
  let payload:Record<string,unknown>={};
  if(path.endsWith('/respond')){
    payload=await body(request);
    if(Object.keys(payload).some(k=>!['requestId','key','decision','comment','author','part'].includes(k))
      ||('part' in payload&&!['content','caption'].includes(String(payload.part)))
      ||!['approved','changes','comment'].includes(String(payload.decision))||typeof payload.comment!=='string'||typeof payload.author!=='string')throw new ServiceError('VALIDATION',400);
    uuid(payload.requestId);uuid(payload.key);
  }
  const result=await rpc<Record<string,unknown>>(path.endsWith('/view')?'view':'respond',payload);
  const clientId=uuid((result.client as {id:string}|undefined)?.id);
  const encrypted=await seal({token,clientId,expiresAt:Date.now()+15*60_000},await keyFor(env),`${config.workspaceId}:client-media`);
  const cookie=btoa(JSON.stringify(encrypted));
  return Response.json(result,{headers:{...HEADERS,'Set-Cookie':`aramis-client-media=${cookie}; Path=/api/client/media/${clientId}/; HttpOnly; SameSite=Strict; Max-Age=900${url.protocol==='https:'?'; Secure':''}`}});
}
