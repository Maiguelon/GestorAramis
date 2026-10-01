import {beforeEach,expect,it,vi} from 'vitest';
const transport=vi.hoisted(()=>vi.fn<typeof fetch>());
vi.mock('../src/lib/api',()=>({APP_MODE:'production'}));
vi.mock('../src/lib/shared-api',()=>({SharedApiError:class extends Error{},sharedWorkspace:{authenticatedFetch:transport}}));
import {readNotificationSettings,saveNotificationSettings,type PreferenceSave} from '../src/lib/notifications';
const preferences={audience:'marketing',cadence:'daily',enabled:true,dailyTime:'09:00',revision:2};
const operation:PreferenceSave={requestId:'00000000-0000-4000-8000-000000000001',preferences:{audience:'marketing',cadence:'daily',enabled:true,dailyTime:'09:00',expectedRevision:1}};
beforeEach(()=>transport.mockReset());
it('settings writes use exact own preference endpoint and no recipient supplied by browser',async()=>{
 transport.mockResolvedValue(Response.json({preferences,sendingEnabled:true,lastEmail:null}));
 expect((await saveNotificationSettings('member',operation)).preferences).toEqual(preferences);
 expect(transport.mock.calls[0][0]).toBe('/api/notifications/preferences');
 expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).toEqual(operation);
});
it('a lost response or malformed success remains uncertain with a safe Spanish message',async()=>{
 transport.mockRejectedValue(new TypeError('raw network detail'));
 await expect(saveNotificationSettings('member',operation)).rejects.toMatchObject({definitive:false,message:'No pudimos confirmar el guardado. Usá Reintentar guardado.'});
 transport.mockResolvedValue(Response.json({preferences:{...preferences,revision:null},sendingEnabled:true}));
 await expect(readNotificationSettings('member')).rejects.toMatchObject({definitive:false});
});
it('definitive revision conflicts can release the retry journal, while 5xx cannot',async()=>{
 transport.mockResolvedValue(Response.json({code:'CONFLICT',detail:'upstream sensitive text'},{status:409}));
 await expect(saveNotificationSettings('member',operation)).rejects.toMatchObject({definitive:true});
 transport.mockResolvedValue(Response.json({detail:'upstream secret'},{status:503}));
 await expect(saveNotificationSettings('member',operation)).rejects.toMatchObject({definitive:false,message:'No pudimos confirmar la configuración. Volvé a intentar.'});
});
