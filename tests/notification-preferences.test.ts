import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {PreferenceSave} from '../src/lib/notifications';
const memory=()=>{const values=new Map<string,string>();return{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k),clear:()=>values.clear()};};
const transport=vi.hoisted(()=>vi.fn<typeof fetch>());
vi.mock('../src/lib/api',()=>({APP_MODE:'demo'}));
vi.mock('../src/lib/shared-api',()=>({SharedApiError:class extends Error{},sharedWorkspace:{authenticatedFetch:transport}}));
import {readNotificationSettings,saveNotificationSettings,readPreferenceSave,preferenceJournalKey} from '../src/lib/notifications';
const op:PreferenceSave={requestId:'00000000-0000-4000-8000-000000000001',preferences:{audience:'design',cadence:'daily',enabled:true,dailyTime:'09:00',expectedRevision:0}};
beforeEach(()=>{vi.stubGlobal('localStorage',memory());vi.stubGlobal('sessionStorage',memory());transport.mockReset();});
afterEach(()=>vi.unstubAllGlobals());
describe('demo preferences remain explicit local settings',()=>{
 it('has daily default but no assumed area or real transport',async()=>{
  expect(await readNotificationSettings('design')).toMatchObject({preferences:{audience:'unassigned',cadence:'daily',dailyTime:'09:00'},sendingEnabled:false,lastEmail:null});
  expect(transport).not.toHaveBeenCalled();
 });
 it('persists own settings and confirms a replay after local journal cleanup failed',async()=>{
  const first=await saveNotificationSettings('member',op);
  expect(await saveNotificationSettings('member',op)).toEqual(first);
  expect(await readNotificationSettings('other')).toMatchObject({preferences:{audience:'unassigned',revision:0}});
  expect((await readNotificationSettings('member')).preferences.revision).toBe(1);
  expect(transport).not.toHaveBeenCalled();
 });
 it('rejects changed-payload reuse and concurrent stale revision',async()=>{
  await saveNotificationSettings('member',op);
  await expect(saveNotificationSettings('member',{...op,preferences:{...op.preferences,cadence:'hourly'}})).rejects.toMatchObject({definitive:true});
  await expect(saveNotificationSettings('member',{...op,requestId:crypto.randomUUID()})).rejects.toMatchObject({definitive:true});
 });
 it('does not claim successful persistence when storage fails',async()=>{
  vi.stubGlobal('localStorage',{...memory(),setItem:()=>{throw new Error('storage blocked');}});
  await expect(saveNotificationSettings('member',op)).rejects.toThrow('storage blocked');
 });
 it('restores the exact outstanding operation and refuses corrupt journal',()=>{
  sessionStorage.setItem(preferenceJournalKey('member'),JSON.stringify(op));expect(readPreferenceSave('member')).toEqual(op);expect(readPreferenceSave('other')).toBeNull();
  sessionStorage.setItem(preferenceJournalKey('member'),JSON.stringify({...op,requestId:'-'.repeat(36)}));expect(()=>readPreferenceSave('member')).toThrow();
 });
});
