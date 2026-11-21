import { expect, test, type Page } from '@playwright/test';
import type { WorkspaceState } from '../../contracts/domain';
import type { WorkspaceStatistics } from '../../contracts/statistics';
import { readFile } from 'node:fs/promises';

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

async function signIn(page: Page, canViewStatistics: boolean, value = report) {
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
    return route.fulfill({ json: filters.has('format') ? { ...value, approved: 3, byClient: [] } : value });
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

test('shows versions and deadline coverage, opens frozen monthly data, retries saving and exports the exact cut', async ({ page }) => {
  const enhanced: WorkspaceStatistics = { ...report, definitionVersion:2,
    versions:{count:7,median:2,one:3,two:2,threePlus:2},deadline:{count:4,onTime:3,late:1,unknown:3,percent:75},
    pieces:[{id:'fixture-piece',title:'Una pieza ficticia',format:'reel',clients:['Estudio ficticio'],approvedAt:'2026-10-05T03:00:00Z',
      versions:2,teamChanges:1,clientChanges:0,deadline:'2026-10-06',deadlineResult:'on_time'}],
  };
  const saved={month:'2026-10',capturedAt:'2026-11-01T03:01:00Z',captureType:'automatic',definitionVersion:2,
    report:{...enhanced,approved:4,versions:{count:4,median:1,one:3,two:1,threePlus:0}}};
  const {report: _report, ...summary}=saved;
  let attempts=0;
  await page.route('**/api/statistics/snapshots*',route=>{
    if(route.request().method()==='POST') {
      expect(route.request().postDataJSON()).toEqual({month:'2026-10'});
      return ++attempts===1 ? route.fulfill({status:503,json:{error:'unavailable'}}) : route.fulfill({json:saved});
    }
    return route.fulfill({json:new URL(route.request().url()).searchParams.has('month') ? saved : [summary]});
  });
  await signIn(page,true,enhanced);
  await page.getByRole('button',{name:'Estadísticas',exact:true}).click();
  await expect(page.getByText('75%',{exact:true})).toBeVisible();
  await expect(page.getByText('3 sin fecha verificable, fuera del porcentaje')).toBeVisible();
  await page.getByText('Ver piezas, versiones y fechas (1)',{exact:true}).click();
  await expect(page.getByRole('cell',{name:'A tiempo',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Cortes mensuales',exact:true}).click();
  await expect(page.getByText(/Corte de/)).toContainText('2026-10');
  const versions=page.locator('.statistics-card').filter({has:page.getByRole('heading',{name:'Versiones por pieza aprobada',exact:true})});
  await expect(versions.getByText('Mediana de 4 piezas',{exact:true})).toBeVisible();
  await page.getByText('Guardar un mes cerrado ahora',{exact:true}).click();
  await page.getByLabel('Mes del corte',{exact:true}).fill('2026-10');
  await page.getByRole('button',{name:'Guardar corte mensual',exact:true}).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button',{name:'Guardar corte mensual',exact:true}).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(versions.getByText('Mediana de 4 piezas',{exact:true})).toBeVisible();
  const downloaded=page.waitForEvent('download');
  await page.getByRole('button',{name:'Descargar corte',exact:true}).click();
  const download=await downloaded;
  expect(download.suggestedFilename()).toBe('aramis-statistics-2026-10.json');
  expect(JSON.parse(await readFile((await download.path())!,'utf8'))).toEqual(saved);
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>{const side=document.querySelector('.sidebar');return !side || side.getBoundingClientRect().right<=1;});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'work/statistics-monthly-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Datos actuales',exact:true}).click();
  await expect(page.getByText('Mediana de 7 piezas',{exact:true})).toBeVisible();
});
