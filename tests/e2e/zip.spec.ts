import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { crc32 } from 'node:zlib';

test('descargar todo entrega todas las tomas y no genera un ZIP parcial si falta un archivo', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nuevo contenido' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título del contenido').fill('Reel con dos tomas');
  await dialog.getByRole('button', { name: 'Crear contenido' }).click();
  await dialog.getByRole('tab', { name: 'Material', exact: true }).click();
  const downloadButton = dialog.getByRole('button', { name: 'Descargar todo (ZIP)' });
  await expect(downloadButton).toBeDisabled();
  const payloads = [Buffer.from([0, 255, 1, 2, 3]), Buffer.from('Segunda toma de prueba')];
  await dialog.getByLabel('Agregar material del equipo').setInputFiles(payloads.map(buffer => ({ name: 'toma.mp4', mimeType: 'video/mp4', buffer })));
  await expect(dialog.locator('.team-asset')).toHaveCount(2);
  const downloadEvent = page.waitForEvent('download');
  await downloadButton.click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('Reel con dos tomas.zip');
  const archive = await readFile((await download.path())!);
  let offset = 0;
  const names: string[] = [];
  for (const payload of payloads) {
    expect(archive.readUInt32LE(offset)).toBe(0x04034b50);
    expect(archive.readUInt16LE(offset + 8)).toBe(0);
    const size = archive.readUInt32LE(offset + 18);
    const nameLength = archive.readUInt16LE(offset + 26);
    names.push(archive.subarray(offset + 30, offset + 30 + nameLength).toString());
    const data = archive.subarray(offset + 30 + nameLength, offset + 30 + nameLength + size);
    expect(data).toEqual(payload);
    expect(archive.readUInt32LE(offset + 14)).toBe(crc32(data));
    offset += 30 + nameLength + size;
  }
  expect(names).toEqual(['toma.mp4', 'toma (2).mp4']);
  expect(archive.readUInt32LE(offset)).toBe(0x02014b50);
  expect(archive.readUInt16LE(archive.length - 12)).toBe(2);

  await page.evaluate(async () => {
    const snapshot = JSON.parse(localStorage.getItem('aramis.workspace.demo.v1')!);
    const id = snapshot.pieces.find((piece: { title: string }) => piece.title === 'Reel con dos tomas').teamAssets[1].id;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('aramis-team-materials', 1);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('files', 'readwrite');
        transaction.objectStore('files').delete(id);
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => { db.close(); reject(transaction.error); };
      };
      request.onerror = () => reject(request.error);
    });
  });
  const unexpected: string[] = [];
  page.on('download', item => unexpected.push(item.suggestedFilename()));
  await downloadButton.click();
  await expect(dialog.getByRole('alert')).toContainText('no está en este navegador');
  await expect(dialog.getByRole('alert')).toContainText('No se descargó un ZIP parcial');
  await expect(downloadButton).toBeEnabled();
  expect(unexpected).toEqual([]);
});
