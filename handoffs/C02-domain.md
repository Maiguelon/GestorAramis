# C02 — Dominio local verificable

Estado: **probado en aislamiento**. No representa un backend multiusuario ni una integración probada contra servicios externos.

## Entrega

- `src/domain/engine.ts`: `applyCommand(state, command, context)`, `DomainError` e `isCalendarDate`. Función pura, copia profunda de entrada y snapshots separados. Validación de responsables, fechas, transiciones, versiones, archivo, solicitudes y reintentos.
- `src/domain/selectors.ts`: `getClientView`, `assertPublicCommandAccess`, `localDate`, `addDays`, `weekRange`, `currentReview`, `activeMaterial` y `piecePriority`. Proyección explícita sin notas, propietarios, teléfonos, tokens, identificadores de Drive ni borradores de texto no enviados a revisión.
- `src/domain/seed.ts`: `createSeed(today?)`. Tres clientes ficticios, dos integrantes, siete piezas y fechas relativas al día local. Los tres enlaces iniciales se refieren a Casa Oliva: `demo-calendar`, `demo-review`, `demo-material`.
- `tests/domain.test.ts`: 31 pruebas de comportamiento; cubren permisos, privacidad, versiones exactas, concurrencia y recuperación de reintentos.
- `src/lib/api.ts` y `tests/api.test.ts`: adaptador de demostración con 18 pruebas adicionales de persistencia, límites públicos y errores del almacenamiento.

## Reglas comprobadas

- Una aprobación afecta a la versión exacta y pendiente. Comentar conserva la revisión pendiente; pedir cambios vuelve la pieza a producción.
- Una nueva revisión o un cambio de texto invalida revisiones/aprobaciones previas. Los snapshots históricos mantienen su texto y archivos originales.
- No es posible asignar aprobación ni revisión directamente desde la edición; programar/publicar exige aprobación vigente.
- `update-piece` exige `expectedRevision`; una escritura con revisión vieja falla sin mutar el estado.
- Respuestas idempotentes por revisión y clave: mismo contenido devuelve el resultado existente; reutilizar la clave con otro contenido devuelve conflicto.
- Registrar archivos no completa un pedido; repetir los mismos archivos no los duplica. El orden de las propiedades de sus metadatos no afecta esa comprobación.
- Preparar un enlace no registra envío. La respuesta puede llegar antes de marcar manualmente el envío.
- Enlaces de calendario son lectura. Un enlace de revisión/material sólo autoriza operaciones sobre su destino. Revocación, archivo y versiones superadas impiden acceso.
- Las proyecciones de solicitudes sólo contienen su solicitud. El calendario contiene únicamente piezas visibles del cliente; un enlace explícito de solicitud puede resolver su pedido aunque su pieza no figure en el calendario.
- Las piezas publicadas mantienen ese hecho: no admiten cambios de texto, nuevas revisiones ni volver a estados anteriores. Se permite editar título, fecha prevista, responsable, visibilidad y nota; archivarlas conserva la aprobación histórica. Decisión confirmada por el coordinador: una adaptación requiere una nueva pieza.
- El adaptador nunca devuelve el workspace desde una operación pública: únicamente su `entityId`. La autorización del enlace y el cambio usan el mismo snapshot.
- El adaptador demo rechaza `source: 'drive'`, referencias de proveedor y URLs arbitrarias. Los metadatos sin URL y las muestras `/demo/[nombre].svg` están admitidos.
- Leer o recibir el resultado de una operación no permite mutar el cache. Reiniciar la demo reemplaza los datos en una sola escritura: si falla, no borra lo anterior. Datos corruptos producen un error; jamás se reinician silenciosamente.

## Verificación reproducible

`npm test -- tests/domain.test.ts tests/api.test.ts`

Resultado: **49 pruebas aprobadas** entre dominio y API. `npm run typecheck` global también pasó después de integrarse los archivos de interfaz. El coordinador debe ejecutar los checks de aplicación al terminar su integración.

## Configuración y límites

