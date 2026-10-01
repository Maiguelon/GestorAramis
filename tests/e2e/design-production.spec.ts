import { expect, test } from '@playwright/test';
import { createSeed } from '../../src/domain/seed';
import { addDays } from '../../src/domain/selectors';
import { aramisDate } from '../../src/domain/work-lists';

test('Diseño recuerda la entrada, separa esperas y permite trabajar sin pasar por gestión', async ({ page, context }) => {
  const today = aramisDate();
  const state = createSeed(today);
  const base = state.pieces.find(piece => piece.id === 'piece-norte-production')!;
  state.pieces.push(
    { ...base, id: 'overdue-design', title: 'Diseño vencido', plannedDate: addDays(today, -2) },
    { ...base, id: 'future-design', title: 'Diseño del mes próximo', plannedDate: addDays(today, 45) },
    { ...base, id: 'undated-design', title: 'Diseño sin fecha', plannedDate: null, productionStage: 'editing' },
    { ...base, id: 'archived-design', title: 'Diseño archivado', archived: true },
    { ...base, id: 'blocked-design', title: 'Diseño con material pendiente' },
    { ...base, id: 'review-future', title: 'Entrega del mes próximo', status: 'review', plannedDate: addDays(today, 45) },
    { ...base, id: 'approved-today', title: 'Aprobada de hoy', status: 'approved', plannedDate: today },
    { ...base, id: 'approved-undated', title: 'Aprobada sin fecha', status: 'approved', plannedDate: null },
    { ...base, id: 'approved-past', title: 'Aprobada anterior', status: 'approved', plannedDate: addDays(today, -1) },
    { ...base, id: 'scheduled-future', title: 'Programada antigua', status: 'scheduled', plannedDate: addDays(today, 30) },
  );
  state.materials.push({ id: 'blocked-request', pieceId: 'blocked-design', instructions: 'Esperar confirmación', dueDate: today, status: 'received', assets: [], createdAt: base.createdAt, sentAt: null });
  await page.addInitScript(state => { if (!localStorage.getItem('aramis.workspace.demo.v1')) localStorage.setItem('aramis.workspace.demo.v1', JSON.stringify(state)); }, state);
  await page.goto('/');
  await page.getByLabel('Vista de trabajo', { exact: true }).selectOption('design');
  await expect(page.getByRole('heading', { name: 'Producción', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nuevo contenido' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Clientes', exact: true })).toBeHidden();
  await expect(page.locator('.design-task')).toHaveCount(4);
  await expect(page.locator('.design-task h2')).toHaveText(['Diseño vencido', 'Detrás de cada proyecto', 'Diseño del mes próximo', 'Diseño sin fecha']);
  await expect(page.getByRole('article', { name: 'Diseño vencido', exact: true })).toContainText('Fecha vencida');
  await expect(page.getByRole('article', { name: 'Diseño sin fecha', exact: true })).toContainText('Sin fecha asignada');
  await expect(page.getByRole('button', { name: 'Calendario', exact: true })).toBeVisible();
  await expect(page.locator('.management-nav')).toHaveCount(0);
  await page.getByLabel('Ver en Diseño').selectOption('waiting');
  await expect(page.locator('.design-task-list')).toContainText('Esperando grabación');
  await expect(page.locator('.design-task-list')).toContainText('Material pendiente de verificar');
  await expect(page.getByRole('article', { name: 'Diseño vencido', exact: true })).toHaveCount(0);
  await page.getByLabel('Ver en Diseño').selectOption('review');
  await expect(page.getByRole('article', { name: 'Entrega del mes próximo', exact: true })).toBeVisible();
  await page.getByRole('article', { name: 'Entrega del mes próximo', exact: true }).getByRole('button', { name: 'Ver entrega', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Revisión', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByLabel('Ver en Diseño').selectOption('approved');
  await expect(page.locator('.design-task h2')).toHaveText(['Aprobada de hoy', 'Ideas para compartir', 'Programada antigua', 'Aprobada sin fecha']);
  await expect(page.getByRole('article', { name: 'Aprobada anterior', exact: true })).toHaveCount(0);
  await expect(page.getByRole('article', { name: 'Aprobada de hoy', exact: true })).not.toContainText('Fecha vencida');
  await page.getByLabel('Ver en Diseño').selectOption('production');

  const task = page.getByRole('article', { name: 'Detrás de cada proyecto', exact: true });
  const popupPromise = context.waitForEvent('page');
  await task.getByRole('link', { name: 'Guion y texto' }).click();
  const popup = await popupPromise;
  await expect(popup.getByRole('heading', { name: 'Detrás de cada proyecto', exact: true })).toBeVisible();
  await expect(popup.getByText(base.script!, { exact: true })).toBeVisible();
  await popup.close();
  await task.getByRole('button', { name: 'Material', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Material', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Por empezar' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'En curso' })).toHaveCount(0);
  await expect(task).toContainText('Para producción');
  await expect(page.getByRole('article', { name: 'Diseño sin fecha', exact: true })).toContainText('Para producción');
  await expect(task.getByRole('button', { name: 'Empezar a producir' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Producción', exact: true })).toBeVisible();
  await expect(task).toContainText('Para producción');
  await page.screenshot({ path: 'work/design-desktop.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(task.getByRole('button', { name: 'Material', exact: true })).toBeVisible();
  await expect.poll(() => page.locator('.sidebar').evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'work/design-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page.getByLabel('Vista de trabajo', { exact: true }).selectOption('management');
  await expect(page.getByRole('heading', { name: 'Pendientes', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Pendientes', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page.getByLabel('Vista de trabajo', { exact: true }).selectOption('design');
  await expect(page.getByLabel('Ver en Diseño')).toHaveValue('production');
});

test('los filtros de Diseño distinguen vacío real y permiten volver a la gestión', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Vista de trabajo', { exact: true }).selectOption('design');
  await page.getByLabel('Filtrar por cliente').selectOption('client-bruma');
  await expect(page.getByRole('heading', { name: 'No hay pendientes con estos filtros.' })).toBeVisible();
  await page.getByRole('button', { name: 'Quitar filtros', exact: true }).click();
  await expect(page.locator('.design-task')).toHaveCount(1);
  await page.getByLabel('Ver en Diseño').selectOption('approved');
  await page.getByLabel('Filtrar por cliente').selectOption('client-oliva');
  await expect(page.locator('.design-task')).toHaveCount(1);
  await expect(page.getByLabel('Ver en Diseño').locator('option:checked')).toHaveText('Aprobados (1)');
  await page.getByLabel('Vista de trabajo', { exact: true }).selectOption('management');
  await page.getByRole('button', { name: 'Clientes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
  await page.getByLabel('Vista de trabajo', { exact: true }).selectOption('design');
  await expect(page.getByLabel('Ver en Diseño')).toHaveValue('production');
  await expect(page.locator('.design-task')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Clientes', exact: true })).toBeHidden();
});
