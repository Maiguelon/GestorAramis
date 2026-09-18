# Visor de Google para material del equipo — 2026-09-17

## Entrega
Publicado en https://8b93da56.gestor-aramis.pages.dev y alias habitual. Botón Ver con Google en MOV/M4V y en videos cuya reproducción nativa falló. Abre un único modal con iframe privado, sin cargar un visor por cada tarjeta. Conserva miniaturas, descarga del original y reproducción nativa MP4/WebM. Reintentar visor solicita de nuevo el enlace autorizado; Abrir en Google permite resolver la sesión en otra pestaña. Cerrar desmonta el iframe y devuelve foco a la tarjeta. Sin conversión, servicio pago, migración ni cambio de permisos Google.

## Autorización y límites
GET /api/drive/assets/:id/viewer verifica sesión Supabase, membresía, registro privado, generación de conexión, carpeta, checksum/tamaño/MIME y etiquetas de archivo propio antes de devolver una URL construida para drive.google.com/file/d/:id/preview. Sólo video. resourceKey opcional validada. No devuelve tokens, no descarga video por el servidor, no acepta un Drive ID arbitrario ni URL aportada por el navegador. Se comparte la comprobación estricta de pertenencia con miniaturas. Frontend también valida origen/ruta/query antes de montar iframe o enlace.

Google autentica el iframe con la sesión Google del navegador, independientemente de Supabase y del OAuth de servidor. El enlace no es una autorización temporal del gestor: conserva los permisos de Drive. Se usa exclusivamente para material interno mutable, nunca para aprobar snapshots exactos de cliente. La app no puede interpretar el contenido de un iframe de otro origen ni afirmar que onLoad significa reproducción exitosa; por eso siempre ofrece explicación, reintento, enlace directo y descarga. Una sesión Google ausente, cookies bloqueadas, procesamiento pendiente o falta de permiso pueden impedir reproducir.

## Pruebas
- 456 tests / 15 archivos Vitest pasan. Casos añadidos: URL vinculada con resourceKey; ausencia de compartir/transferir video; sesión revocada/anónima; generación equivocada, archivo inexistente/no-video, cambiado, papelera, carpeta ajena y resourceKey inválida.
- 14 recorridos compartidos drive.spec pasan. Recorrido drive-media-fallback también pasa tras corregir encoding del HTML simulado: miniaturas conservadas, no iframe antes de pulsar, fallo API, rechazo URL externa, reintento exitoso, iframe único, salida a Google y descarga, móvil sin desborde, cierre/foco y reproducción MP4 preservada. Es mock de Google, no evidencia de códec real.
- Compilación TypeScript/Vite/Pages y control de secretos del paquete pasan. Smoke público pasa con rechazo anónimo también para /viewer.
- Prueba real: MOV IMG_2796.mov, Club Luján / Tercera Fecha del Regional, file 1OuIdmsdKi9-1La3dpJtXaotcgchE7QDn. Google muestra imagen y reproduce en enlace directo; dentro de la app publicada se abrió el reproductor en el modal y avanzó hasta 0:09/0:09 (Seek 8568). No se cambió el original ni estado de pieza. No se probó cada uno de los 24 MOV.
- Primer iframe de prueba servido en HTTP localhost quedó en blanco; no se atribuye causa sin evidencia. La integración HTTPS alojada sí cargó Google y reprodujo el MOV. Un intento adicional de replay en iframe fue limitado por las coordenadas fraccionales del control CUA; no invalida la reproducción previa ni es un error comprobado de la aplicación.

## Pendiente para Eliana
Lectura real de permissions del archivo de prueba: owner y writer individuales; no enlace público, grupo ni dominio; eliana.victoriacarretero@gmail.com no figura. Falta compartirle en Drive el material que deba reproducir y que use esa cuenta Google en su navegador. No se concedió ese permiso ni se enviaron avisos. Usuario del gestor continúa accediendo a miniaturas y descarga mediante el servidor sin sesión Google personal.

Antes de ampliar acceso, definir carpeta concreta y permiso (lectura basta para visor). Después probar con Eliana. No convertir archivos en públicos ni ampliar OAuth para solucionar el iframe. Las pruebas actuales corresponden a la sesión de Miguel; no afirmar éxito para la cuenta de Eliana. Helpers ignorados work/viewer-permissions-probe.mjs y logs work/viewer-*.txt; no contienen credenciales en resultados.