- Sin credenciales ni red. No se escribieron archivos, carpetas ni permisos en Google Drive.
- Los archivos de muestra referencian `/demo/cover-oliva.svg`, `/demo/cover-norte.svg`, `/demo/cover-bruma.svg`; el coordinador crea sus placeholders gráficos.
- `applyCommand` es el dominio interno; el adaptador público debe llamar primero a `assertPublicCommandAccess`. No debe confundirse la demostración local con autorización segura en un servidor.
- `receive-material` valida metadatos, no verifica que haya bytes en un proveedor. Esa comprobación corresponde al adaptador Drive antes de ejecutar la operación; la demo debe identificar los archivos como simulación.
- Las URLs públicas se filtran y los campos privados de Drive se omiten. La protección real de medios requiere el Worker y verificaciones del proveedor.
- La autorización autenticada, RLS, OAuth, correo, carga reanudable, comprobación de cambios externos de archivos y persistencia multiusuario permanecen pendientes de sus bloques.
- El adaptador detecta una escritura externa entre lectura y guardado, pero `localStorage` no ofrece transacciones: dos escrituras de pestañas estrictamente simultáneas aún requieren la futura transacción del servidor. El modo demo no debe usarse como persistencia multiusuario.
- Se retiró `getDemoRequestLink`: el calendario secreto es realmente de consulta, sin enlaces que concedan escritura. Sus respuestas nunca exponen tokens, hashes ni enlaces de solicitudes. La futura navegación del calendario autenticado deberá autorizarse explícitamente.
- El contrato `ClientView.client` fue estrechado por el coordinador a identidad pública básica; los contratos permanecen bajo su control.

## Continuación

Integrar adaptador local y pantallas; realizar revisión independiente de permisos/aprobaciones y ejecutar pruebas globales. Después conectar contratos equivalentes al servidor con autorización y verificación del proveedor. Sin commit de subagente: el coordinador conserva el punto de integración y registra su referencia en el estado del proyecto.

## Revisión SQL y corrección de privacidad · 2026-09-07

El coordinador amplió el alcance del agente a la migración inicial, fixtures y pruebas PGlite. No se aplicó ningún cambio a Supabase remoto.

- Se retiró `pieces.caption` y se creó `piece_drafts.caption`, con RLS de lectura exclusiva para integrantes activos del equipo en su workspace. El adaptador interno deberá unir ese borrador; la API cliente deberá leer exclusivamente el texto de la revisión vigente y sellada.
- `can_read_review` filtra revisiones no selladas, superadas y anteriores a otra versión. Las políticas de respuestas y asociaciones de archivos heredan ese filtro. El equipo conserva lectura del historial completo de su workspace.
- Las regresiones ejecutan SQL real con PGlite: un cliente ve su pieza del calendario sin ver el borrador; otro cliente, otro workspace y un exintegrante tampoco acceden; el equipo autorizado sí. Una revisión nueva oculta la anterior al cliente, sin borrar el historial interno; comentarios de una revisión superada dejan de aparecer.
- Verificación: `npm test -- tests/server.test.ts tests/api.test.ts tests/domain.test.ts` → **98 pruebas aprobadas** (49 servidor, 49 dominio/API).

Límites exactos que siguen pendientes antes de conectar producción:

1. RLS limita filas, pero no convierte todas las tablas en las proyecciones públicas del contrato. Las lecturas autenticadas de tablas base todavía pueden incluir datos del propio cliente (`contact_name`, `phone`) y referencias internas (`owner_member_id`, `recorded_by_member_id`). `activity.actor` conserva el texto del actor. No afirmar que SQL oculta esos campos: el Worker debe reconstruir `ClientView`, omitir los datos no necesarios y usar un actor genérico; el frontend cliente no debe consumir tablas base directamente.
2. El SQL usa UUID para filas y claves idempotentes. El dominio demo usa IDs opacos de texto y respuestas con ID derivado. La integración debe mapearlos correctamente; no puede volcar `WorkspaceState` directamente. La API real debe exigir una clave UUID y mantener el chequeo de reutilización con otro payload dentro de una transacción.
3. Las transiciones de negocio, `expectedRevision`, sellado completo de la revisión y preservación de piezas publicadas necesitan RPCs transaccionales que todavía no están implementadas. El Worker sigue cerrado para esas rutas; los permisos directos de escritura están revocados incluso al equipo autenticado.
4. El repositorio futuro de autorización debe distinguir visibilidad del calendario de autorización por solicitud: un pedido explícitamente compartido puede corresponder a una pieza oculta en el calendario. Revocación, cliente/workspace, archivo y versión vigente deben verificarse siempre en servidor.
