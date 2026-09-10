import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import type { Command, CommandResult, WorkspaceState } from '../../contracts/domain';
import { applyCommand, DomainError } from '../../src/domain/engine';

const userId = 'f0000000-0000-4000-8000-000000000001';
const memberId = '10000000-0000-4000-8000-000000000001';
const authOrigin = 'https://shared-ui-test.supabase.co';
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.FAKE_SIGNATURE`;
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'miguel@example.test', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: new Date().toISOString() };
const session = { access_token: accessToken, refresh_token: 'FAKE_REFRESH_TOKEN', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
const blankState = (): WorkspaceState => ({ schemaVersion: 1, clients: [], members: [{ id: memberId, name: 'Miguel', initials: 'M' }], pieces: [], reviews: [], materials: [], responses: [], shares: [], activities: [] });

/** Auth and API are browser mocks. These tests do not prove real Supabase permissions. */
async function mockServices(context: BrowserContext) {
  await context.route('**/api/drive/status', route => route.fulfill({ json: { configured: false, connected: false } }));
  await context.route('**/api/drive/media-session', route => route.fulfill({ json: { ok: true } }));
  let state = blankState();
  const operations: Array<{ command: Command; requestId: string }> = [];
  const replies = new Map<string, CommandResult>();
  let loseNextWrite = false, rejectLogin = false, workspaceReads = 0;
  await context.route(`${authOrigin}/auth/v1/**`, async route => {
    if (route.request().url().includes('/logout')) return route.fulfill({ status: 204 });
    if (route.request().url().includes('/token')) {
      if (rejectLogin) return route.fulfill({ status: 400, json: { error: 'invalid_grant', error_description: 'Invalid login credentials' } });
      return route.fulfill({ status: 200, json: session });
    }
    return route.fulfill({ status: 200, json: user });
  });
  await context.route('**/api/workspace', async route => {
    workspaceReads++;
    expect(route.request().headers().authorization).toBe(`Bearer ${accessToken}`);
    return route.fulfill({ json: { state, memberId, workspaceId: 'workspace-remote', workspaceName: 'Aramis prueba compartida' } });
  });
  await context.route('**/api/commands', async route => {
    expect(route.request().headers().authorization).toBe(`Bearer ${accessToken}`);
    const request = route.request().postDataJSON() as { command: Command; requestId: string }; operations.push(request);
    let result = replies.get(request.requestId);
    try {
      if (!result) {
        result = applyCommand(state, request.command, { actor: memberId, now: new Date().toISOString(), newId: () => crypto.randomUUID(), token: () => crypto.randomUUID() });
        state = result.state; replies.set(request.requestId, result);
      }
    } catch (error) { return route.fulfill({ status: 409, json: { code: error instanceof DomainError ? error.code : 'CONFLICT' } }); }
    if (loseNextWrite) { loseNextWrite = false; return route.abort('failed'); }
    return route.fulfill({ json: result });
  });
  return { operations, get state() { return state; }, set state(next: WorkspaceState) { state = next; }, get reads() { return workspaceReads; }, loseWrite() { loseNextWrite = true; }, rejectLogin(value: boolean) { rejectLogin = value; } };
}
async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('Correo', { exact: true }).fill('miguel@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('FAKE_TEST_PASSWORD');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Esta semana', exact: true })).toBeVisible();
}
async function createClient(page: Page, name = 'Cliente compartido') {
  await page.getByRole('button', { name: 'Clientes', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo cliente', exact: true }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Nombre del cliente', { exact: true }).fill(name);
  await form.getByLabel('Posteos por mes', { exact: true }).fill('2');
  await form.getByLabel('Reels por mes', { exact: true }).fill('1');
  await form.getByRole('button', { name: 'Crear cliente', exact: true }).click();
}

test('acceso real requerido; cliente, base mensual, guion privado y capacidades pendientes', async ({ page, context }) => {
  const service = await mockServices(context);
  service.rejectLogin(true); await page.goto('/'); expect(service.reads).toBe(0);
  await page.getByLabel('Correo', { exact: true }).fill('miguel@example.test'); await page.getByLabel('Contraseña', { exact: true }).fill('incorrecta');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('No pudimos ingresar'); expect(service.reads).toBe(0);
  service.rejectLogin(false); await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByText('Aramis prueba compartida · Espacio compartido del equipo')).toBeVisible();
  await createClient(page); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Generar base del mes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Base generada', exact: true })).toBeDisabled();
  expect(service.state.pieces).toHaveLength(3); expect(service.state.pieces.every(piece => piece.ownerId === memberId)).toBe(true);
  await page.getByRole('button', { name: 'Abrir', exact: true }).first().click();
  const detail = page.getByRole('dialog');
  await detail.getByLabel('Guion e instrucciones de producción').fill('Guion privado compartido para Eliana.');
  await detail.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(detail.getByText('Cambios guardados en el espacio compartido.', { exact: true })).toBeVisible();
  const textPromise = page.waitForEvent('popup'); await detail.getByRole('link', { name: 'Expandir guion y texto' }).click(); const text = await textPromise;
  await expect(text.getByText('Guion privado compartido para Eliana.', { exact: true })).toBeVisible();
  await detail.getByRole('tab', { name: 'Material', exact: true }).click();
  await expect(detail.getByText(/estarán disponibles al conectar Google Drive/)).toBeVisible(); expect(await detail.locator('input[type=file]').count()).toBe(0);
  await detail.getByRole('tab', { name: 'Revisión', exact: true }).click(); await expect(detail.getByText(/cuando conectemos los archivos y el acceso de clientes/)).toBeVisible();
  expect(await detail.getByRole('button', { name: /Generar enlace|Preparar revisión/ }).count()).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('aramis.workspace.demo.v1'))).toBeNull();
  await text.close(); await detail.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByRole('button', { name: 'Configuración', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restablecer demostración' })).toHaveCount(0);
});

