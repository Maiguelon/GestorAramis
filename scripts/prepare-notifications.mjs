import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseEnv} from 'node:util';

// Public configuration only. The admin and email keys are installed separately as Worker secrets.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const env=parseEnv(await readFile(join(root,'.dev.vars'),'utf8'));
const enabled=env.NOTIFICATION_EMAIL_ENABLED==='true';
const appUrl=env.NOTIFICATION_APP_URL??'https://gestor.aramis.agency';
if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(env.SUPABASE_URL??'')
 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(env.ARAMIS_WORKSPACE_ID??''))throw new Error('Missing public database/workspace configuration.');
const parsed=new URL(appUrl);
if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)throw new Error('Notification links need an HTTPS app origin.');
if(enabled&&(!env.NOTIFICATION_FROM||!env.RESEND_API_KEY||!env.SUPABASE_SERVICE_ROLE_KEY))throw new Error('Complete and verify the sender configuration before enabling notifications.');
const staging=join(root,'work','notification-deploy');
const vars={SUPABASE_URL:env.SUPABASE_URL,ARAMIS_WORKSPACE_ID:env.ARAMIS_WORKSPACE_ID,NOTIFICATION_EMAIL_ENABLED:String(enabled),NOTIFICATION_APP_URL:appUrl,...(env.NOTIFICATION_FROM?{NOTIFICATION_FROM:env.NOTIFICATION_FROM}:{})};
const config={name:'gestor-aramis-notifications',main:'../../server/notification-worker.ts',compatibility_date:'2026-09-01',workers_dev:false,triggers:{crons:['* * * * *']},vars};
const output=JSON.stringify(config,null,2)+'\n';
for(const key of ['SUPABASE_SERVICE_ROLE_KEY','RESEND_API_KEY','GOOGLE_CLIENT_SECRET','DRIVE_ENCRYPTION_KEY']){
 if(env[key]&&output.includes(env[key]))throw new Error('A private value was found in the public notification configuration.');
}
await mkdir(staging,{recursive:true});await writeFile(join(staging,'wrangler.json'),output);
console.log(`Notification configuration prepared. Email sending: ${enabled?'enabled':'disabled'}. Nothing has been published.`);
