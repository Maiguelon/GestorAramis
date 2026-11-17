import { expect, test, type Page } from '@playwright/test';
import type { WorkspaceState } from '../../contracts/domain';
import type { WorkspaceStatistics } from '../../contracts/statistics';

const userId = '10000000-0000-4000-8000-000000000001';
const clientId = '20000000-0000-4000-8000-000000000001';
const memberId = '30000000-0000-4000-8000-000000000001';
const state: WorkspaceState = {
  schemaVersion: 1, clients: [],
  members: [{ id: memberId, name: 'Cuenta de prueba', initials: 'CP' }],
  pieces: [], materials: [], reviews: [], shares: [], responses: [], activities: [],
};
const report: WorkspaceStatistics = {
  approved: 7, clientsServed: 1,
  firstDelivery: { count: 4, medianHours: 36 },
  internalReview: { count: 0, medianHours: null },
  clients: [{ id: clientId, name: 'Estudio ficticio' }],
  byClient: [{ id: clientId, name: 'Estudio ficticio', approved: 7, reworked: 2, sharedApproved: 1, assigned: 8, planApproved: 6 }],
};

async function signIn(page: Page, canViewStatistics: boolean) {
  const payload = { sub: userId, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 };
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.FAKE_SIGNATURE`;
  const user = { id: userId, email: 'staff@example.test', role: 'authenticated', aud: 'authenticated', app_metadata: {}, user_metadata: {} };
  const queries: URLSearchParams[] = [];
  await page.route('https://shared-ui-test.supabase.co/auth/v1/**', route => route.fulfill({
    json: route.request().url().includes('/token')
      ? { access_token: token, refresh_token: 'FAKE', token_type: 'bearer', expires_in: 3600, user } : user,
  }));
  await page.route('**/api/workspace', route => route.fulfill({
    json: { state, memberId, workspaceId: 'fixture', workspaceName: 'Aramis pruebas', canViewStatistics },
  }));
  await page.route('**/api/statistics?*', route => {
    const filters = new URL(route.request().url()).searchParams;
    queries.push(filters);
    return route.fulfill({ json: filters.has('format') ? { ...report, approved: 3, byClient: [] } : report });
  });
  await page.goto('/');
  await page.getByLabel('Correo', { exact: true }).fill(user.email);
  await page.getByLabel('Contraseña', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pendientes', exact: true })).toBeVisible();
  return queries;
}

test('the private page loads on demand, filters results, and stays usable at mobile width', async ({ page }) => {
  const queries = await signIn(page, true);
  expect(queries).toHaveLength(0);
  await page.getByRole('button', { name: 'Estadísticas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Estadísticas', exact: true })).toBeVisible();
  await expect(page.getByText('1,5 d', { exact: true })).toBeVisible();
  await expect(page.getByText('Sin casos con fechas completas')).toBeVisible();
  await expect(page.getByRole('cell', { name: '6 / 8' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('Formato', { exact: true }).selectOption('reel');
  await page.getByLabel('Cliente', { exact: true }).selectOption(clientId);
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  await expect(page.getByText('No hay piezas aprobadas ni asignadas al plan para estos filtros.')).toBeVisible();
  expect(queries.at(-1)?.get('format')).toBe('reel');
  expect(queries.at(-1)?.get('clientId')).toBe(clientId);
});

test('a regular staff account never sees the statistics entry or fetches the data', async ({ page }) => {
  const queries = await signIn(page, false);
  await expect(page.getByRole('button', { name: 'Estadísticas', exact: true })).toHaveCount(0);
  expect(queries).toHaveLength(0);
});
