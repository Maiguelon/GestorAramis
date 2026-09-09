import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
import { build, loadEnv } from 'vite';

// Only this ignored staging directory is emptied by Vite. Never publish dist,
// which may contain the local demo from a previous build.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const staging = join(root, 'work', 'pages-deploy');
const site = join(staging, 'site');
const outputRelative = relative(join(root, 'work'), site);
if (isAbsolute(outputRelative) || outputRelative.startsWith('..') || !outputRelative) {
  throw new Error('Deployment output must stay inside the workspace work directory.');
}

const frontend = loadEnv('shared', root, 'VITE_');
const backend = parseEnv(await readFile(join(root, '.dev.vars'), 'utf8'));
const url = backend.SUPABASE_URL;
const key = backend.SUPABASE_PUBLISHABLE_KEY;
const workspace = backend.ARAMIS_WORKSPACE_ID;
if (frontend.VITE_APP_MODE !== 'production' || frontend.VITE_API_BASE_URL !== '/api') {
  throw new Error('Pages requires production mode and a same-origin /api endpoint.');
}
if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url ?? '') ||
    !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key ?? '') ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspace ?? '') ||
    frontend.VITE_SUPABASE_URL !== url || frontend.VITE_SUPABASE_PUBLISHABLE_KEY !== key) {
  throw new Error('Check matching public Supabase settings and workspace in local configuration.');
}

function run(script, args) {
  const result = spawnSync(process.execPath, [join(root, script), ...args], {
    cwd: root, stdio: 'inherit', shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Build step failed: ${script}`);
}

run('node_modules/typescript/bin/tsc', ['-b']);
await mkdir(staging, { recursive: true });
await build({ root, mode: 'shared', build: { outDir: site, emptyOutDir: true, sourcemap: false } });
run('node_modules/wrangler/bin/wrangler.js', [
  'pages', 'functions', 'build', '--outdir', 'work/pages-build',
]);
await copyFile(join(root, 'work/pages-build/index.js'), join(site, '_worker.js'));
await writeFile(join(site, '_routes.json'), JSON.stringify({ version: 1, include: ['/api/*'], exclude: [] }, null, 2) + '\n');
// Allowlist public runtime configuration. OAuth/Drive/admin secrets are never
// copied from local configuration to the deployment package.
await writeFile(join(staging, 'wrangler.json'), JSON.stringify({
  name: 'gestor-aramis',
  pages_build_output_dir: './site',
  compatibility_date: '2026-09-01',
  vars: { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key, ARAMIS_WORKSPACE_ID: workspace },
}, null, 2) + '\n');
console.log('Pages package ready in work/pages-deploy. Nothing has been published.');
