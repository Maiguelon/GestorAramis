# Estado del proyecto

Fecha: 2026-09-07. Desarrollo retomado por el usuario; seguir sin crear cuentas por ahora.

## Punto de partida
- Repositorio correcto: C:/Users/Usuario/Desktop/Aramis/GestorAramis, rama main, commit inicial 59d2e7b. Solo README, sin cambios del usuario.
- Marca leída desde Aramis-Web/public/brandbook.txt.
- Drive inspeccionado solo metadatos: carpeta raíz con clientes, temporadas y archivo. Una muestra de cliente organiza por meses y Archivo; no hay Shared Drive confirmado. No se descargaron ni modificaron videos.
- El usuario confirmó que no tiene cuentas/proyectos configurados y pidió continuar con desarrollo y pruebas locales. No volver a preguntar por ellas durante este bloque.

## Punto guardado
- Último commit del usuario: `ceb66e2` — demo integrada; anterior `f70d543` — base técnica. No reiniciar el proyecto.
- Panel, detalle, calendario y solicitudes funcionan sobre datos ficticios en localStorage. Enlaces demo sólo en este navegador; sin servicio multiusuario.
- `npm run typecheck` y `npm run build` pasaron en esta reanudación. Los resultados de pruebas por módulo están en handoffs/; falta cierre global del coordinador.
- Dominio/API: aprobación por versión, permisos, almacenamiento robusto, publicado protegido. Calendario secreto ya no entrega enlaces de escritura.
- SQL/RLS y primitivas OAuth/Drive implementadas; Worker de negocio cerrado con 503/501. Tener claves no basta para habilitarlo: faltan handlers y transacciones.

## Trabajo en curso en esta reanudación
- Coordinador: pruebas E2E internas, correcciones UX/estado, revisión de integración, README, actualización roadmap y checkpoint.
- Agente domain: separar borrador de copy en SQL para evitar exposición a cliente, limitar revisión histórica pública y regresiones PGlite. Archivos supabase/** + tests/server.test.ts.
- Agente client_ui: E2E cliente y revisión visual; actualizar evidencia en handoff. Archivos src/client/** + tests/e2e/client.spec.ts.
- Agente infrastructure: completar/verificar transporte reanudable local y streaming privado. Archivos src/lib/resumable-upload.ts, server/drive.ts, tests/upload.test.ts y tests/drive-edge.test.ts.

## Próximo paso
Integrar estas entregas, ejecutar typecheck/build/tests/E2E/worker dry run. Registrar evidencia y limitaciones antes del commit. No dar por implementada la V1 real por completar la demostración. No publicar, conectar cuentas ni contactar clientes.
