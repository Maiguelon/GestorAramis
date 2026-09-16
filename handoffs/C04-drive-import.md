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
- Consentimiento e importación/reproducción real comprobados el 2026-09-16; ver cierre debajo.
- Google continúa Testing: expiración OAuth de 7 días sigue pendiente de resolver; no cambiada audiencia/publicación.
- Retiro automático afecta archivos incorporados desde Drive; archivos originalmente subidos por el gestor conservan registro y fallan de forma segura si se eliminan/cambian fuera de la app.
- Mover un archivo importado entre piezas no lo reasigna automáticamente. No seguir shortcuts ni escanear subcarpetas arbitrarias.
- No reejecutar migración. Ante rollback del código, conservar columnas/RPC; la versión vieja no debe usarse para reproducir importados externos.

## Cierre real — 2026-09-16
- Miguel confirmó expresamente el permiso ampliado. Consentimiento completado en Google para miguelcarreteroangel@gmail.com; callback del gestor confirmó conexión. Sin cambiar audiencia Testing.
- Antes de renovar, el archivo de prueba seguía excluido y daba 404. Después, listado de la carpeta devuelve cinco archivos y prueba_drive.mp4 responde 200 en metadata y 206 para bytes 0–1023 (1024 bytes verificados).
- La prueba real encontró un TypeError en Cloudflare al ejecutar files.list: redirect:error no admitido por el runtime desplegado. Reproducido también con Wrangler/workerd local (compatibility_date 2026-09-01). Se cambia a manual, igual que el resto de llamadas Drive; respuestas 3xx se rechazan sin reenviar credenciales. Test de regresión de redirecciones añadido.
- La RPC de incorporación fue probada directamente con el listado completo de la carpeta: changed:true. Tras corregir el transporte, Actualizar material desde la app termina con “Drive revisado…” y conserva cinco archivos sin duplicados.
- Sesión real de Miguel: prueba_drive.mp4 aparece en Hugo / Reel 02 (51.8 MB). Video terminó de reproducirse dentro de la app: currentTime=duration=41.076009, readyState=4, sin error. Botón Descargar dispara evento download del navegador; no se verificó el archivo completo guardado en disco.
- STATUS_LABELS también usa Planificación: corregida la etiqueta pendiente en filas mensuales y detalle, además del tablero.
- Suite completa: 428 tests / 15 archivos pasan. Build Pages pasa. No cambios de estado de producción ni modificaciones de archivos en Drive.
- Diagnóstico de fallos sync conserva sólo código seguro y clase de error; sin URLs, datos de archivos, cuerpos remotos ni credenciales.
- Despliegue final: https://663ef731.gestor-aramis.pages.dev y alias https://gestor-aramis.pages.dev. Smoke público pasa (rutas, configuración y rechazos de acceso anónimo/cross-origin).
- Siguiente: Eric prueba carga nativa de Drive en la carpeta vinculada de una pieza; Eliana revisa Material en el gestor. Actualiza al abrir, al recuperar foco y cada 30 segundos visible; no sincroniza con la app cerrada. Resolver Google Testing sigue pendiente.
