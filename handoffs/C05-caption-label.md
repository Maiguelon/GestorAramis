# Caption — 2026-10-13

## Alcance

Por pedido de Miguel, la etiqueta Texto de publicación pasa a Caption en el editor de Detalles, la lectura ampliada y el texto de piezas archivadas. Aplica a Reel, Post y Carrusel. Historias conserva Contenido de la historia. Se ajusta también el mensaje vacío de la lectura ampliada. No se cambian contratos, campos persistidos, guardado, permisos, estados ni versiones. Las superficies demo de cliente conservan su vocabulario hasta revisar esa siguiente fase.

## Evidencia

- `npm.cmd run pages:prepare`: TypeScript, Vite compartido y Worker compilados correctamente.
- `npm.cmd run test:e2e -- tests/e2e/text-view.spec.ts tests/e2e/internal.spec.ts tests/e2e/pending-history.spec.ts --grep "guion ampliado|Historia usa|abrir el texto|Una archivada" --reporter=list`: cuatro recorridos existentes aprobados. Cubren lectura actualizable, borrador sin guardar, editor de Historias y consulta/recuperación de archivados.
- `npm.cmd run test:e2e:shared -- tests/shared-ui/delivery.spec.ts`: un recorrido existente aprobado, con API/Drive simulados. Conserva la entrega versionada, devolución, aprobación y bloqueo del Caption aprobado.
- Publicación directa en Cloudflare Pages: `https://76331a59.gestor-aramis.pages.dev`; alias `https://gestor-aramis.pages.dev/` actualizado.
- `npm.cmd run pages:smoke -- https://gestor-aramis.pages.dev`: aprobado; login, ruta de lectura protegida, API configurada y rechazo anónimo/de otro origen. No equivale a una prueba autenticada contra datos reales.

## Continuidad

Bloque terminado. Recargar el sitio y abrir Detalles de un Reel/Post para ver Caption. Próximo paso sujeto al pedido de Miguel: acordar y conectar las vistas reales de clientes, empezando por calendario de consulta y aprobación de versiones exactas desde WhatsApp. En este bloque sólo se comenta esa propuesta; no se habilitan accesos ni se modifican sus interfaces.
