// One-use local form for installing the existing Supabase server key without
// printing it, passing it as a command argument, or checking it into Git.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const target=fileURLToPath(new URL('../.dev.vars',import.meta.url));
const nonce=randomBytes(24).toString('hex');
const origin='http://127.0.0.1:8977';
const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy',"default-src 'none'; form-action 'self'; frame-ancestors 'none'; style-src 'unsafe-inline'");
  if(req.headers.host!=='127.0.0.1:8977'||req.url!==`/${nonce}`){res.writeHead(404);res.end();return;}
  if(req.method==='GET'){
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end('<!doctype html><html lang="es"><meta charset="utf-8"><title>Configurar servidor de Aramis</title><body style="font:18px system-ui;max-width:650px;margin:60px auto;padding:20px"><h1>Clave del servidor</h1><p>La clave privada existente de Supabase se guardará sólo en la configuración local ignorada por Git, para instalarla después como secreto del servidor de Cloudflare. No se mostrará en la conversación.</p><form method="post"><label>Clave privada de Supabase <input style="display:block;width:100%;margin:20px 0" type="password" name="key" autocomplete="off" required></label><button>Guardar configuración local</button></form></body></html>');return;
  }
  if(req.method!=='POST'||req.headers.origin!==origin){res.writeHead(403);res.end();return;}
  let body='';for await(const chunk of req){body+=chunk;if(body.length>10_000){res.writeHead(413);res.end();return;}}
  const key=new URLSearchParams(body).get('key')?.trim();
  if(!key||!(/^sb_secret_[A-Za-z0-9_-]+$/.test(key)||/^eyJ[A-Za-z0-9_.-]+$/.test(key))){res.writeHead(400);res.end('Formato inválido. Volvé e intentá de nuevo.');return;}
  try{
    const old=await readFile(target,'utf8');
    const clean=old.replace(/^SUPABASE_SERVICE_ROLE_KEY\s*=.*(?:\r?\n|$)/gm,'');
    await writeFile(target,clean.trimEnd()+'\nSUPABASE_SERVICE_ROLE_KEY='+JSON.stringify(key)+'\n');
    res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<h1>Configuración guardada</h1><p>Podés cerrar esta pestaña.</p>');
    console.log('Server key saved locally. Value was not logged.');server.close();
  }catch{res.writeHead(500);res.end('No se pudo guardar.');}
});
server.listen(8977,'127.0.0.1',()=>console.log(`Open local setup: ${origin}/${nonce}`));
const timeout=setTimeout(()=>server.close(),15*60_000);timeout.unref();
