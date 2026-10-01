import { expect, test, type Page } from '@playwright/test';
import type { Piece, WorkspaceState } from '../../contracts/domain';
import { createSeed } from '../../src/domain/seed';
import { aramisDate } from '../../src/domain/work-lists';

const storageKey = 'aramis.workspace.demo.v1';
const fixedTime = new Date('2026-09-30T15:00:00.000Z');
const today = aramisDate(fixedTime);

function fixture(): WorkspaceState {
  const state = createSeed(today);
  const patch = (id: string, change: Partial<Piece>) => Object.assign(state.pieces.find(piece => piece.id === id)!, change);
  patch('piece-norte-overdue', { title: 'Vencida para revisión', plannedDate: '2026-09-28', workArea: 'marketing', planMonth: '2026-09' });
  patch('piece-oliva-review', { title: 'Revisión de esta semana', plannedDate: '2026-10-01', workArea: 'marketing', planMonth: '2026-10' });
  patch('piece-oliva-material', { title: 'Producción de esta semana', plannedDate: '2026-10-02', workArea: 'marketing', planMonth: '2026-10' });
  patch('piece-norte-production', { title: 'Producción futura', plannedDate: '2026-11-15', workArea: 'design', planMonth: '2026-11' });
  patch('piece-bruma-idea', { title: 'Sin fecha de otro mes', plannedDate: null, workArea: 'marketing', planMonth: '2027-01' });
  patch('piece-oliva-approved', { title: 'Aprobada hoy', plannedDate: today, workArea: 'marketing', planMonth: '2026-09' });
  patch('piece-bruma-published', { title: 'Publicada anterior', plannedDate: '2026-09-20', workArea: 'marketing', planMonth: '2026-09' });
  const approved = state.pieces.find(piece => piece.id === 'piece-oliva-approved')!;
  state.pieces.push({ ...structuredClone(approved), id: 'piece-approved-yesterday', title: 'Aprobada ayer', plannedDate: '2026-09-29' });
  const previousReview = state.reviews.find(review => review.id === 'review-oliva-approved')!;
  state.reviews.push({ ...structuredClone(previousReview), id: 'review-approved-yesterday', pieceId: 'piece-approved-yesterday' });
  state.pieces.push({
    ...structuredClone(approved), id: 'piece-archived', title: 'Pieza archivada', archived: true,
    script: 'Indicaciones archivadas para recuperar.', caption: 'Texto archivado para recuperar.',
    internalNote: 'Nota privada que sigue conservada.', visibleToClient: false,
    teamAssets: [{ id: 'archived-asset', name: 'Referencia archivada.svg', mimeType: 'image/svg+xml', size: 2048, source: 'demo', url: '/demo/cover-oliva.svg' }],
  });
  state.reviews.push({ ...structuredClone(previousReview), id: 'review-archived', pieceId: 'piece-archived', caption: 'Texto exacto de la revisión anterior.', status: 'superseded' });
  state.shares.push({ id: 'share-archived', token: 'demo-archived-review', scope: 'review', targetId: 'review-archived', clientId: approved.clientId, createdAt: '2026-09-25T12:00:00.000Z', revokedAt: '2026-09-29T12:00:00.000Z' });
  state.activities.push({ id: 'activity-archived', pieceId: 'piece-archived', text: 'Contenido archivado.', actor: 'member-lucia', createdAt: '2026-09-29T12:00:00.000Z', visibility: 'internal' });
  return state;
}

async function prepare(page: Page, seed = fixture()) {
  await page.clock.setFixedTime(fixedTime);
  await page.addInitScript(({ key, seed }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(seed));
  }, { key: storageKey, seed });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Pendientes', exact: true })).toBeVisible();
}

async function snapshot(page: Page): Promise<WorkspaceState> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), storageKey);
}

async function categoryCount(page: Page, label: string, count: number) {
  await expect(page.locator('.stat-card').filter({ has: page.locator('span').filter({ hasText: new RegExp(`^${label}$`) }) }).locator('strong')).toHaveText(String(count));
}

