// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { handleRequest, type WorkerEnv } from '../server';
import { hashShareToken } from '../server/authz';
import { open, keyFor, seal } from '../server/drive-service';
const C='20000000-0000-4000-8000-000000000001',U='00000000-0000-4000-8000-000000000001',W='10000000-0000-4000-8000-000000000001';
const env:WorkerEnv={SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public-test',ARAMIS_WORKSPACE_ID:W,SUPABASE_SERVICE_ROLE_KEY:'private-server-test',DRIVE_ENCRYPTION_KEY:btoa('a'.repeat(32))};
const token='a'.repeat(43),view={client:{id:C,name:'Ficticio',initials:'F',color:'#123456'},pieces:[],requests:[]};
const req=(path:string,body?:unknown,bearer=token)=>new Request('https://gestor.example'+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${bearer}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
describe('public client pilot HTTP boundary',()=>{
 it('forwards a hash only, strips cookies from JSON and sets a client-specific private media cookie',async()=>{
   const fetcher=vi.fn(async(_input:unknown,init?:RequestInit)=>{expect(init?.body).not.toContain(token);return Response.json(view);});
   const response=await handleRequest(req('/api/client/view'),env,fetcher);
   expect(response.status).toBe(200);expect(await response.json()).toEqual(view);
   expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).p_token_hash).toBe(await hashShareToken(token));
   expect(response.headers.get('Set-Cookie')).toContain(`Path=/api/client/media/${C}/; HttpOnly; SameSite=Strict`);
   expect(response.headers.get('Cache-Control')).toContain('no-store');
 });
 it('rejects malformed capabilities and cross-origin writes before any service call',async()=>{
   const fetcher=vi.fn();expect((await handleRequest(req('/api/client/view',undefined,'short'),env,fetcher)).status).toBe(403);
   const request=req('/api/client/respond',{});request.headers.set('Origin','https://unrelated.example');
   expect((await handleRequest(request,env,fetcher)).status).toBe(403);expect(fetcher).not.toHaveBeenCalled();
 });
 it('keeps service errors generic and never exposes private diagnostics',async()=>{
   const response=await handleRequest(req('/api/client/view'),env,async()=>Response.json({message:'secret diagnostic',code:'XX000'},{status:500}));
   expect(response.status).toBe(503);expect(await response.text()).not.toContain('secret');
 });
 it('requires verified staff, rejects supplied token envelopes and returns a reusable encrypted link',async()=>{
   const proposal=await seal(token,await keyFor(env),`${W}:client:${C}`);
   const fetcher=vi.fn(async(input:RequestInfo|URL)=>String(input).endsWith('/auth/v1/user')?Response.json({id:U}):Response.json({...view,encryptedToken:proposal,linkActive:true}));
   const response=await handleRequest(req('/api/client-pilot/staff',{action:'staff-view',clientId:C},'staff.jwt'),env,fetcher);
   expect(response.status).toBe(200);const data=await response.json() as Record<string,unknown>;
   expect(data.linkUrl).toBe(`https://gestor.example/cliente#${token}`);expect(data).not.toHaveProperty('encryptedToken');
   const rejected=await handleRequest(req('/api/client-pilot/staff',{action:'link-rotate',clientId:C,key:crypto.randomUUID(),encryptedToken:proposal},'staff.jwt'),env,fetcher);expect(rejected.status).toBe(400);
   const denied=await handleRequest(req('/api/client-pilot/staff',{action:'staff-view',clientId:C}),env,async()=>new Response(null,{status:401}));expect(denied.status).toBe(401);
 });
 it('generates a high entropy link on the server and encrypts it with client-bound context',async()=>{
   const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
     if(String(input).endsWith('/auth/v1/user'))return Response.json({id:U});
     const data=JSON.parse(String(init?.body));const raw=await open<string>(data.p_payload.encryptedToken,await keyFor(env),`${W}:client:${C}`);
     expect(raw).toMatch(/^[a-zA-Z0-9_-]{43}$/);expect(data.p_payload.tokenHash).toBe(await hashShareToken(raw));
     return Response.json({...view,encryptedToken:data.p_payload.encryptedToken});
   });
   expect((await handleRequest(req('/api/client-pilot/staff',{action:'link-ensure',clientId:C,key:crypto.randomUUID()},'staff.jwt'),env,fetcher)).status).toBe(200);
 });
 it('denies media without cookie, with a different client or after revocation, before contacting Drive',async()=>{
   const request=req(`/api/client/media/${C}/${U}/${W}`);request.headers.delete('Authorization');const fetcher=vi.fn();
   expect((await handleRequest(request,env,fetcher)).status).toBe(403);expect(fetcher).not.toHaveBeenCalled();
   const encrypted=await seal({token,clientId:C,expiresAt:Date.now()+60_000},await keyFor(env),`${W}:client-media`);
   request.headers.set('Cookie',`aramis-client-media=${btoa(JSON.stringify(encrypted))}`);
   const revoked=vi.fn(async()=>Response.json({code:'P0001',message:'INVALID_ACCESS'},{status:400}));
   expect((await handleRequest(request,env,revoked)).status).toBe(403);expect(revoked).toHaveBeenCalledTimes(1);
 });
});
