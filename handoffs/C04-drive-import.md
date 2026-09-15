# C04 — Incorporación de material subido desde Drive

Fecha: 2026-09-14. Autorizado: sincronización desde Drive, carpeta anticipada por pieza y nombre Planificación.

## Implementación
- OAuth solicita drive.file + drive.readonly. Conserva scopes concedidos dentro del sobre cifrado; conexiones antiguas continúan sirviendo cargas y medios, pero no ejecutan importación hasta renovar el consentimiento. UI informa el alcance real (lectura de todo el Drive accesible por la cuenta), frente al límite de aplicación (sólo carpetas persistidas para piezas).
- POST /api/drive/pieces/:id/sync autoriza al integrante y carga la pieza desde su workspace; no acepta IDs de carpetas/archivos del navegador. Lee todas las páginas antes de reconciliar. Hasta 10.000 entradas, multimedia/PDF completos de hasta 2 GiB. Omite carpetas, shortcuts y archivos sin checksum/tamaño completo; muestra aviso.
- Nueva RPC privada al servidor aramis_drive_import: revalida integrante/pieza/carpeta/generación, serializa con comandos, deduplica por ID de Drive, actualiza nombre/tamaño/checksum y oculta importados retirados. Una lectura vieja no pisa una más reciente. No modifica Drive, estados de producción ni visibilidad cliente. Una sincronización con cambios suma revisión/historial interno una vez.
- Medios externos se sirven sólo si el archivo sigue en su carpeta persistida y coinciden tamaño/MIME/checksum. La autorización de archivos creados por la app sigue exigiendo sus etiquetas. El transporte sigue siendo para trabajo interno, no revisiones exactas de clientes.
- Material sincroniza al abrir, volver al foco y cada 30 segundos visible; botón Actualizar material, hora de revisión y aviso ante fallos. No hay cron con app cerrada. Videos usan preload=none para no iniciar 122 lecturas de metadatos simultáneas.
- Tras create-piece/generate-month, Pages/Worker inicia creación de carpetas con waitUntil. Es best effort, limitada a 25 segundos: una falla de Drive no invalida el guardado y abrir Material reintenta. Nuevas piezas usan Cliente/Mes/Pieza sin Material; mappings antiguos conservan Material. Sin mover carpetas existentes.
- En preparación pasa a Planificación.

## Evidencia
- Suite completa previa al último añadido de pruebas: 425 tests pasan. Los dos tests adicionales de carpetas pasan junto con los otros 24 de drive-service.
- 14 recorridos de navegador compartido pasan: cargas/reintentos/ZIP, fallback MOV/M4V e importación/remoción/fallo de sincronización. Son servicios simulados; no evidencia de un iPhone real.
- SQL nuevo probado en PGlite: deduplicación, permisos, rollback, renombre/cambio, retiro/restauración, lectura vieja. Provider test de 122 clips en varias páginas, sin carga real de esos 122.
- Compilación TypeScript, Vite y Pages pasan. Migración 202609140001_drive_import.sql aplicada UNA VEZ en Supabase mediante SQL Editor, con resultado Success. No rows returned.
- Publicado https://5c198b22.gestor-aramis.pages.dev, alias https://gestor-aramis.pages.dev. Smoke público pasa (rutas, API configurada y rechazo anónimo/cross-origin).
- Sesión real de Miguel abre app; Configuración confirma conexión antigua y pide renovación. Declarados scopes en Google Cloud. Consentimiento ampliado preparado; todavía PENDIENTE confirmación del usuario al momento de este registro.

## Pendientes / límites
- Confirmar nuevo consentimiento y verificar lectura/importación/reproducción real de prueba_drive.mp4, Hugo Peñaloza / Reel 02. No declarar integración validada hasta entonces.
- Google continúa Testing: expiración OAuth de 7 días sigue pendiente de resolver; no cambiada audiencia/publicación.
- Retiro automático afecta archivos incorporados desde Drive; archivos originalmente subidos por el gestor conservan registro y fallan de forma segura si se eliminan/cambian fuera de la app.
- Mover un archivo importado entre piezas no lo reasigna automáticamente. No seguir shortcuts ni escanear subcarpetas arbitrarias.
- No reejecutar migración. Ante rollback del código, conservar columnas/RPC; la versión vieja no debe usarse para reproducir importados externos.
