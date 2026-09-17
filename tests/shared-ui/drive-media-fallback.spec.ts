import { expect, test } from '@playwright/test';
import type { WorkspaceState } from '../../contracts/domain';
import type { DriveAsset } from '../../src/lib/drive-api';

test('miniaturas MOV/M4V, recuperación y descarga original sin cargar videos al abrir', async ({ page, context }) => {
  // Auth and Drive are simulated: this checks rendering and protected links,
  // not native download completion, Google streaming, or real codec support.
  const userId = 'f0000000-0000-4000-8000-000000000001';
  const memberId = '10000000-0000-4000-8000-000000000001';
  const pieceId = '20000000-0000-4000-8000-000000000001';
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.FAKE_SIGNATURE`;
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'miguel@example.test', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: new Date().toISOString() };
  const session = { access_token: accessToken, refresh_token: 'FAKE_REFRESH_TOKEN', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
  const state: WorkspaceState = {
    schemaVersion: 1, members: [{ id: memberId, name: 'Miguel', initials: 'M' }],
    clients: [{ id: 'client-video', name: 'Cliente Video', initials: 'CV', color: '#1b2a41', contactName: '', phone: '' }],
    pieces: [{ id: pieceId, clientId: 'client-video', title: 'Tomas de celular', format: 'reel', status: 'production', workArea: 'design', productionStage: 'ready', planMonth: '2026-09', ownerId: memberId, plannedDate: '2026-09-10', caption: '', internalNote: '', script: '', archived: false, visibleToClient: false, revision: 1, createdAt: '2026-09-01T12:00:00Z', updatedAt: '2026-09-01T12:00:00Z' }],
    reviews: [], materials: [], responses: [], shares: [], activities: [],
  };
  const bytes = Buffer.from('SYNTHETIC_MEDIA_DOWNLOAD_BYTES');
  const assets: DriveAsset[] = [
    { id: 'asset-mov', name: 'toma.mov', mimeType: 'video/quicktime', size: bytes.length, source: 'drive' },
    { id: 'asset-m4v', name: 'toma.m4v', mimeType: 'video/x-m4v', size: bytes.length, source: 'drive' },
    { id: 'asset-mp4', name: 'toma.mp4', mimeType: 'video/mp4', size: bytes.length, source: 'drive' },
  ];
  const contentRequests: string[] = [];
  let thumbnailReady = false;
  const thumbnail = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64');
  await context.route('https://shared-ui-test.supabase.co/auth/v1/**', route => route.fulfill({ json: route.request().url().includes('/token') ? session : user }));
  await context.route('**/api/workspace', route => route.fulfill({ json: { state, memberId, workspaceId: 'workspace-video', workspaceName: 'Aramis · prueba de formatos' } }));
  await context.route('**/api/drive/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/status')) return route.fulfill({ json: { configured: true, connected: true } });
    if (url.pathname.endsWith('/media-session')) return route.fulfill({ json: { ok: true } });
    if (url.pathname.includes('/pieces/')) return route.fulfill({ json: { assets } });
    if (url.pathname.endsWith('/thumbnail')) return !thumbnailReady && url.pathname.includes('/asset-m4v/')
      ? route.fulfill({ status:404 }) : route.fulfill({ body:thumbnail,contentType:'image/png' });
    if (url.pathname.endsWith('/content')) {
      contentRequests.push(url.pathname + url.search);
      const asset = assets.find(item => url.pathname.includes(`/${item.id}/`));
      if (!asset) return route.fulfill({ status: 404 });
      return route.fulfill({ body: bytes, contentType: 'application/octet-stream', headers: { 'Content-Disposition': `attachment; filename="${asset.name}"`, 'Content-Length': String(bytes.length) } });
    }
    return route.fulfill({ status: 404 });
  });
  await page.goto('/');
  await page.getByLabel('Correo', { exact: true }).fill('miguel@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('FAKE_PASSWORD');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.getByRole('button', { name: 'Producción', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir Tomas de celular', exact: true }).click();
  await page.getByRole('tab', { name: 'Material', exact: true }).click();
  await expect(page.getByText('Este formato se consulta descargando el archivo.', { exact: true })).toHaveCount(2);
  await expect(page.locator('.drive-asset video')).toHaveCount(0);
  await expect(page.getByRole('img', {name:'Miniatura de toma.mov'})).toBeVisible();
  await expect.poll(()=>page.getByRole('img', {name:'Miniatura de toma.mov'}).evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBe(1);
  await expect(page.getByText('Miniatura no disponible', {exact:true})).toBeVisible();
  expect(contentRequests).toEqual([]);

  for (const asset of assets) {
    const card = page.locator('.drive-asset').filter({ has: page.getByText(asset.name, { exact: true }) });
    await expect(card.getByRole('link', { name: 'Descargar', exact: true })).toHaveAttribute('href', `/api/drive/assets/${asset.id}/content?download=1`);
  }
  expect(contentRequests).toEqual([]);
  thumbnailReady=true;
  await page.getByRole('button',{name:'Actualizar material',exact:true}).click();
  await expect.poll(()=>page.getByRole('img',{name:'Miniatura de toma.m4v'}).evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBe(1);
  await expect(page.getByText('Miniatura no disponible',{exact:true})).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole('img',{name:'Miniatura de toma.mov'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  const mov=page.locator('.drive-asset').filter({has:page.getByText('toma.mov',{exact:true})});
  expect(contentRequests).toEqual([]);
  await expect(mov.getByRole('button',{name:/Reproducir/})).toHaveCount(0);
  await page.getByRole('button',{name:'Reproducir toma.mp4',exact:true}).click();
  await expect.poll(()=>contentRequests.some(url=>url==='/api/drive/assets/asset-mp4/content')).toBe(true);
});
