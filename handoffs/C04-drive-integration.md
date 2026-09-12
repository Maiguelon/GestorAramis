# C04 — integración interna de Drive

Fecha: 2026-09-12. Estado: **integración interna probada contra Google en escritorio**. Código funcional `dffa2b8`, primero publicado en `288fa74a`; publicación final `https://f27d6ae2.gestor-aramis.pages.dev` (mismo código más aclaración de reanudación en la misma pestaña). Dominio estable: `https://gestor-aramis.pages.dev`. C04 completo sigue pendiente de teléfono, permisos con segunda identidad y alcance de clientes.

## Alcance

`server/drive-service.ts` une Auth, OAuth PKCE, RPC privada, cifrado AES-GCM con contexto por workspace/propósito, carpetas reservadas y subida verificada. `server/drive.ts` añade identificación de cuenta, generación/reserva de IDs, carpetas idempotentes y descarga privada del equipo sin cambiar snapshots de revisión. Frontend incorpora configuración, retorno OAuth, varios archivos, pausas/reintentos, preview por rangos y ZIP completo hasta 256 MiB. Material del equipo queda separado de revisiones/clientes.

Revisión cruzada: refresh usa sólo campos permitidos; reservas conservan padre/nombre originales; inicialización concurrente conserva la primera sesión; finalización/historial es idempotente; ZIP usa transporte autorizado sin query rechazada; descarga conserva nombre normalizado. Sesión Google expirada puede recuperar el ID reservado ya terminado tras verificarlo. No busca ni adopta archivos por nombre.

## Infraestructura realizada

- Cinco secretos del servidor instalados en Pages producción (no previews). Claves locales ignoradas por Git; `pages:prepare` no las empaqueta y verifica sus valores contra el paquete generado.
- Migración aplicada al Supabase existente desde SQL Editor. REST real del puente responde200 para Miguel,401 para anónimo y403 para usuario ajeno/inexistente.
- Miguel completó personalmente OAuth; conexión persistente y refresh confirmados. Las cargas sintéticas crearon sólo el árbol propio Gestor Aramis/Prueba de conexión/2026-09/Reel 01/Material. No hubo modificación del Drive preexistente.

## Evidencia y siguiente paso

Validación acumulada del código funcional: **404 unitarias y 19 recorridos compartidos** pasan. Incluyen recuperación de sesión vencida, pausa/reinicio desde bytes confirmados, respuesta final perdida, retorno OAuth de un uso, ZIP binario completo, cancelación tras cierre de sesión y fixture de HTTP nativo con Chromium. Son mocks salvo la fixture nativa; no se presentan como pruebas Google. Los **20 recorridos demo** pasaron antes de estas correcciones limitadas a Drive. Este cierre sólo cambia una indicación de UI y documentación: TypeScript/Vite y empaquetado Worker pasan de nuevo.

Smoke del dominio estable pasa: login, ruta de texto protegida, API configurada y denegación anónima/de otros orígenes, incluyendo Drive. Sesión de Miguel y configuración real de Drive verificadas desde UI. Un retorno Google quedó pendiente durante la interrupción y venció; se rechazó correctamente y se inició uno nuevo.

Pruebas reales completadas desde la UI alojada:

- Recuperación de `aramis-prueba-drive.webm` (2.917.815 bytes) y `aramis-prueba-drive-grande.webm` (8.294.597 bytes) seleccionando sus originales. Google ya los tenía completos; se adjuntaron una vez después de verificar identidad, tamaño y checksum.
- Carga nueva de `aramis-prueba-carga-nueva.webm` (8.294.597 bytes), cruzando el bloque de 4 MiB, terminada sin intervención ni reintento manual. Tres assets confirmados por RPC real; tamaños y MD5 coinciden con fixtures de work.
- Preview con readyState 4 y sin errores; duración del grande/nuevo 17,8289 segundos. Reproducción y seek del grande comprobados con controles nativos. Los tres registros permanecen al recargar y reabrir Material.
- Descarga individual en Downloads/aramis-prueba-drive.webm: MD5 `0da973458048fd95e829d54e7346c537`, igual al original.
- ZIP real de los primeros dos archivos en Downloads/Reel 01.zip: 11.212.696 bytes. Ambas entradas verificadas byte a byte mediante tamaño y MD5; el grande tiene MD5 `60f5cb22620727234a11b419b0b03e4b`. ZIP y video son archivos técnicos generados, no material personal.

Para revisar: ingresar con el usuario existente → Prueba de conexión → Reel 01 → Material. Se dejaron los tres videos sintéticos disponibles. No recrear cuentas ni repetir OAuth/secretos/migración. Scripts ignorados `work/check-drive-assets.mjs` y fixtures locales conservan la comprobación de metadata. No ejecutar probes de sesiones ya completadas: al adjuntarlas se elimina su sesión cifrada.

## Límites

Problema resuelto: Google completaba los WebM pero la respuesta final de sesiones iniciadas sin Origin no incluía CORS. Fallaba tanto en Chromium independiente como en el navegador integrado. La API pasa el origen validado de su URL a initiateDriveUpload y el navegador pide la compatibilidad No-308 sin seguir redirecciones. Ante respuesta final ilegible/vencida, el servidor verifica el archivo reservado; jamás marca guardado si no verifica. Los diagnósticos temporales de consola se retiraron antes de dffa2b8.

Carpeta propia del gestor; Picker de árbol existente pendiente. Límite de archivo 2 GiB; ZIP de 256 MiB para limitar memoria. MP4/WebM tienen preview de video; MOV/M4V son descargables. Reanudación en sessionStorage: recargar la misma pestaña permite seleccionar el original; cerrarla puede perder el pendiente. No hay cola duradera entre sesiones.

Próximo: probar teléfono real (varias tomas, cortes, pausa y descarga), retomar entrada de Diseño y regla de tomas completas con Miguel. El alta de Eliana se mantiene postergada por el usuario. Antes del piloto sostenido faltan identidad adicional/permisos alojados, cuota/revocación, archivos grandes representativos y OAuth producción; Google sigue External/Testing. Calendario, pedidos y revisiones de clientes permanecen en sus bloques, no habilitados por esta entrega.
