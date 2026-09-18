import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

// Anonymous checks only. A real staff login/save is a separate manual check;
// this script never accepts credentials or changes workspace data.
const base = new URL(process.argv[2] ?? 'http://127.0.0.1:8788').origin;
const health = await fetch(`${base}/api/health`);
assert.equal(health.status, 200);
assert.equal((await health.json()).configured, true);
for (const path of ['/api/workspace', '/api/commands', '/api/drive/status', '/api/drive/assets/00000000-0000-4000-8000-000000000001/content', '/api/drive/assets/00000000-0000-4000-8000-000000000001/thumbnail', '/api/drive/assets/00000000-0000-4000-8000-000000000001/viewer']) {
  const response = await fetch(base + path, path.endsWith('commands')
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' } : {});
  assert.equal(response.status, 401, `${path} must require a session`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
}
const foreign = await fetch(`${base}/api/workspace`, { headers: { Origin: 'https://example.invalid' } });
assert.equal(foreign.status, 403);
const foreignDrive=await fetch(`${base}/api/drive/connect`, {method:'POST',headers:{Origin:'https://example.invalid','Content-Type':'application/json'},body:'{}'});
assert.equal(foreignDrive.status,403);

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const path of ['/', '/text/deployment-smoke']) {
    const response = await page.goto(base + path);
    assert.equal(response.status(), 200);
    await page.getByRole('heading', { name: 'Ingresar al equipo', exact: true }).waitFor();
    await page.getByLabel('Correo', { exact: true }).waitFor();
    assert.match(response.headers()['x-robots-tag'], /noindex/);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
console.log(`PASS ${base}: login and expanded-text routes, configured API, anonymous/cross-origin denial including Drive. No authenticated operations tested.`);
