import { expect, test, type Page } from '@playwright/test';
import type { WorkspaceState } from '../../contracts/domain';

const storageKey = 'aramis.workspace.demo.v1';
async function storedState(page: Page): Promise<WorkspaceState> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), storageKey);
}

test('el calendario muestra contenido del cliente y mantiene el foco dentro del detalle', async ({ page }) => {
  await page.goto('/calendar/demo-calendar');
  await expect(page.getByRole('heading', { name: /Calendario de Casa Oliva/ })).toBeVisible();
  await expect(page.getByText('Demostración · datos ficticios locales')).toBeVisible();
  await expect(page.getByText('Nota privada')).toHaveCount(0);
  await expect(page.getByText('Detrás de cada proyecto')).toHaveCount(0);
  const trigger = page.getByRole('button', { name: 'Ver próxima publicación: Así se vive Casa Oliva' });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Así se vive Casa Oliva' })).toBeVisible();
  await expect(dialog.getByText('Abrí el enlace que te enviamos por WhatsApp para responder a este pedido.')).toBeVisible();
  await expect(page.locator('a[href^="/request/"]')).toHaveCount(0);
  for (let step = 0; step < 5; step += 1) {
    await page.keyboard.press('Tab');
    await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.getByRole('button', { name: 'Mes', exact: true }).click();
  await expect(page.locator('.client-month-day')).toHaveCount(42);
  await page.getByRole('button', { name: 'Mes siguiente' }).click();
  await page.getByRole('button', { name: 'Hoy', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mes', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('comentar no aprueba y aprobar conserva la versión mostrada al recargar', async ({ page }) => {
  await page.goto('/request/demo-review');
  await page.getByRole('button', { name: 'Quiero dejar un comentario primero' }).click();
  await page.getByLabel('Tu comentario').fill('¿Podemos usar esta pieza también en historias?');
  await page.getByLabel('Tu nombre').fill('Olivia de prueba');
  await page.getByRole('button', { name: 'Enviar comentario', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('La pieza sigue pendiente de aprobación');
  await expect(page.getByRole('button', { name: 'Aprobar contenido' })).toBeEnabled();
  let state = await storedState(page);
  expect(state.reviews.find(review => review.id === 'review-oliva-1')?.status).toBe('pending');
  await page.getByRole('button', { name: 'Aprobar contenido' }).click();
  await expect(page.getByRole('heading', { name: '¡Listo, contenido aprobado!' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '¡Listo, contenido aprobado!' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aprobar contenido' })).toHaveCount(0);
  state = await storedState(page);
  expect(state.reviews.find(review => review.id === 'review-oliva-1')).toMatchObject({ version: 1, status: 'approved' });
  expect(state.responses.filter(response => response.reviewId === 'review-oliva-1' && response.kind === 'approved')).toHaveLength(1);
  expect(state.responses.filter(response => response.reviewId === 'review-oliva-1' && response.kind === 'comment')).toHaveLength(1);
});

test('pedir cambios requiere una explicación y devuelve la pieza a producción', async ({ page }) => {
  await page.goto('/request/demo-review');
  await page.getByRole('button', { name: 'Pedir cambios', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Enviar cambios' })).toBeDisabled();
  await page.getByLabel('¿Qué te gustaría cambiar?').fill('Cambiemos la foto de portada por la de la mesa grande.');
  await page.getByRole('button', { name: 'Enviar cambios' }).click();
  await expect(page.getByRole('heading', { name: 'Recibimos tus cambios' })).toBeVisible();
  const state = await storedState(page);
  expect(state.pieces.find(piece => piece.id === 'piece-oliva-review')?.status).toBe('production');
  expect(state.reviews.find(review => review.id === 'review-oliva-1')?.status).toBe('changes');
});

test('el material registra únicamente metadatos locales, permite quitar archivos y no se considera completo', async ({ page }) => {
  await page.goto('/request/demo-material');
  await expect(page.getByText(/todavía no hay conexión con Drive/)).toBeVisible();
  await page.locator('input[type=file]').setInputFiles([
    { name: 'toma-vertical.mp4', mimeType: 'video/mp4', buffer: Buffer.from('video ficticio de prueba') },
    { name: 'referencia.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('imagen ficticia de prueba') },
    { name: 'descartar.txt', mimeType: 'text/plain', buffer: Buffer.from('archivo para quitar') },
  ]);
  await page.getByRole('button', { name: 'Quitar descartar.txt' }).click();
  await expect(page.getByText('descartar.txt', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Registrar 2 archivos de prueba' }).click();
  await expect(page.getByRole('status')).toContainText('Los archivos no se subieron a Drive');
  const state = await storedState(page);
  const request = state.materials.find(item => item.id === 'material-oliva-1')!;
  expect(request.status).toBe('received');
  expect(request.assets.map(asset => asset.name)).toEqual(['toma-vertical.mp4', 'referencia.jpg']);
  for (const asset of request.assets) {
    expect(asset.source).toBe('demo');
    expect(asset.driveFileId).toBeUndefined();
    expect(asset.url).toBeUndefined();
  }
  await page.reload();
  await expect(page.getByText('Registrado · pendiente de revisión del equipo')).toBeVisible();
  await expect(page.getByText('toma-vertical.mp4', { exact: true })).toBeVisible();
  await page.goto('/calendar/demo-calendar');
  await expect(page.getByText('Hay una pieza que necesita tu respuesta')).toBeVisible();
  await expect(page.getByText('Esperamos tu material')).toHaveCount(0);
});

test('un enlace revocado muestra recuperación sin ofrecer respuestas', async ({ page }) => {
  await page.goto('/request/demo-review');
  await page.evaluate(key => {
    const state = JSON.parse(localStorage.getItem(key)!);
    state.shares.find((share: { token: string }) => share.token === 'demo-review').revokedAt = new Date().toISOString();
    localStorage.setItem(key, JSON.stringify(state));
  }, storageKey);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Este enlace no está disponible.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aprobar contenido' })).toHaveCount(0);
});

test('una revisión reemplazada no ofrece una aprobación desactualizada', async ({ page }) => {
  await page.goto('/request/demo-review');
  await page.evaluate(key => {
    const state = JSON.parse(localStorage.getItem(key)!);
    state.reviews.find((review: { id: string }) => review.id === 'review-oliva-1').status = 'superseded';
    localStorage.setItem(key, JSON.stringify(state));
  }, storageKey);
  await page.reload();
  await expect(page.getByText('Hay una versión más reciente. Pedile a Aramis el enlace actualizado.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aprobar contenido' })).toHaveCount(0);
});

test('las tres superficies cliente se adaptan a celular sin desplazamiento horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/calendar/demo-calendar', '/request/demo-review', '/request/demo-material']) {
    await page.goto(path);
    await expect(page.getByText('Demostración · datos ficticios locales')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.goto('/calendar/demo-calendar');
  await page.getByRole('button', { name: 'Mes', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