test('respuesta perdida: reintento desde formulario conserva UUID y no duplica el cliente', async ({ page, context }) => {
  const service = await mockServices(context); await login(page); service.loseWrite(); await createClient(page, 'Cliente sin duplicar');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Reintentar guardado', exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Nombre del cliente')).toBeDisabled();
  expect(service.state.clients).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Reintentar guardado', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); expect(service.state.clients).toHaveLength(1);
  expect(service.operations).toHaveLength(2); expect(service.operations[0].requestId).toBe(service.operations[1].requestId);
});

test('recarga conserva guardado incierto y cierre de sesión cierra también el guion abierto', async ({ page, context }) => {
  const service = await mockServices(context); await login(page); service.loseWrite(); await createClient(page);
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Reintentar guardado', exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: 'Esta semana', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar guardado', exact: true }).click(); await expect(page.getByRole('button', { name: 'Reintentar guardado', exact: true })).toHaveCount(0);
  expect(service.state.clients).toHaveLength(1); expect(service.operations[0].requestId).toBe(service.operations[1].requestId);
  await page.getByRole('button', { name: 'Clientes', exact: true }).click(); await page.getByRole('button', { name: 'Trabajar mes', exact: true }).click();
  await page.getByRole('button', { name: 'Generar base del mes', exact: true }).click(); await page.getByRole('button', { name: 'Abrir', exact: true }).first().click();
  const dialog = page.getByRole('dialog'); const popupPromise = page.waitForEvent('popup'); await dialog.getByRole('link', { name: 'Expandir guion y texto' }).click(); const popup = await popupPromise;
  await expect(popup.getByText('Sólo equipo · Espacio compartido')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click(); await page.getByRole('button', { name: 'Configuración', exact: true }).click(); await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ingresar al equipo' })).toBeVisible(); await expect(popup.getByRole('heading', { name: 'Ingresar al equipo' })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('aramis.shared.pending.')))).toHaveLength(0);
  await popup.close();
});

test('un cambio concurrente conserva el borrador del guion y permite cargar la versión vigente', async ({ page, context }) => {
  const service = await mockServices(context); await login(page); await createClient(page);
  await page.getByRole('button', { name: 'Generar base del mes', exact: true }).click(); await page.getByRole('button', { name: 'Abrir', exact: true }).first().click();
  const dialog = page.getByRole('dialog'); const piece = service.state.pieces[0];
  await dialog.getByLabel('Guion e instrucciones de producción').fill('Borrador que sigue en pantalla');
  const next = structuredClone(service.state); next.pieces.find(item => item.id === piece.id)!.revision++; next.pieces.find(item => item.id === piece.id)!.script = 'Cambio remoto de Eliana'; service.state = next;
  await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(dialog.getByLabel('Guion e instrucciones de producción')).toHaveValue('Borrador que sigue en pantalla');
  await expect(dialog.getByRole('button', { name: 'Cargar datos actuales', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cargar datos actuales', exact: true }).click();
  await expect(dialog.getByLabel('Guion e instrucciones de producción')).toHaveValue('Cambio remoto de Eliana');
});

test('enlaces de calendario y solicitudes permanecen cerrados en modo compartido', async ({ page, context }) => {
  const service = await mockServices(context);
  for (const path of ['/calendar/demo-calendar', '/request/demo-review']) {
    await page.goto(path); await expect(page.getByRole('heading', { name: 'El acceso de clientes todavía no está habilitado' })).toBeVisible();
  }
  expect(service.reads).toBe(0);
});
