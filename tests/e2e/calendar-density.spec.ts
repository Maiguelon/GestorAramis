import { expect, test } from '@playwright/test';
import type { WorkspaceState } from '../../contracts/domain';

test('un día cargado mantiene la altura y permite abrir todas las piezas con teclado y en móvil', async ({ page }) => {
  await page.goto('/');
  const { date, count } = await page.evaluate(() => {
    const key = 'aramis.workspace.demo.v1';
    const snapshot = JSON.parse(localStorage.getItem(key)!) as WorkspaceState;
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const pieces = snapshot.pieces.filter(piece => !piece.archived);
    pieces.forEach((piece, index) => {
      piece.plannedDate = date;
      piece.title = `Pieza ${index + 1}: un título largo para probar un día con muchos contenidos`;
    });
    localStorage.setItem(key, JSON.stringify(snapshot));
    return { date, count: pieces.length };
  });
  expect(count).toBeGreaterThan(2);
  await page.reload();
  await page.getByRole('button', { name: 'Calendario', exact: true }).click();
  const day = page.locator(`.internal-day[data-date="${date}"]`);
  await expect(day.locator('.internal-calendar-piece')).toHaveCount(2);
  const more = day.getByRole('button', { name: new RegExp(`Ver los ${count} contenidos`) });
  await expect(more).toHaveText(`+${count - 2} más`);
  const heights = await page.locator('.internal-day').evaluateAll(days => days.map(day => day.getBoundingClientRect().height));
  expect(new Set(heights).size).toBe(1);

  await more.focus();
  await page.keyboard.press('Enter');
  let dialog = page.getByRole('dialog');
  await expect(dialog.locator('.calendar-day-row')).toHaveCount(count);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(more).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const mobileHeights = await page.locator('.internal-day').evaluateAll(days => days.map(day => day.getBoundingClientRect().height));
  expect(new Set(mobileHeights).size).toBe(1);
  await more.click();
  dialog = page.getByRole('dialog');
  await expect(dialog.locator('.calendar-day-row')).toHaveCount(count);
  const hiddenTitle = (await dialog.locator('.calendar-day-content strong').nth(2).textContent())!;
  await dialog.locator('.calendar-day-row').nth(2).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByRole('dialog').getByRole('heading', { name: hiddenTitle, exact: true })).toBeVisible();
});
