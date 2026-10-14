# Planificación, Producción y Deshacer aprobación — 2026-10-13

## Resultado

Decisión D29. Grabación y preparación pertenecen a Planificación / Marketing; Producción se reserva para trabajo listo para Diseño. El detalle elimina el bloque de subetapas y presenta acciones arriba, antes de las pestañas: Pasar a producción o Volver a planificación. Diseño mantiene Producción como entrada y puede consultar Planificación desde su selector.

Miguel confirmó volver a Revisión al corregir una aprobación accidental. Deshacer aprobación pide confirmación y reabre la misma entrega, con ID, versión, Caption y referencias de archivos intactos. La decisión vigente vuelve a pendiente; la aprobación original y la corrección quedan en actividad. Pedir cambios sigue exigiendo un motivo y devuelve la pieza a Producción. No se permite aprobar por edición libre de estado.

## Contrato y datos

- `undo-approval`: pieceId, expectedRevision y approvalId. El servidor conserva pertenencia staff, bloqueo del workspace, revisión esperada y recibos idempotentes. Rechaza versión ajena, obsoleta, invalidada, pieza archivada, publicada o ya corregida. Helper privado sin ejecución directa para authenticated/anon/service_role.
- Entregas actuales y revisiones antiguas selladas se reabren sobre su snapshot; no se crean versiones nuevas al corregir la decisión. Los textos de una entrega en Revisión permanecen protegidos hasta una devolución real.
- El cambio explícito a production asigna design/ready; volver a planned asigna marketing/ready. recording recibido desde una pestaña antigua se convierte en planned/marketing/ready. No se retiran enums históricos que aún deben poder leerse.
- La migración mueve sólo piezas activas en producción de Marketing/recording con cliente activo. Conserva fechas, planes, textos, material y registros archivados; agrega actividad y aumenta revision. La demo migra y persiste esa compatibilidad una sola vez, sin reset.
- Notificaciones existentes observan el estado final: producción lista para Diseño y revisión para Marketing. Reabrir una aprobación inicia otro ciclo de revisión; replay no duplica el evento. Migrar preparación no avisa a Diseño.

## Evidencia local

- `npm.cmd test`: 532 casos / 25 archivos aprobados. Después se agregó una prueba de migración demo y pasaron los 20 casos de `tests/api.test.ts`: 533 casos distintos cubiertos.
- Nuevos tests de dominio/SQL cubren la transición directa, compatibilidad recording, migración, identidad, versión exacta, historial, rechazo de conflictos e idempotencia. Se usan PostgreSQL local (PGlite) y metadatos sintéticos; no representan subidas a Google.
- Suite demo completa: 25/28 aprobados inicialmente; dos expectativas antiguas de una fixture de producción y una colisión de artefactos entre procesos de Playwright se corrigieron/verificaron mediante repetición focalizada. Los seis recorridos de calendario/historial pasaron después; los 28 recorridos quedaron cubiertos. La fixture de Producción ahora asigna explícitamente Diseño/ready.
- 13 recorridos compartidos focalizados cubiertos, incluido el nuevo de corrección: cancelar no guarda, perder la respuesta conserva el UUID tras recarga, reintentar no crea otra versión y se puede volver a aprobar explícitamente. Auth/API/Drive simulados.
- Compilación TypeScript/Vite compartida y Pages Worker aprobada. QA móvil de la acción superior en `work/undo-approval-mobile.png`, con datos ficticios. Usar directorios `--output` distintos al ejecutar varias suites Playwright a la vez para evitar colisiones de traces.

## Supabase y publicación

Migración `202610130001_simple_production_undo_approval.sql` aplicada una vez con éxito en el proyecto existente. Preflight: función ausente y dos piezas por migrar. Postflight: función presente, ejecución directa del helper falsa, cero preparaciones antiguas y dos actividades de migración. Durante una comprobación posterior el editor conservó el script anterior y un intento adicional abortó por función ya existente; no se aplicó de nuevo. Se limpió el documento entero, se verificó su contenido y se confirmó el postflight. **No repetir la migración.** En el editor, seleccionar todo antes de pegar; setValue sobre su área accesible puede insertar texto sin reemplazar el documento.

Prueba real de RPC bajo rol authenticated e identidad de un miembro staff, dentro de una transacción con cliente y pieza sintéticos. Verificó producción directa, vuelta a planificación, reapertura exacta, replay, conflicto, helper privado, corrección auditada una vez y un evento de revisión. Resultado alojado: `passed; synthetic records and notification events rolled back`. Se forzaron los triggers diferidos y se ejecutó rollback: no quedaron fixtures ni avisos de prueba, y no se usaron archivos de Drive. Script local ignorado `work/simple-workflow-hosted-probe.sql`; su sintaxis y rollback se validaron primero con PGlite mediante `work/validate-simple-workflow-probe.mjs`.

Publicación **https://62d0e851.gestor-aramis.pages.dev**; alias **https://gestor-aramis.pages.dev/** actualizado. `npm.cmd run pages:smoke -- https://gestor-aramis.pages.dev` aprobado. Sesión real: Producción mostró 11 piezas y Planificación cinco; Reel 02 migrado mostró Planificación / Marketing y Pasar a producción, sin controles de grabación. Sólo lectura en UI real; no se deshicieron aprobaciones ni se alteraron otras piezas del equipo.

## Continuidad

Bloque cerrado. Recargar → abrir pieza → acciones junto al estado. Las aprobadas de fecha pasada se encuentran en Historial → Completados y se abren con el mismo acceso a la corrección. Las vistas reales de clientes siguen pendientes de su siguiente pedido.
