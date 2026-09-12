# C04 — integración interna de Drive

Fecha: 2026-09-12. Estado: conexión Google y transferencia real confirmadas; falta confirmación en la app y medios. Corrección 308 `7b94cf8` publicada en `7b80ebd6`; Origin y recuperación de confirmación listos para publicar.

## Alcance

`server/drive-service.ts` une Auth, OAuth PKCE, RPC privada, cifrado AES-GCM con contexto por workspace/propósito, carpetas reservadas y subida verificada. `server/drive.ts` añade identificación de cuenta, generación/reserva de IDs, carpetas idempotentes y descarga privada del equipo sin cambiar snapshots de revisión. Frontend incorpora configuración, retorno OAuth, varios archivos, pausas/reintentos, preview por rangos y ZIP completo hasta 256 MiB. Material del equipo queda separado de revisiones/clientes.

Revisión cruzada: refresh usa sólo campos permitidos; reservas conservan padre/nombre originales; inicialización concurrente conserva la primera sesión; finalización/historial es idempotente; ZIP usa transporte autorizado sin query rechazada; descarga conserva nombre normalizado. Sesión Google expirada puede recuperar el ID reservado ya terminado tras verificarlo. No busca ni adopta archivos por nombre.

## Infraestructura realizada

- Cinco secretos del servidor instalados en Pages producción (no previews). Claves locales ignoradas por Git; `pages:prepare` no las empaqueta y verifica sus valores contra el paquete generado.
- Migración aplicada al Supabase existente desde SQL Editor. REST real del puente responde200 para Miguel,401 para anónimo y403 para usuario ajeno/inexistente.
- Miguel completó personalmente OAuth; el gestor confirmó la conexión. La primera carga sintética creó las carpetas propias de la pieza Reel 01 del cliente Prueba de conexión, pero se interrumpió sin adjuntar el video. No hubo modificación del Drive preexistente.

## Evidencia y siguiente paso

Validación final: 382 unitarias + 20 recorridos demo + 15 compartidos con mocks pasan. Incluyen recuperación de sesión vencida, pausa/reinicio desde bytes confirmados, retorno OAuth de un uso, ZIP binario completo y cancelación de lectura tras cierre de sesión en otra pestaña. Typecheck y Worker dry-run pasan.

Smoke del dominio estable pasa: login, ruta de texto protegida, API configurada y denegación anónima/de otros orígenes, incluyendo Drive. Sesión de Miguel y configuración real de Drive verificadas desde UI. Un retorno Google quedó pendiente durante la interrupción y venció; se rechazó correctamente y se inició uno nuevo.

Seguir: publicar y comprobar la corrección del protocolo reanudable. Una prueba con Chromium y servidor HTTP real distinguió 308 sin Location (legible) de 308 con Location (rechazado como redirección); se pide la respuesta alternativa 200 + X-Http-Status-Code-Override: 308 sin permitir redirecciones. Verificar contra Google real, luego preview, persistencia y descargas. Los archivos sintéticos están en work/aramis-prueba-drive.webm (2.917.815 bytes) y work/aramis-prueba-drive-grande.webm (8.294.597 bytes); no usar videos personales de Descargas.

## Límites

Diagnóstico real posterior: los dos WebM llegaron completos a Drive, con tamaños y MD5 exactos. Las respuestas finales de sesiones iniciadas sin Origin devuelven200 pero sin Access-Control-Allow-Origin; fallan en Chromium independiente y en el navegador integrado. La API ahora pasa el origen de su URL a initiateDriveUpload (sólo HTTPS o HTTP local), y la UI consulta la confirmación del servidor al agotar reintentos, además de cuando caduca la sesión. Nunca marca guardado si el servidor no verifica. Nuevos checks:404 unitarias,19 recorridos compartidos. Recuperar desde los archivos originales de work; el archivo pequeño usa uploadId 6c44075c-654b-4b48-838a-191ac9363083 y el grande 6b43ad97-decc-4f47-afab-e02c6187d632. No volver a crear cuentas/credenciales ni aplicar migración.

Carpeta propia del gestor; Picker de árbol existente pendiente. El ZIP de 256 MiB evita acumular videos grandes en memoria móvil; descarga individual admite archivos mayores. No se han probado todavía el teléfono de Eric, interrupciones de red reales, permisos con Eliana ni revisiones de clientes. Google sigue External/Testing; no publicar OAuth sin resolver sus requisitos correspondientes. No modificar reglas de producción por inferencia.
