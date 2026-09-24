import {expect,test} from '@playwright/test';
test('guion ampliado lee texto guardado, actualiza en otra pestaña y deja de mostrar una pieza archivada',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Abrir Detrás de cada proyecto'}).click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Guion e instrucciones de producción').fill('ESCENA 1\nApertura del reel.\n\nESCENA 2\nPresentación del equipo.');
 await expect(dialog.getByText('Guardá los cambios para abrir la versión actualizada.')).toBeVisible();await expect(dialog.locator('a').filter({hasText:'Abrir texto completo'})).not.toHaveAttribute('href',/text/);
 await dialog.getByRole('button',{name:'Guardar cambios'}).click();const popupPromise=page.waitForEvent('popup');await dialog.getByRole('link',{name:'Abrir texto completo'}).click();const reader=await popupPromise;
 await expect(reader.getByRole('heading',{name:'Detrás de cada proyecto',exact:true})).toBeVisible();await expect(reader.locator('.piece-text-content').first()).toHaveText('ESCENA 1\nApertura del reel.\n\nESCENA 2\nPresentación del equipo.');await expect(reader.getByRole('textbox')).toHaveCount(0);
 await dialog.getByLabel('Guion e instrucciones de producción').fill('Versión actualizada para editar.');await dialog.getByRole('button',{name:'Guardar cambios'}).click();await expect(reader.locator('.piece-text-content').first()).toHaveText('Versión actualizada para editar.');
 await reader.setViewportSize({width:390,height:844});expect(await reader.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 page.once('dialog',d=>d.accept());await dialog.getByRole('button',{name:'Archivar',exact:true}).click();await expect(reader.getByRole('heading',{name:'Esta pieza no está disponible'})).toBeVisible();await expect(reader.getByText('Versión actualizada para editar.')).toHaveCount(0);await reader.close();
});
test('los logos de muestra aparecen en tareas y fichas sin cambiar nombres ni datos',async({page})=>{
 await page.goto('/');const task=page.getByRole('button',{name:'Abrir Detrás de cada proyecto'});const image=task.getByRole('img',{name:'Logo de muestra: Beecomex'});await expect(image).toBeVisible();await expect.poll(()=>image.evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);await expect(task.getByText('Estudio Norte')).toBeVisible();
 await page.getByRole('button',{name:'Clientes',exact:true}).click();await expect(page.getByRole('img',{name:'Logo de muestra: Aura'})).toBeVisible();await expect(page.getByRole('img',{name:'Logo de muestra: Musas'})).toBeVisible();
});

test('Historia usa un solo contenido y conserva indicaciones anteriores privadas',async({page})=>{
 await page.goto('/');
 await page.evaluate(()=>{const key='aramis.workspace.demo.v1';const state=JSON.parse(localStorage.getItem(key)!);const story=state.pieces.find((piece:{id:string})=>piece.id==='piece-bruma-idea');story.script='Indicación privada anterior para el equipo.';localStorage.setItem(key,JSON.stringify(state));});
 await page.reload();
 await page.getByRole('button',{name:'Clientes',exact:true}).click();
 await page.locator('.brand-card').filter({has:page.getByRole('heading',{name:'Bruma Café',exact:true})}).getByRole('button',{name:'Trabajar mes'}).click();
 await page.getByRole('form',{name:'Editar Conocé a quienes preparan tu café'}).getByRole('button',{name:'Abrir',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByLabel('Contenido de la historia')).toHaveValue('Idea privada en preparación.');
 await expect(dialog.getByLabel('Guion e instrucciones de producción')).toHaveCount(0);
 await expect(dialog.getByLabel('Texto de publicación')).toHaveCount(0);
 await expect(dialog.locator('.story-legacy-notes')).toContainText('Indicación privada anterior para el equipo.');
 await expect(dialog.getByRole('link',{name:'Abrir texto completo'})).toBeVisible();
 await dialog.getByLabel('Contenido de la historia').fill('Slide 1: Presentación\nSlide 2: El equipo');
 await expect(dialog.locator('a').filter({hasText:'Abrir texto completo'})).not.toHaveAttribute('href',/text/);
 await dialog.getByRole('button',{name:'Guardar cambios'}).click();
 const popupPromise=page.waitForEvent('popup');await dialog.getByRole('link',{name:'Abrir texto completo'}).click();const reader=await popupPromise;
 await expect(reader.getByRole('heading',{name:'Contenido de la historia'})).toBeVisible();
 await expect(reader.locator('.piece-text-content').first()).toHaveText('Slide 1: Presentación\nSlide 2: El equipo');
 await expect(reader.getByRole('heading',{name:'Indicaciones anteriores · sólo equipo'})).toBeVisible();
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('aramis.workspace.demo.v1')!));
 const saved=stored.pieces.find((piece:{id:string})=>piece.id==='piece-bruma-idea');
 expect(saved.caption).toBe('Slide 1: Presentación\nSlide 2: El equipo');
 expect(saved.script).toBe('Indicación privada anterior para el equipo.');
 await reader.close();
});
