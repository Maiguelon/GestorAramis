import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import type { WorkspaceState } from '../../contracts/domain';
import type { DriveAsset } from '../../src/lib/drive-api';

const userId = 'f0000000-0000-4000-8000-000000000001';
const memberId = '10000000-0000-4000-8000-000000000001';
const pieceId = '20000000-0000-4000-8000-000000000001';
const authOrigin = 'https://shared-ui-test.supabase.co';
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.FAKE_SIGNATURE`;
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'miguel@example.test', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: new Date().toISOString() };
const session = { access_token: accessToken, refresh_token: 'FAKE_REFRESH_TOKEN', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
const state: WorkspaceState = {
  schemaVersion: 1, members: [{ id: memberId, name: 'Miguel', initials: 'M' }],
  clients: [{ id: 'client-drive', name: 'Cliente Drive', initials: 'CD', color: '#1b2a41', contactName: '', phone: '' }],
  pieces: [{ id: pieceId, clientId: 'client-drive', title: 'Reel con tomas', format: 'reel', status: 'production', workArea: 'design', productionStage: 'ready', planMonth: '2026-09', ownerId: memberId, plannedDate: '2026-09-10', caption: '', internalNote: '', script: 'Guion privado', archived: false, visibleToClient: false, revision: 1, createdAt: '2026-09-01T12:00:00Z', updatedAt: '2026-09-01T12:00:00Z' }],
  reviews: [], materials: [], responses: [], shares: [], activities: [],
};
interface Start { uploadId: string; pieceId: string; name: string; size: number; mimeType: string; fingerprint: string }

/** Entire service, including the Google upload host, is mocked. No real Google traffic or credentials. */
async function mockDrive(context: BrowserContext) {
  const starts: Start[] = [];
  const sessions = new Map<string, Start>();
  const assets: DriveAsset[] = [];
  const completed = new Map<string, DriveAsset>();
  const chunks: Array<{ uploadId: string; range: string }> = [];
  const acknowledged = new Map<string, number>();
  const completionCalls: string[] = [], callbackCalls: Array<{ code: string; state: string }> = [];
  let failStart = false, failComplete = '', failDownload = '', configured = true, connected = true, interruptAfterFirstChunk = false, expiredProbe = false;
  let unreadableFinal = false, networkDown = false;
  await context.route(`${authOrigin}/auth/v1/**`, route => route.request().url().includes('/logout') ? route.fulfill({ status: 204 }) : route.fulfill({ json: route.request().url().includes('/token') ? session : user }));
  await context.route('**/api/workspace', route => route.fulfill({ json: { state, memberId, workspaceId: 'workspace-drive', workspaceName: 'Aramis · prueba Drive' } }));
  await context.route('**/api/drive/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (!url.pathname.endsWith('/content') && request.method() !== 'DELETE') expect(request.headers().authorization).toBe(`Bearer ${accessToken}`);
    if (url.pathname.endsWith('/status')) return route.fulfill({ json: { configured, connected, accountEmail: 'drive@example.test' } });
    if (url.pathname.endsWith('/media-session')) return route.fulfill({ json: { ok: true } });
    if (url.pathname.includes('/pieces/')) return route.fulfill({ json: { assets, folderUrl: 'https://drive.google.com/drive/folders/folder_test' } });
    if (url.pathname.endsWith('/uploads')) {
      const start = request.postDataJSON() as Start; starts.push(start); sessions.set(start.uploadId, start);
      if (failStart) { failStart = false; return route.abort('failed'); }
      return route.fulfill({ json: completed.has(start.uploadId) ? { asset: completed.get(start.uploadId) } : { session: { uploadId: start.uploadId, sessionUrl: `https://www.googleapis.com/upload/drive/v3/files?upload_id=${start.uploadId}`, expectedSize: start.size, mimeType: start.mimeType } } });
    }
    if (url.pathname.endsWith('/complete')) {
      const uploadId = url.pathname.split('/').at(-2)!; completionCalls.push(uploadId);
      const start = sessions.get(uploadId)!;
      if (start.name === failComplete) return route.fulfill({ status: 503, json: { code: 'service_unavailable' } });
      if (!expiredProbe && acknowledged.get(uploadId) !== start.size) return route.fulfill({ status: 409, json: { code: 'upload_incomplete' } });
      const asset: DriveAsset = { id: uploadId, name: start.name, size: start.size, mimeType: start.mimeType, source: 'drive' };
      if (!completed.has(uploadId)) assets.push(asset); completed.set(uploadId, asset);
      return route.fulfill({ json: { asset } });
    }
    if (url.pathname.endsWith('/content')) {
      const id = url.pathname.split('/').at(-2)!;
      const asset = assets.find(item => item.id === id);
      if (!asset || asset.name === failDownload) return route.fulfill({ status: 409, json: { code: 'asset_changed_or_inaccessible' } });
      return route.fulfill({ body: Buffer.alloc(asset.size, 5), contentType: asset.mimeType, headers: { 'Content-Length': String(asset.size) } });
    }
    if (url.pathname.endsWith('/callback')) { callbackCalls.push(request.postDataJSON() as { code: string; state: string }); return route.fulfill({ json: { connected: true, accountEmail: 'drive@example.test' } }); }
    return route.fulfill({ status: 404, json: { code: 'not_found' } });
  });
  await context.route('https://www.googleapis.com/**', async route => {
    const request = route.request();
    const uploadId = new URL(request.url()).searchParams.get('upload_id')!;
    expect(request.headers().authorization).toBeUndefined();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'PUT', 'Access-Control-Allow-Headers': 'Content-Type, Content-Range' } });
    const range = request.headers()['content-range'];
    if (networkDown) return route.abort('failed');
    if (range.startsWith('bytes */')) {
      if (expiredProbe) return route.fulfill({status:404,headers:{'Access-Control-Allow-Origin':'*'}});
      const size = acknowledged.get(uploadId) ?? 0;
      if (unreadableFinal && size === sessions.get(uploadId)?.size) return route.abort('failed');
      return route.fulfill({ status: size === sessions.get(uploadId)?.size ? 200 : 308, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Range', ...(size ? { Range: `bytes=0-${size - 1}` } : {}) } });
    }
    chunks.push({ uploadId, range });
    if (interruptAfterFirstChunk && acknowledged.has(uploadId)) return route.fulfill({ status: 503, headers: { 'Access-Control-Allow-Origin': '*' } });
    const end = Number(/^bytes \d+-(\d+)\//.exec(range)?.[1]) + 1;
    acknowledged.set(uploadId, end);
    if (unreadableFinal && end === sessions.get(uploadId)?.size) return route.abort('failed');
    return route.fulfill({ status: end === sessions.get(uploadId)?.size ? 200 : 308, body: '{}', contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Range', Range: `bytes=0-${end - 1}` } });
  });
  return { starts, assets, chunks, completionCalls, callbackCalls, unreadableCompletion() {unreadableFinal=true;}, stopNetwork() {networkDown=true;}, expireProbe() {expiredProbe=true;}, interruptChunks(value: boolean) { interruptAfterFirstChunk = value; }, failStartOnce() { failStart = true; }, failCompletion(name: string) { failComplete = name; }, failDownloading(name: string) { failDownload = name; }, disconnect() { connected = false; }, unconfigure() { configured = false; connected = false; } };
}
async function login(page: Page, path = '/') {
  await page.goto(path);
  await page.getByLabel('Correo', { exact: true }).fill('miguel@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('FAKE_PASSWORD');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
}
async function material(page: Page) {
  await page.getByRole('button', { name: 'Producción', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir Reel con tomas', exact: true }).click();
  await page.getByRole('tab', { name: 'Material', exact: true }).click();
  await expect(page.getByLabel('Agregar material del equipo')).toBeEnabled();
}
async function select(page: Page, files: Array<{ name: string; type?: string; content?: string }>) {
  await page.getByLabel('Agregar material del equipo').evaluate((input, list) => {
    const transfer = new DataTransfer();
    for (const item of list) transfer.items.add(new File([item.content ?? 'FAKE_VIDEO_BYTES'], item.name, { type: item.type ?? 'video/mp4', lastModified: 1_700_000_000_000 }));
    (input as HTMLInputElement).files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, files);
}
const upload = (page: Page, name: string) => page.getByRole('article', { name: `Carga de ${name}`, exact: true });

test('sesión vencida recupera sólo la confirmación del servidor sin volver a transferir', async ({page,context}) => {
  const service=await mockDrive(context); service.expireProbe();
  await login(page); await material(page); await select(page,[{name:'recuperado.mp4'}]);
  await expect(upload(page,'recuperado.mp4')).toContainText('Guardado en Drive');
  expect(service.chunks).toHaveLength(0); expect(service.completionCalls).toHaveLength(1); expect(service.starts).toHaveLength(1);
  service.failCompletion('incompleto.mp4'); await select(page,[{name:'incompleto.mp4'}]);
  await expect(upload(page,'incompleto.mp4')).toContainText('La sesión de carga venció');
  expect(service.assets).toHaveLength(1); expect(service.chunks).toHaveLength(0);
});

test('respuesta final ilegible recupera el archivo verificado sin duplicar transferencia', async ({page,context}) => {
  const service=await mockDrive(context); service.unreadableCompletion();
  await login(page); await material(page); await select(page,[{name:'confirmado.mp4'}]);
  await expect(upload(page,'confirmado.mp4')).toContainText('Guardado en Drive',{timeout:15000});
  expect(service.chunks).toHaveLength(1); expect(service.starts).toHaveLength(1); expect(service.completionCalls).toHaveLength(1);
  expect(service.assets).toHaveLength(1);
  service.failCompletion('sin-confirmacion.mp4'); await select(page,[{name:'sin-confirmacion.mp4'}]);
  await expect(upload(page,'sin-confirmacion.mp4').getByRole('button',{name:'Reintentar carga'})).toBeVisible({timeout:15000});
  expect(service.assets).toHaveLength(1);
});

test('una interrupción antes de recibir bytes no se presenta como guardado', async ({page,context}) => {
  const service=await mockDrive(context); service.stopNetwork();
  await login(page); await material(page); await select(page,[{name:'pendiente.mp4'}]);
  await expect(upload(page,'pendiente.mp4').getByRole('button',{name:'Reintentar carga'})).toBeVisible({timeout:15000});
  expect(service.chunks).toHaveLength(0); expect(service.completionCalls).toHaveLength(1); expect(service.assets).toHaveLength(0);
});

test('varias tomas: conserva éxitos y reintenta sólo verificación fallida sin repetir transferencia', async ({ page, context }) => {
  const service = await mockDrive(context); service.failCompletion('toma-2.mp4');
  await login(page); await material(page);
  await select(page, [{ name: 'toma-1.mp4' }, { name: 'toma-2.mp4' }]);
  await expect(upload(page, 'toma-1.mp4')).toContainText('Guardado en Drive');
  await expect(upload(page, 'toma-2.mp4').getByRole('button', { name: 'Reintentar verificación' })).toBeVisible();
  expect(service.assets).toHaveLength(1); expect(service.chunks).toHaveLength(2);
  expect(service.starts[0].uploadId).not.toBe(service.starts[1].uploadId);
  await expect(page.locator('.drive-asset')).toHaveCount(1);
  service.failCompletion(''); await upload(page, 'toma-2.mp4').getByRole('button', { name: 'Reintentar verificación' }).click();
  await expect(upload(page, 'toma-2.mp4')).toContainText('Guardado en Drive');
  expect(service.chunks).toHaveLength(2); expect(service.assets).toHaveLength(2);
  expect(service.completionCalls.filter(id => id === service.starts[1].uploadId)).toHaveLength(2);
  await expect(page.locator('.drive-asset')).toHaveCount(2);
});

test('inicio con respuesta perdida conserva UUID y no guarda capabilities en sessionStorage', async ({ page, context }) => {
  const service = await mockDrive(context); service.failStartOnce();
  await login(page); await material(page); await select(page, [{ name: 'reintento.mp4' }]);
  await expect(upload(page, 'reintento.mp4').getByRole('button', { name: 'Reintentar carga' })).toBeVisible();
  const journal = await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('aramis.drive.uploads.')).map(key => sessionStorage.getItem(key)).join(''));
  expect(journal).toContain(service.starts[0].uploadId); expect(journal).not.toContain('sessionUrl'); expect(journal).not.toContain('googleapis.com');
  await upload(page, 'reintento.mp4').getByRole('button', { name: 'Reintentar carga' }).click();
  await expect(upload(page, 'reintento.mp4')).toContainText('Guardado en Drive');
  expect(service.starts).toHaveLength(2); expect(service.starts[0].uploadId).toBe(service.starts[1].uploadId); expect(service.assets).toHaveLength(1);
});

test('recarga pide archivo original; otro contenido no reutiliza su carga pendiente', async ({ page, context }) => {
  const service = await mockDrive(context); service.failStartOnce();
  await login(page); await material(page); await select(page, [{ name: 'original.mp4', content: 'ONE' }]);
  await expect(upload(page, 'original.mp4').getByRole('button', { name: 'Reintentar carga' })).toBeVisible();
  const originalId = service.starts[0].uploadId;
  await page.reload(); await material(page);
  await expect(upload(page, 'original.mp4')).toContainText('Volvé a seleccionar el archivo original');
  await select(page, [{ name: 'original.mp4', content: 'TWO' }]);
  await expect(page.locator('.drive-asset')).toHaveCount(1);
  expect(service.starts[1].uploadId).not.toBe(originalId);
  await select(page, [{ name: 'original.mp4', content: 'ONE' }]);
  await expect(page.locator('.drive-asset')).toHaveCount(2);
  expect(service.starts[2].uploadId).toBe(originalId);
});

test('ZIP falla completo si falta una toma; archivos grandes siguen descargables individualmente', async ({ page, context }) => {
  const service = await mockDrive(context);
  service.assets.push({ id: 'asset-one', name: 'uno.pdf', size: 3, mimeType: 'application/pdf', source: 'drive' }, { id: 'asset-two', name: 'dos.pdf', size: 3, mimeType: 'application/pdf', source: 'drive' });
  service.failDownloading('dos.pdf');
  let downloads = 0; page.on('download', () => downloads++);
  await login(page); await material(page); await page.getByRole('button', { name: 'Descargar todo (ZIP)' }).click();
  await expect(page.getByRole('alert')).toContainText('No se creó un ZIP parcial'); expect(downloads).toBe(0);
  service.assets.push({ id: 'asset-large', name: 'grande.mov', size: 270 * 1024 ** 2, mimeType: 'application/octet-stream', source: 'drive' });
  await page.getByRole('button', { name: 'Actualizar material' }).click();
  await expect(page.getByText(/Este conjunto debe descargarse por archivo/)).toBeVisible();
  await page.getByRole('button', { name: 'Descargar todo (ZIP)' }).click();
  await expect(page.getByRole('alert')).toContainText('supera 256 MB'); expect(downloads).toBe(0);
  await expect(page.getByRole('link', { name: 'Descargar', exact: true })).toHaveCount(3);
});

test('selección móvil informa archivos inválidos y carga los válidos sin desbordar', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const service = await mockDrive(context); await login(page);
  await page.getByRole('button', { name: 'Abrir menú' }).click(); await material(page);
  await select(page, [{ name: 'vacio.mp4', content: '' }, { name: 'pagina.html', type: 'text/html', content: 'no' }, { name: 'toma-con-nombre-muy-largo-desde-el-celular.mp4' }]);
  await expect(page.getByRole('alert')).toContainText('El archivo está vacío');
  await expect(upload(page, 'toma-con-nombre-muy-largo-desde-el-celular.mp4')).toContainText('Guardado en Drive');
  expect(service.starts).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('pausa y continúa la misma sesión desde los bytes confirmados; no vuelve a subir el primer bloque', async ({ page, context }) => {
  const service = await mockDrive(context); service.interruptChunks(true);
  await login(page); await material(page);
  await select(page, [{ name: 'toma-larga.mp4', content: 'x'.repeat(6 * 1024 ** 2) }, { name: 'toma-en-cola.mp4' }]);
  await expect(upload(page, 'toma-larga.mp4')).toContainText('Conexión interrumpida');
  await page.getByRole('button', { name: 'Pausar cargas' }).click();
  await expect(upload(page, 'toma-larga.mp4').getByRole('button', { name: 'Continuar carga' })).toBeVisible();
  await expect(upload(page, 'toma-en-cola.mp4').getByRole('button', { name: 'Continuar carga' })).toBeVisible();
  expect(service.assets).toHaveLength(0); expect(service.completionCalls).toHaveLength(0);
  service.interruptChunks(false);
  await upload(page, 'toma-larga.mp4').getByRole('button', { name: 'Continuar carga' }).click();
  await expect(upload(page, 'toma-larga.mp4')).toContainText('Guardado en Drive');
  expect(service.starts).toHaveLength(1);
  expect(service.chunks.filter(chunk => chunk.range.startsWith('bytes 0-'))).toHaveLength(1);
  expect(service.assets).toHaveLength(1);
  await upload(page, 'toma-en-cola.mp4').getByRole('button', { name: 'Continuar carga' }).click();
  await expect(upload(page, 'toma-en-cola.mp4')).toContainText('Guardado en Drive');
  expect(service.assets).toHaveLength(2);
});

test('retorno OAuth exige login, consume la respuesta una vez y limpia el enlace', async ({ page, context }) => {
  const service = await mockDrive(context);
  await login(page, '/#drive-callback=code=FAKE_ONE_TIME_CODE&state=FAKE_ONE_TIME_STATE');
  await expect(page.getByRole('status')).toHaveText('Google Drive quedó conectado. Ya podés subir material desde una pieza.');
  expect(service.callbackCalls).toEqual([{ code: 'FAKE_ONE_TIME_CODE', state: 'FAKE_ONE_TIME_STATE' }]);
  expect(new URL(page.url()).hash).toBe('');
  await page.getByRole('button', { name: 'Volver al gestor' }).click();
  await expect(page.getByRole('heading', { name: 'Esta semana', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Esta semana', exact: true })).toBeVisible();
  expect(service.callbackCalls).toHaveLength(1);
});

test('ZIP completo conserva los bytes y diferencia nombres repetidos', async ({ page, context }) => {
  const service = await mockDrive(context);
  service.assets.push({ id: 'asset-one', name: 'toma.pdf', size: 3, mimeType: 'application/pdf', source: 'drive' }, { id: 'asset-two', name: 'toma.pdf', size: 4, mimeType: 'application/pdf', source: 'drive' });
  await login(page); await material(page);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar todo (ZIP)' }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('Reel con tomas.zip');
  const chunks: Buffer[] = [];
  for await (const chunk of (await download.createReadStream())!) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  let offset = 0;
  for (const [name, size] of [['toma.pdf', 3], ['toma (2).pdf', 4]] as const) {
    expect(bytes.readUInt32LE(offset)).toBe(0x04034b50);
    const nameLength = bytes.readUInt16LE(offset + 26), start = offset + 30 + nameLength;
    expect(bytes.subarray(offset + 30, start).toString()).toBe(name);
    expect(bytes.subarray(start, start + size).equals(Buffer.alloc(size, 5))).toBe(true);
    offset = start + size;
  }
  expect(bytes.readUInt32LE(offset)).toBe(0x02014b50);
  await expect(page.getByRole('button', { name: 'Descargar todo (ZIP)' })).toBeEnabled();
});

test('cerrar sesión desde otra pestaña cancela un ZIP que ya recibió encabezados y no descarga datos después', async ({ page, context }) => {
  const service = await mockDrive(context);
  service.assets.push({ id: 'asset-slow', name: 'lento.pdf', size: 6, mimeType: 'application/pdf', source: 'drive' });
  await login(page); await material(page);
  let downloads = 0; page.on('download', () => downloads++);
  await page.evaluate(() => {
    const state = window as unknown as { zipReadStarted: boolean; zipReadCancelled: boolean };
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      if (String(args[0]).includes('/assets/asset-slow/content')) {
        state.zipReadStarted = true;
        return new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([5, 5, 5])); }, cancel() { state.zipReadCancelled = true; } }), { headers: { 'Content-Length': '6', 'Content-Type': 'application/pdf' } });
      }
      return originalFetch(...args);
    };
  });
  await page.getByRole('button', { name: 'Descargar todo (ZIP)' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { zipReadStarted: boolean }).zipReadStarted)).toBe(true);
  const other = await context.newPage(); await other.goto('/');
  await other.getByRole('button', { name: 'Configuración', exact: true }).click();
  await other.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ingresar al equipo' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { zipReadCancelled: boolean }).zipReadCancelled)).toBe(true);
  expect(downloads).toBe(0);
  await other.close();
});

test('imports Drive material in the piece, retains it on sync failure and hides it after a successful removal sync', async ({ page, context }) => {
  const mock=await mockDrive(context);
  await context.route('**/api/drive/status',route=>route.fulfill({json:{configured:true,connected:true,canImport:true}}));
  let fail=false,removed=false,calls=0;
  await context.route('**/api/drive/pieces/*/sync',route=>{calls++;if(!fail){mock.assets.splice(0,mock.assets.length,...(removed?[]:[{id:'external',name:'prueba_drive.mp4',mimeType:'video/mp4',size:10,source:'drive' as const}]));}return fail?route.fulfill({status:502,json:{code:'drive_sync_incomplete'}}):route.fulfill({json:{assets:removed?[]:[{id:'external',name:'prueba_drive.mp4',mimeType:'video/mp4',size:10,source:'drive'}],folderUrl:'https://drive.google.com/drive/folders/material-folder',changed:false,skipped:0,syncedAt:new Date().toISOString()}});});
  await login(page);await material(page);
  await expect(page.getByText('prueba_drive.mp4',{exact:true})).toBeVisible();
  await expect(page.getByText(/Drive revisado a las/)).toBeVisible();
  const refresh=page.getByRole('button',{name:'Actualizar material',exact:true});
  fail=true;await refresh.click();await expect(page.getByText(/No se pudo revisar toda la carpeta/)).toBeVisible();
  await expect(page.getByText('prueba_drive.mp4',{exact:true})).toBeVisible();
  fail=false;removed=true;await refresh.click();await expect(page.getByText('prueba_drive.mp4',{exact:true})).toHaveCount(0);
  expect(calls).toBeGreaterThanOrEqual(3);
});
