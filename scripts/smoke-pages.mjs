import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

// Anonymous checks only. A real staff login/save is a separate manual check;
// this script never accepts credentials or changes workspace data.
const base = new URL(process.argv[2] ?? 'http://127.0.0.1:8788').origin;
const health = await fetch(`${base}/api/health`);
assert.equal(health.status, 200);
assert.equal((await health.json()).configured, true);
const faviconPath = '/brand/feather.svg';
const favicon = await fetch(base + faviconPath);
assert.equal(favicon.status, 200);
assert.match(favicon.headers.get('content-type'), /image\/svg\+xml/);
const manifest = await fetch(base + '/manifest.webmanifest');
assert.equal(manifest.status, 200);
assert.equal((await manifest.json()).icons[0].src, faviconPath);
for (const path of ['/api/notifications/preferences', '/api/drive/pieces/00000000-0000-4000-8000-000000000001/delivery-assets', '/api/workspace', '/api/commands', '/api/drive/status', '/api/drive/assets/00000000-0000-4000-8000-000000000001/content', '/api/drive/assets/00000000-0000-4000-8000-000000000001/thumbnail', '/api/drive/assets/00000000-0000-4000-8000-000000000001/viewer']) {
  const response = await fetch(base + path, path.endsWith('commands')
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' } : {});
  assert.equal(response.status, 401, `${path} must require a session`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
}
const foreign = await fetch(`${base}/api/workspace`, { headers: { Origin: 'https://example.invalid' } });
assert.equal(foreign.status, 403);
const foreignDrive=await fetch(`${base}/api/drive/connect`, {method:'POST',headers:{Origin:'https://example.invalid','Content-Type':'application/json'},body:'{}'});
assert.equal(foreignDrive.status,403);
const foreignPreferences=await fetch(`${base}/api/notifications/preferences`, {method:'POST',headers:{Origin:'https://example.invalid','Content-Type':'application/json'},body:'{}'});
assert.equal(foreignPreferences.status,403);

const browser = await chromium.launch();
try {
  // Informational pages must work without running the staff app or accessing
  // workspace/auth services, even in a browser with JavaScript disabled.
  const publicContext = await browser.newContext({ javaScriptEnabled: false });
  const publicPage = await publicContext.newPage();
  const publicRequests = [];
  const publicFailures = [];
  publicPage.on('request', request => publicRequests.push(request.url()));
  publicPage.on('response', response => { if (response.status() >= 400) publicFailures.push(response.url()); });
  for (const [path, heading] of [['/acerca/', 'Gestor Aramis'], ['/privacidad/', 'Privacy policy']]) {
    const response = await publicPage.goto(base + path);
    assert.equal(response.status(), 200);
    assert.equal(publicPage.url(), base + path, 'Public URL must resolve directly, without redirecting to login');
    assert.match(response.headers()['content-security-policy'], /default-src 'none'/);
    assert.match(response.headers()['x-robots-tag'], /noindex/);
    await publicPage.getByRole('heading', { name: heading, exact: true }).waitFor();
    assert.equal(await publicPage.locator('html').getAttribute('lang'), 'en');
    assert.equal(await publicPage.locator('link[rel=icon]').getAttribute('href'), faviconPath);
    assert.equal(await publicPage.locator('script').count(), 0);
    assert.equal(await publicPage.locator('input[type=password]').count(), 0);
    assert.equal(await publicPage.getByRole('link', { name: 'Open workspace', exact: true }).first().getAttribute('href'), '/');
    assert.equal(await publicPage.getByRole('link', { name: 'Privacy', exact: true }).getAttribute('href'), '/privacidad/');
    assert.equal(await publicPage.getByRole('link', { name: 'Contact', exact: true }).getAttribute('href'), 'mailto:miguelcarreteroangel@gmail.com');
    assert.equal(await publicPage.getByRole('img', { name: 'Aramis', exact: true }).evaluate(img => img.complete && img.naturalWidth > 0), true);
    await publicPage.setViewportSize({width:390,height:844});
    assert.equal(await publicPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'Public pages must fit a mobile viewport');
    await publicPage.setViewportSize({width:1280,height:800});
  }
  assert.deepEqual(publicFailures, []);
  assert.equal(publicRequests.every(value => new URL(value).origin === base && !new URL(value).pathname.startsWith('/api/')), true, 'Public pages must not call authentication, workspace or third-party services');
  await publicContext.close();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const path of ['/', '/text/deployment-smoke']) {
    const response = await page.goto(base + path);
    assert.equal(response.status(), 200);
    await page.getByRole('heading', { name: 'Ingresar al equipo', exact: true }).waitFor();
    await page.getByLabel('Correo', { exact: true }).waitFor();
    assert.equal(await page.locator('link[rel=icon]').getAttribute('href'), faviconPath);
    assert.equal(await page.getByRole('link', { name: 'Privacidad', exact: true }).getAttribute('href'), '/privacidad/');
    assert.match(response.headers()['x-robots-tag'], /noindex/);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
console.log(`PASS ${base}: public English pages without JavaScript or data requests, mobile layout, login and expanded-text routes, configured API, anonymous/cross-origin denial including Drive. No authenticated operations tested.`);
