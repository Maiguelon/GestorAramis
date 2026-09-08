import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Command, CommandContext, WorkspaceState } from '../contracts/domain';
import { applyCommand } from '../src/domain/engine';
import { createSeed } from '../src/domain/seed';
import { getClientView, pieceMonth } from '../src/domain/selectors';
import { validateLocalFile, LOCAL_FILE_LIMIT } from '../src/lib/local-files';
let sequence=0;
const context:CommandContext={actor:'member-lucia',now:'2026-09-07T14:00:00Z',newId:()=>`monthly-${++sequence}`,token:()=>`token-${++sequence}`};
const run=(state:WorkspaceState,command:Command)=>applyCommand(state,command,context).state;
const generate:Command={type:'generate-month',clientId:'client-oliva',month:'2026-10',ownerId:'member-lucia'};
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('monthly base and production',()=>{
 it('generates hidden undated pieces, once, without modifying other months',()=>{
  const initial=createSeed('2026-09-07');initial.clients[0].monthlyPlan={posts:3,reels:2};
  const next=run(initial,generate);const added=next.pieces.filter(p=>p.planMonth==='2026-10');
  expect(added).toHaveLength(5);expect(added.every(p=>!p.visibleToClient&&p.plannedDate===null&&p.status==='planned'&&p.workArea==='marketing')).toBe(true);
  expect(next.pieces.slice(0,initial.pieces.length)).toEqual(initial.pieces);
  expect(()=>run(next,generate)).toThrow(/ya fue generada/);expect(initial.clients[0].generatedMonths).toEqual([]);
 });
 it('counts existing carousel and reel toward the plan, retains excess extras',()=>{
  let state=createSeed('2026-09-07');state.clients[0].monthlyPlan={posts:1,reels:1};
  for(const format of ['carousel','reel','reel'] as const)state=run(state,{type:'create-piece',input:{clientId:'client-oliva',ownerId:'member-lucia',format,planMonth:'2026-10',title:`Extra ${format}`}});
  const existing=state.pieces;const next=run(state,generate);expect(next.pieces).toEqual(existing);expect(next.clients[0].generatedMonths).toContain('2026-10');
 });
 it('changing the plan preserves current pieces and archiving does not regenerate a slot',()=>{
  let state=createSeed('2026-09-07');state.clients[0].monthlyPlan={posts:1,reels:0};state=run(state,generate);
  const generated=state.pieces.find(p=>p.planMonth==='2026-10')!;
  state=run(state,{type:'update-piece',pieceId:generated.id,expectedRevision:generated.revision,patch:{archived:true}});
  const before=structuredClone(state.pieces);state=run(state,{type:'update-client',clientId:'client-oliva',expectedRevision:state.clients[0].revision!,patch:{monthlyPlan:{posts:9,reels:2}}});
  expect(state.pieces).toEqual(before);expect(()=>run(state,generate)).toThrow(/ya fue generada/);
  const next=run(state,{...generate,month:'2026-11'});expect(next.pieces.filter(p=>p.planMonth==='2026-11')).toHaveLength(11);
 });
 it('rejects empty plans, invalid months and stale client edits',()=>{
  const state=createSeed();state.clients[0].monthlyPlan={posts:0,reels:0};expect(()=>run(state,generate)).toThrow(/cantidad/);
  expect(()=>run(state,{...generate,month:'2026-13'})).toThrow(/mes válido/);
  const next=run(state,{type:'update-client',clientId:'client-oliva',expectedRevision:0,patch:{name:'Oliva actual'}});
  expect(()=>run(next,{type:'update-client',clientId:'client-oliva',expectedRevision:0,patch:{name:'Viejo'}})).toThrow(/cliente cambió/);
  expect(()=>run(state,{type:'update-client',clientId:'client-oliva',expectedRevision:0,patch:{monthlyPlan:{posts:-1,reels:1.5}}})).toThrow(/entero/);
 });
 it('keeps script, team files, area and monthly plan out of every client projection',()=>{
  const state=createSeed();for(const p of state.pieces){p.script='private script';p.teamAssets=[{id:'secret-file',name:'raw.mp4',size:50,mimeType:'video/mp4',source:'demo'}];p.workArea='design';p.planMonth='2026-09';}
  for(const token of ['demo-calendar','demo-review','demo-material']){
   const view=getClientView(state,token);expect(JSON.stringify(view)).not.toMatch(/private script|secret-file|teamAssets|workArea|planMonth|monthlyPlan/);
  }
 });
 it('changing internal production instructions does not invalidate an approved snapshot',()=>{
  const state=createSeed();const p=state.pieces.find(p=>p.id==='piece-oliva-approved')!;
  const next=run(state,{type:'update-piece',pieceId:p.id,expectedRevision:p.revision,patch:{script:'Instrucciones internas',workArea:'design'}});
  expect(next.pieces.find(item=>item.id===p.id)?.status).toBe('approved');expect(next.reviews.find(r=>r.pieceId===p.id)?.status).toBe('approved');
 });
 it('supports untitled extras and preserves plan month when publication date moves',()=>{
  let state=run(createSeed(),{type:'create-piece',input:{clientId:'client-oliva',ownerId:'member-lucia',format:'reel',planMonth:'2026-10'}});const p=state.pieces.at(-1)!;expect(p.title).toBe('Reel sin título');
  state=run(state,{type:'update-piece',pieceId:p.id,expectedRevision:p.revision,patch:{plannedDate:'2026-11-01'}});expect(pieceMonth(state.pieces.at(-1)!)).toBe('2026-10');
 });
 it('reads old snapshots without replacing them and persists new fields',async()=>{
  vi.resetModules();vi.stubEnv('VITE_APP_MODE','demo');const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)});
  const old=createSeed();for(const client of old.clients){delete client.monthlyPlan;delete client.revision;delete client.generatedMonths;}for(const piece of old.pieces){delete piece.planMonth;delete piece.workArea;delete piece.productionStage;delete piece.script;delete piece.teamAssets;}
  const raw=JSON.stringify(old);data.set('aramis.workspace.demo.v1',raw);const api=await import('../src/lib/api');expect(api.readWorkspace()).toEqual(old);expect(data.get(api.DEMO_STORAGE_KEY)).toBe(raw);
  api.runCommand({type:'update-client',clientId:old.clients[0].id,expectedRevision:0,patch:{monthlyPlan:{posts:2,reels:1}}});api.runCommand(generate);expect(api.readWorkspace().pieces.filter(p=>p.planMonth==='2026-10')).toHaveLength(3);
 });
 it('rejects oversized and empty local files before attempting storage',()=>{
  expect(()=>validateLocalFile({name:'empty.mp4',size:0})).toThrow(/vacío/);expect(()=>validateLocalFile({name:'large.mp4',size:LOCAL_FILE_LIMIT+1})).toThrow(/100 MB/);expect(()=>validateLocalFile({name:'video.mp4',size:100})).not.toThrow();
 });
});
