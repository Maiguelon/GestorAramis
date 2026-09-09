# C02 — SQL de trabajo compartido del equipo

Fecha: 2026-09-08. Migración: `supabase/migrations/202609080001_shared_workspace.sql`, después de `202609060001_initial.sql`.

## Alcance

Base normalizada para el bloque interno: alta/edición de clientes, plan mensual, generación explícita de la base, alta/edición/archivo de piezas, guion, área y etapa de producción. Mantiene el contrato de la demo sin copiar sus datos ni sus archivos locales a Supabase.

`public.client_plans` contiene las cantidades, revisión y meses generados. `public.piece_production` contiene mes del plan, área, etapa y guion. Ambas tienen RLS exclusiva de equipo, sin permisos directos de escritura. Estos campos no se agregan a las filas de clientes/piezas que tienen lectura autorizada para clientes. La migración completa metadata privada para filas ya existentes y también admite un proyecto vacío.

## Contratos RPC

- `public.aramis_workspace(p_workspace_id uuid)` devuelve `{ state: WorkspaceState, memberId: string, workspaceId: string, workspaceName: string }`.
- `public.aramis_command(p_workspace_id uuid, p_command jsonb, p_request_id uuid)` acepta los comandos `create-client`, `update-client`, `generate-month`, `create-piece`, `update-piece`. Devuelve el mismo sobre más `entityId: string`.
- Los comandos conservan camelCase del contrato TypeScript. `expectedRevision` es obligatorio para editar cliente o pieza. El alta de pieza usa el miembro autenticado si se omite `ownerId`; cualquier responsable indicado debe ser equipo activo del mismo espacio.
- Errores de negocio: SQLSTATE `P0001`, mensaje exacto `VALIDATION`, `NOT_FOUND`, `CONFLICT`, `ARCHIVED`, `MONTH_EXISTS`, `EMPTY_PLAN`, `INVALID_TRANSITION`, `APPROVAL_REQUIRED`, `PUBLISHED_IMMUTABLE`, `IDEMPOTENCY_CONFLICT`, `FEATURE_UNAVAILABLE`. Identidad/permisos: SQLSTATE `42501`, mensaje `forbidden`. El servidor traduce códigos; no debe reenviar diagnósticos SQL arbitrarios.

Ambas entradas exigen `auth.uid()` con miembro activo de rol staff. Son SECURITY DEFINER con search_path fijo vacío y tablas calificadas. Sólo authenticated recibe EXECUTE; anon/PUBLIC no pueden llamarlas. No aceptan identidad del actor desde el payload ni usan service_role para simular usuario.

## Escrituras e invariantes

Cada comando bloquea la fila de workspace, vuelve a verificar y bloquea compartido el miembro activo antes de leer recibos o mutar. Las asignaciones de responsables también verifican/bloquean al miembro activo. Todo se confirma en una transacción de la llamada RPC. Las pruebas ejercitan el motor PostgreSQL, no un doble de la función.

Los recibos en `app_private.command_receipts` usan `(workspace_id, user_id, request_id)`. Repetir la solicitud con el mismo UUID y payload devuelve el mismo entityId y una lectura actual, sin duplicar contenido/historial; usar el mismo UUID con otro payload falla. Las operaciones rechazadas no generan recibos. Una revocación de acceso también bloquea reintentos previamente exitosos. Conservar el UUID al reintentar una respuesta de red incierta.

Generar mes completa faltantes por tipo y cuenta carruseles como posteos; no asigna fechas, mueve piezas ni repone las archivadas de un mes ya generado. El plan mensual y la fecha de publicación son independientes. Guion/copy/notas siguen separados de campos visibles al cliente.

Editar copy invalida revisiones pendientes/aprobadas; una edición simultánea no puede restaurar `approved`/`review`. Cambiar a preparación/producción invalida la revisión. Programar/publicar exige la revisión más reciente sellada, aprobada y con el copy vigente. Publicado impide reemplazar copy o retroceder estado; el archivo de una publicación conserva su aprobación histórica. Archivar revoca shares de sus solicitudes, sin revocar el calendario del cliente.

## Límites deliberados

- No implementa revisión nueva, respuesta, solicitudes de material, enlaces ni Drive. Esos comandos fallan `FEATURE_UNAVAILABLE`; `teamAssets` en un patch también falla, incluso si es un array vacío. El frontend remoto debe omitirlo.
- El snapshot interno incluye piezas archivadas e historial. `shares` y todos los arrays de assets son vacíos; nunca expone hashes, tokens, URLs de proveedor ni medios de ejemplo. No debe considerarse validación de revisión con video real.
- Sólo miembros activos aparecen en `state.members`. Piezas históricas pueden conservar un ownerId de miembro desactivado; la UI debe permitir verlas/reasignarlas sin suponer que ese miembro sigue activo.
- Por ahora entrega un snapshot de un workspace de equipo. No es una API pública de calendario y no debe reutilizarse para clientes. Paginación del historial y política de retención de recibos quedan para volumen real.
- PGlite usa una conexión. La prueba de escrituras competidoras verifica revisión esperada y rollback; el bloqueo entre conexiones y autenticación de Supabase alojado requieren una prueba de integración real.

## Verificación y aplicación

`npx vitest run tests/shared-sql.test.ts --reporter=dot`: **41 pruebas pasan**. Incluyen instalación vacía, migración sobre fixtures, proyección, RLS, ausencia de permisos directos, rol cliente/otro tenant/miembro desactivado/anon, límites de datos y nulls, idempotencia de los cinco comandos, separación de recibos por usuario, edición obsoleta, rollback ante error intermedio, mes parcial y reglas de aprobación/publicación/archivo.

Aplicar **sólo las dos migraciones** en orden sobre el proyecto de pruebas. `supabase/tests/bootstrap.sql` y `fixtures.sql` son exclusivos de PGlite; NO ejecutar en Supabase alojado. Crear workspace/perfiles/membresía mediante el procedimiento de setup del coordinador después de que existan usuarios Auth reales. No hace falta cargar fixtures ni secretos en el esquema.

Estado de este handoff: probado en PostgreSQL embebido y apto para aplicar a proyecto nuevo de pruebas; no aplicado por este agente y no declara integración remota completada. Siguiente acción: coordinador aplica/verifica con Auth real y dos sesiones antes del piloto.
