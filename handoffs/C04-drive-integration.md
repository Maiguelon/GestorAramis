# C04 — integración interna de Drive

Fecha: 2026-09-10. Estado: publicado; esquema y configuración alojados; falta terminar consentimiento y prueba Google real. Código `9c9338f`, despliegue `efec34ff.gestor-aramis.pages.dev`.

## Alcance

`server/drive-service.ts` une Auth, OAuth PKCE, RPC privada, cifrado AES-GCM con contexto por workspace/propósito, carpetas reservadas y subida verificada. `server/drive.ts` añade identificación de cuenta, generación/reserva de IDs, carpetas idempotentes y descarga privada del equipo sin cambiar snapshots de revisión. Frontend incorpora configuración, retorno OAuth, varios archivos, pausas/reintentos, preview por rangos y ZIP completo hasta 256 MiB. Material del equipo queda separado de revisiones/clientes.

Revisión cruzada: refresh usa sólo campos permitidos; reservas conservan padre/nombre originales; inicialización concurrente conserva la primera sesión; finalización/historial es idempotente; ZIP usa transporte autorizado sin query rechazada; descarga conserva nombre normalizado. Sesión Google expirada puede recuperar el ID reservado ya terminado tras verificarlo. No busca ni adopta archivos por nombre.

## Infraestructura realizada

- Cinco secretos del servidor instalados en Pages producción (no previews). Claves locales ignoradas por Git; `pages:prepare` no las empaqueta y verifica sus valores contra el paquete generado.
- Migración aplicada al Supabase existente desde SQL Editor. REST real del puente responde200 para Miguel,401 para anónimo y403 para usuario ajeno/inexistente.
- Ningún archivo o carpeta se creó aún en Google: OAuth no se completó. No hubo modificación del Drive preexistente.

## Evidencia y siguiente paso

Validación final: 382 unitarias + 20 recorridos demo + 15 compartidos con mocks pasan. Incluyen recuperación de sesión vencida, pausa/reinicio desde bytes confirmados, retorno OAuth de un uso, ZIP binario completo y cancelación de lectura tras cierre de sesión en otra pestaña. Typecheck y Worker dry-run pasan.

Smoke del dominio estable pasa: login, ruta de texto protegida, API configurada y denegación anónima/de otros orígenes, incluyendo Drive. Sesión de Miguel y configuración real de Drive verificadas desde UI. Un retorno Google quedó pendiente durante la interrupción y venció; se rechazó correctamente y se inició uno nuevo.

Seguir: completar la autorización desde Configuración→Conectar Drive en la sesión existente de Miguel. El consentimiento Google requiere su confirmación porque concede acceso a archivos de su cuenta. Luego subir un archivo sintético identificado en Prueba de conexión, verificar material, persistencia y descarga. No usar videos personales de Descargas; esa solicitud fue cancelada anteriormente.

## Límites

Carpeta propia del gestor; Picker de árbol existente pendiente. El ZIP de 256 MiB evita acumular videos grandes en memoria móvil; descarga individual admite archivos mayores. No se han probado todavía el teléfono de Eric, interrupciones de red reales, permisos con Eliana ni revisiones de clientes. Google sigue External/Testing; no publicar OAuth sin resolver sus requisitos correspondientes. No modificar reglas de producción por inferencia.
