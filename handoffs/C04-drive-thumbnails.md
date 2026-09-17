# Miniaturas privadas de Drive — 2026-09-17

## Alcance
Eliana necesita identificar las tomas sin descargar/reproducir cada video. Se usan las miniaturas generadas por Drive para todos los MIME video, incluidos MOV/M4V. No hay conversión, iframe Google, servicio pago ni cambios en originales. MOV/M4V siguen ofreciendo descarga; MP4/WebM muestran un botón Reproducir que crea el reproductor sólo al pulsarlo.

Endpoint GET /api/drive/assets/:assetId/thumbnail bajo la misma cookie cifrada breve o JWT que los medios. Revalida usuario, membresía, asset persistido, generación de conexión, carpeta, checksum/tamaño/MIME y etiquetas de archivos propios. Solicita thumbnailLink al proveedor en cada petición; ni enlace efímero ni OAuth llegan al navegador. Hosts lhN.googleusercontent.com HTTPS, sin redirects/credenciales/puertos; sólo imágenes raster de hasta 2 MiB, límite comprobado también durante lectura y timeout. Respuesta private,no-store para revalidar autorización en nuevas lecturas. Sin caché compartida ni persistencia de URLs vencibles.

Interfaz: tarjetas compactas 160x120, imágenes lazy con dimensiones reservadas, estados de carga/no disponible. Error de miniatura no bloquea descarga o reproducción admitida. Actualizar material renueva la sesión y reintenta imágenes; polling de datos no vuelve a descargar las miniaturas ya montadas. El navegador controla el umbral lazy, no se promete cantidad exacta de solicitudes simultáneas. No hay descarga del video al abrir una tarjeta.

## Evidencia
- Suite Vitest: 450 tests / 15 archivos pasan; incluye cookie válida/revocada, aislamiento por generación y archivo, MOV, falta de miniatura, cambio/carpeta/papelera, URLs no confiables, redirect, HTML y tamaño excesivo.
- Playwright compartido: 15 recorridos pasan (drive.spec + drive-media-fallback.spec). Mock realista de imágenes; MOV/M4V sin video, error/reintento, dimensiones de móvil sin desborde, enlaces de descarga preservados y MP4 solicitado sólo al reproducir. No prueba descarga nativa del original; Playwright no intercepta ese download en este entorno.
- Compilación TypeScript/Vite/Pages y control de secretos del paquete pasan. Publicado en 38e9bc92.gestor-aramis.pages.dev; alias habitual actualizado. Smoke remoto pasa incluyendo denegación anónima del endpoint thumbnail.
- Lectura real Club Luján / Tercera Fecha del Regional: 24 registros MOV. Se comprobaron tres archivos (dos llamados IMG_2796.mov y uno IMG_2795.mov): endpoint proveedor devuelve JPEG de 11118, 11073 y 10092 bytes con la nueva función. Descarga del original comprobada mediante Range de 1024 bytes, 206 y attachment; no se descargó entero ni se modificó.
- Helpers ignorados work/thumbnail-probe.mjs, work/thumbnail-live-check.mjs y work/thumbnail-live-assets.json, sin tokens guardados en sus resultados. No ejecutar antiguos scripts de creación/papelera para esta prueba.
- Verificación visual en producción con sesión real de Miguel: Producción → Club Luján / Tercera Fecha del Regional → Material. Se ven miniaturas reales de los MOV con el botón Descargar, sin reproductor MOV ni errores en las imágenes visibles. 25 archivos (24 MOV y un MP4), thumbnails fuera del área cercana esperan lazy loading. Se dejó esa pieza abierta. No se cambiaron archivos, estado de producción ni permisos.

## Límites y siguiente paso
Drive puede no haber generado todavía la miniatura o no poder procesar un video. En ese caso aparece Miniatura no disponible y sigue Descargar; Actualizar material reintenta. No duración añadida ni conversión/visor Google. Estos últimos quedan explícitamente para otro bloque, sin contratar Stream. Google OAuth Testing y demás pendientes anteriores siguen separados.
