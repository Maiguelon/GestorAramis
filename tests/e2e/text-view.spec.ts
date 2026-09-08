import {expect,test} from '@playwright/test';
test('guion ampliado lee texto guardado, actualiza en otra pestaña y deja de mostrar una pieza archivada',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Abrir Detrás de cada proyecto'}).click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Guion e instrucciones de producción').fill('ESCENA 1\nApertura del reel.\n\nESCENA 2\nPresentación del equipo.');
 await expect(dialog.getByText('Guardá los cambios para abrir el texto actualizado.')).toBeVisible();await expect(dialog.locator('a').filter({hasText:'Expandir guion y texto'})).not.toHaveAttribute('href',/text/);
 await dialog.getByRole('button',{name:'Guardar cambios'}).click();const popupPromise=page.waitForEvent('popup');await dialog.getByRole('link',{name:'Expandir guion y texto'}).click();const reader=await popupPromise;
 await expect(reader.getByRole('heading',{name:'Detrás de cada proyecto',exact:true})).toBeVisible();await expect(reader.locator('.piece-text-content').first()).toHaveText('ESCENA 1\nApertura del reel.\n\nESCENA 2\nPresentación del equipo.');await expect(reader.getByRole('textbox')).toHaveCount(0);
 await dialog.getByLabel('Guion e instrucciones de producción').fill('Versión actualizada para editar.');await dialog.getByRole('button',{name:'Guardar cambios'}).click();await expect(reader.locator('.piece-text-content').first()).toHaveText('Versión actualizada para editar.');
 await reader.setViewportSize({width:390,height:844});expect(await reader.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 page.once('dialog',d=>d.accept());await dialog.getByRole('button',{name:'Archivar',exact:true}).click();await expect(reader.getByRole('heading',{name:'Esta pieza no está disponible'})).toBeVisible();await expect(reader.getByText('Versión actualizada para editar.')).toHaveCount(0);await reader.close();
});
test('los logos de muestra aparecen en tareas y fichas sin cambiar nombres ni datos',async({page})=>{
 await page.goto('/');const task=page.getByRole('button',{name:'Abrir Detrás de cada proyecto'});const image=task.getByRole('img',{name:'Logo de muestra: Beecomex'});await expect(image).toBeVisible();await expect.poll(()=>image.evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);await expect(task.getByText('Estudio Norte')).toBeVisible();
 await page.getByRole('button',{name:'Clientes',exact:true}).click();await expect(page.getByRole('img',{name:'Logo de muestra: Aura'})).toBeVisible();await expect(page.getByRole('img',{name:'Logo de muestra: Musas'})).toBeVisible();
});