test('Gestión abre todo el pendiente por fecha y deja aprobados al fondo; categorías respetan los filtros', async ({ page }) => {
  await prepare(page);
  await expect(page.getByLabel('Alcance de pendientes')).toHaveValue('all');
  await expect(page.getByRole('navigation', { name: 'Principal' }).getByRole('button', { name: 'Producción', exact: true })).toHaveCount(0);
  await expect(page.locator('.work-row .piece-cell strong')).toHaveText([
    'Vencida para revisión', 'Revisión de esta semana', 'Producción de esta semana',
    'Producción futura', 'Sin fecha de otro mes', 'Aprobada hoy',
  ]);
  await expect(page.locator('.approved-divider')).toContainText('Aprobados');
  await expect(page.getByRole('button', { name: 'Abrir Aprobada ayer', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Abrir Pieza archivada', exact: true })).toHaveCount(0);
  await expect(page.locator('.process-categories .attention-card')).toHaveCount(0);
  await expect(page.locator('.pending-categories > .attention-card')).toBeVisible();
  await categoryCount(page, 'Atención', 2);
  await categoryCount(page, 'Planificación', 1);
  await categoryCount(page, 'Para producción', 2);
  await categoryCount(page, 'Revisión', 2);
  await categoryCount(page, 'Aprobados', 1);
  await page.locator('.attention-card').click();
  await expect(page.locator('.work-row .piece-cell strong')).toHaveText(['Vencida para revisión', 'Producción de esta semana']);
  await page.getByRole('button', { name: 'Quitar filtro' }).click();
  for (const [label, titles] of [
    ['Planificación', ['Sin fecha de otro mes']],
    ['Para producción', ['Producción de esta semana', 'Producción futura']],
    ['Revisión', ['Vencida para revisión', 'Revisión de esta semana']],
    ['Aprobados', ['Aprobada hoy']],
  ] as const) {
    await page.locator('.process-categories .stat-card').filter({ has: page.locator('span').filter({ hasText: new RegExp(`^${label}$`) }) }).click();
    await expect(page.locator('.work-row .piece-cell strong')).toHaveText([...titles]);
    await page.getByRole('button', { name: 'Quitar filtro' }).click();
  }
  await page.getByLabel('Filtrar por cliente').selectOption('client-norte');
  await categoryCount(page, 'Atención', 1);
  await categoryCount(page, 'Para producción', 1);
  await categoryCount(page, 'Revisión', 1);
  await categoryCount(page, 'Aprobados', 0);
  await page.getByLabel('Filtrar por área').selectOption('design');
  await categoryCount(page, 'Atención', 0);
  await expect(page.locator('.work-row .piece-cell strong')).toHaveText(['Producción futura']);
  await page.getByLabel('Buscar contenido').fill('inexistente');
  await categoryCount(page, 'Para producción', 0);
  await expect(page.locator('.work-row')).toHaveCount(0);
  await page.getByLabel('Buscar contenido').fill('futura');
  await categoryCount(page, 'Para producción', 1);
  await expect(page.locator('.work-row .piece-cell strong')).toHaveText(['Producción futura']);
  expect(await snapshot(page)).toEqual(fixture());
});

test('Esta semana conserva vencidos y sin fecha y permite volver al trabajo futuro', async ({ page }) => {
  await prepare(page);
  await page.getByLabel('Alcance de pendientes').selectOption('week');
  await expect(page.getByRole('button', { name: 'Abrir Producción futura', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Abrir Vencida para revisión', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir Sin fecha de otro mes', exact: true })).toBeVisible();
  await expect(page.locator('.page-heading')).toContainText('28 sept');
  await expect(page.locator('.page-heading')).toContainText('4 oct');
  await categoryCount(page, 'Para producción', 1);
  await page.getByLabel('Alcance de pendientes').selectOption('all');
  await expect(page.getByRole('button', { name: 'Abrir Producción futura', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('Alcance de pendientes')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('Aprobados pasados están en Historial, Calendario y el mes del cliente', async ({ page }) => {
  await prepare(page);
  await page.getByRole('button', { name: 'Historial', exact: true }).click();
  await expect(page.locator('.history-row .history-piece strong')).toHaveText(['Aprobada ayer', 'Publicada anterior']);
  await page.getByLabel('Cliente del historial').selectOption('client-oliva');
  await page.getByLabel('Mes del plan').fill('2026-09');
  await page.getByLabel('Buscar en historial').fill('ayer');
  await expect(page.getByRole('button', { name: 'Abrir Aprobada ayer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir Aprobada ayer', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Aprobada ayer', exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByRole('button', { name: 'Calendario', exact: true }).click();
  await expect(page.locator('[data-date="2026-09-29"]').getByRole('button', { name: 'Abrir Aprobada ayer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clientes', exact: true }).click();
  await page.locator('.brand-card').filter({ has: page.getByRole('heading', { name: 'Casa Oliva', exact: true }) }).getByRole('button', { name: 'Trabajar mes' }).click();
  await page.getByLabel('Mes de trabajo').fill('2026-09');
  await expect(page.getByRole('form', { name: 'Editar Aprobada ayer', exact: true })).toBeVisible();
  await expect(page.getByRole('form', { name: 'Editar Pieza archivada', exact: true })).toHaveCount(0);
});

test('Una archivada se consulta sin editar ni subir y se recupera a Planificación conservando datos y enlaces revocados', async ({ page }) => {
  await prepare(page);
  const before = await snapshot(page);
  await page.getByRole('button', { name: 'Historial', exact: true }).click();
  await page.getByRole('button', { name: 'Archivados', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir Pieza archivada', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Archivado · Sólo consulta')).toBeVisible();
  await expect(dialog.getByText('Indicaciones archivadas para recuperar.', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Texto archivado para recuperar.', { exact: true })).toBeVisible();
  await expect(dialog.locator('input, textarea, select')).toHaveCount(0);
  await dialog.getByRole('tab', { name: 'Entrega', exact: true }).click();
  await expect(dialog.getByText('Texto exacto de la revisión anterior.', { exact: true })).toBeVisible();
  await expect(dialog.locator('input[type="file"]')).toHaveCount(0);
  await dialog.getByRole('tab', { name: 'Material', exact: true }).click();
  await expect(dialog.getByText('Referencia archivada.svg', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Descargar', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Descargar todo (ZIP)', exact: true })).toBeVisible();
  await expect(dialog.locator('input[type="file"]')).toHaveCount(0);
  await dialog.getByRole('tab', { name: 'Historial', exact: true }).click();
  await expect(dialog.getByText('Contenido archivado.', { exact: true })).toBeVisible();
  expect(await snapshot(page)).toEqual(before);
  page.once('dialog', confirmation => confirmation.dismiss());
  await dialog.getByRole('button', { name: 'Recuperar a planificación', exact: true }).click();
  await expect(dialog).toBeVisible();
  expect(await snapshot(page)).toEqual(before);
  page.once('dialog', async confirmation => {
    expect(confirmation.message()).toContain('Las aprobaciones anteriores y los enlaces revocados no vuelven a activarse');
    await confirmation.accept();
  });
  await dialog.getByRole('button', { name: 'Recuperar a planificación', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Abrir Pieza archivada', exact: true })).toHaveCount(0);
  const after = await snapshot(page);
  const restored = after.pieces.find(piece => piece.id === 'piece-archived')!;
  const original = before.pieces.find(piece => piece.id === restored.id)!;
  expect(restored).toMatchObject({ archived: false, status: 'planned', workArea: 'marketing', productionStage: 'ready', visibleToClient: false, revision: original.revision + 1 });
  expect([restored.title, restored.script, restored.caption, restored.internalNote, restored.plannedDate, restored.teamAssets]).toEqual([
    original.title, original.script, original.caption, original.internalNote, original.plannedDate, original.teamAssets,
  ]);
  expect(after.shares.find(share => share.id === 'share-archived')?.revokedAt).toBe(before.shares.find(share => share.id === 'share-archived')?.revokedAt);
  expect(after.reviews.find(review => review.id === 'review-archived')?.status).toBe('superseded');
  expect(after.activities.filter(activity => activity.pieceId === restored.id && activity.text === 'Contenido recuperado a planificación.')).toHaveLength(1);
  await page.getByRole('button', { name: 'Pendientes', exact: false }).first().click();
  await expect(page.getByRole('button', { name: 'Abrir Pieza archivada', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Abrir Pieza archivada', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir Pieza archivada', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Guion e instrucciones de producción')).toHaveValue(original.script!);
  await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Texto de publicación', exact: true })).toHaveValue(original.caption);
  await page.goto('/request/demo-archived-review');
  await expect(page.getByRole('heading', { name: 'Este enlace no está disponible.', exact: true })).toBeVisible();
});

test('Una pestaña abierta pasa aprobados al Historial al cruzar medianoche Argentina', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-01T02:59:50.000Z') });
  await page.clock.pauseAt(new Date('2026-10-01T02:59:50.000Z'));
  await page.addInitScript(({ key, seed }) => localStorage.setItem(key, JSON.stringify(seed)), { key: storageKey, seed: fixture() });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Abrir Aprobada hoy', exact: true })).toBeVisible();
  await page.clock.runFor(10_100);
  await expect(page.getByRole('button', { name: 'Abrir Aprobada hoy', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Abrir Vencida para revisión', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Historial', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Abrir Aprobada hoy', exact: true })).toBeVisible();
  expect((await snapshot(page)).pieces.find(piece => piece.id === 'piece-oliva-approved')?.status).toBe('approved');
});
