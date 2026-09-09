# C10 parcial — primer despliegue Pages (2026-09-09)

Base: `54f2477`. Estado: núcleo interno publicado; piloto V1 pendiente.

## Entrega
- Proyecto Pages `gestor-aramis`, URL estable https://gestor-aramis.pages.dev y despliegue https://53d35498.gestor-aramis.pages.dev.
- Autorización Wrangler completada por Miguel. Carga directa, sin push, GitHub automático, dominio propio ni DNS.
- Preparación reproducible en `scripts/prepare-pages.mjs`: configuración validada y permitida explícitamente, TypeScript + Vite de producción sin mapas, Functions como `_worker.js`, rutas API explícitas. `work/pages-deploy` ignorado, separado del `dist` demo.
- Retirado `_redirects` con bucle detectado por Wrangler; se usa SPA predeterminada de Pages.

## Evidencia
- `npm.cmd run pages:prepare`: pasa.
- `npm.cmd run pages:preview` y `npm.cmd run pages:smoke`: pasan en 8788, sin aviso de bucle.
- Wrangler confirma despliegue completo de web/Worker/rutas.
- `npm.cmd run pages:smoke -- https://gestor-aramis.pages.dev`: pasa con Chromium nuevo; root y /text protegidos, API configurada, sin sesión 401/no-store, origen ajeno 403, sin errores JS. El script no usa contraseñas ni modifica datos.
- Núcleo de negocio sin cambios: evidencia previa 269 unitarias, 20 E2E demo, 5 E2E compartidos simulados; no se repitieron esas suites para este empaquetado. Build sí comprueba tipos.
- Miguel ingresó personalmente en el origen publicado. Desde su sesión se leyeron el cliente Prueba de conexión y sus tres piezas. Guion de Posteo 02 guardado con confirmación remota; carga completa de `/text/d4b5c571-4113-46d9-aa40-3f74fb9cf531` conservó sesión y mostró el texto guardado. Texto identificado como prueba de publicación del 9/9/2026; sin contraseñas leídas, sin datos demo importados.

## Próximo paso
Ingreso y guardado online de Miguel verificados. Próximo bloque: habilitar Eliana con su identidad y comprobar dos usuarios. Drive/correo/POV cliente no se amplían en este bloque. Procedimiento de actualizaciones y límites en `docs/PAGES_DEPLOY.md`.
