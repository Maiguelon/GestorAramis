// Reads credentials from local ignored files. Never prints values or puts them
// in command arguments/static build output. --install sends only this allowlist
// to the already authorized Cloudflare Pages project over Wrangler's stdin.
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const path = join(root, '.dev.vars');
const names = ['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REDIRECT_URI','DRIVE_ENCRYPTION_KEY','SUPABASE_SERVICE_ROLE_KEY'];
const input = process.argv.find(arg => arg.endsWith('.json'));
const config = parseEnv(await readFile(path, 'utf8'));
if (input) {
  const oauth = JSON.parse(await readFile(input, 'utf8')).web;
  if (oauth?.project_id !== 'gestor-aramis' || !oauth.client_id || !oauth.client_secret || !oauth.redirect_uris?.includes('https://gestor-aramis.pages.dev/api/google/callback')) throw new Error('Unexpected OAuth project or callback. No settings changed.');
  config.GOOGLE_CLIENT_ID = oauth.client_id;
  config.GOOGLE_CLIENT_SECRET = oauth.client_secret;
  config.GOOGLE_REDIRECT_URI = 'https://gestor-aramis.pages.dev/api/google/callback';
  config.DRIVE_ENCRYPTION_KEY ||= randomBytes(32).toString('base64');
  await writeFile(path, Object.entries(config).map(([name,value]) => `${name}=${JSON.stringify(value)}`).join('\n')+'\n');
  console.log('Local OAuth configuration saved; encryption key preserved if present.');
}
if (process.argv.includes('--install')) {
  if (names.some(name => !config[name]) || Buffer.from(config.DRIVE_ENCRYPTION_KEY,'base64').length !== 32) throw new Error('Complete local Drive settings before installing.');
  const child = spawn(process.execPath, [join(root,'node_modules/wrangler/bin/wrangler.js'),'pages','secret','bulk','--project-name','gestor-aramis'], {cwd:root,stdio:['pipe','pipe','pipe'],shell:false});
  const redact = chunk => {
    let message = chunk.toString();
    for (const name of names) message = message.split(config[name]).join('[redacted]');
    return message;
  };
  // Buffer CLI output until complete, so a value split across chunks is redacted.
  let output = ''; child.stdout.on('data', part => output += part); child.stderr.on('data', part => output += part);
  child.stdin.end(JSON.stringify(Object.fromEntries(names.map(name=>[name,config[name]]))));
  const code = await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
  console.log(redact(output));
  if (code !== 0) throw new Error('Cloudflare secret installation failed. Values were not printed.');
}
