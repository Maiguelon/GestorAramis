# Contratos v1

domain.ts es la fuente compartida de tipos. El coordinador controla modificaciones. Fechas del calendario YYYY-MM-DD (sin convertirlas a UTC); historial ISO UTC. IDs opacos. Una revisión vigente por pieza. Las operaciones devuelven errores explícitos, no estados inventados.

## Límite entre demostración y producción
La primera demostración usa un almacén local de navegador y datos ficticios con el mismo dominio. Se verifica en aislamiento; no es autenticación, persistencia multiusuario ni almacenamiento Drive real. Nunca desplegar el modo demo como producción. La API real usará Supabase y permisos del servidor.

## Dominio para agentes
- src/domain/engine.ts exporta applyCommand(state, command, context): CommandResult; DomainError con code, message. Función pura, no muta la entrada.
- src/domain/seed.ts exporta createSeed(today?: string): WorkspaceState. Fixtures sintéticas relativas al día para mostrar semana útil. Enlaces demo definidos como demo-calendar, demo-review, demo-material.
- src/domain/selectors.ts exporta getClientView(state, token): ClientView y helper de fechas/prioridad. Proyección explícita: jamás propagar internalNote ni identidades internas. Links revocados/archivados rechazados. Calendario read-only sin tokens ni enlaces de escritura; una solicitud explícita puede abrir su pieza aunque no figure en calendario.
- src/lib/api.ts provee readWorkspace(), runCommand(command), readClientView(token), subscribe(listener), resetDemo(). React useWorkspace() expone state, execute(command), error. runPublicCommand sólo devuelve entityId, nunca el workspace.
- Cliente UI: src/client/ClientCalendar.tsx export default ({token}:{token:string}); src/client/ClientRequest.tsx export default ({token}:{token:string}); src/client/client.css. Usar readClientView/runPublicCommand(command, token), subscribe; el coordinador provee esas funciones.

## Seguridad invariante
La UI no es una barrera. En producción un token secreto se valida mediante hash en servidor, se restringen alcance y destino, y RLS controla acceso autenticado. Jamás devolver la lista de tokens en proyecciones públicas. No permitir que calendario emita comandos. Aprobación de versión vieja rechazada, reintentos idempotentes y comentarios independientes. Antes de marcar archivos recibidos, verificar su existencia y tamaño en el proveedor.

`update-piece` y `create-review` exigen `expectedRevision` capturada al empezar la edición. Un formulario viejo no debe refrescar ese valor silenciosamente. Formularios de respuesta y mensajes se fijan a la revisión que muestran; no trasladar sus entradas a una revisión nueva. Para archivos aprobados usar `PinnedDriveAsset` y descarga por `driveRevisionId`, no el head mutable del archivo. Ese identificador del proveedor todavía requiere persistencia en el esquema real.

## Base mensual interna
Client admite monthlyPlan, revision y generatedMonths opcionales para conservar snapshots demo anteriores. create-client/update-client/generate-month operan en el motor local; update-client exige expectedRevision. generate-month completa déficit por formato y marca el mes generado para impedir duplicados. Piece añade planMonth, workArea, productionStage, script y teamAssets, todos omitidos de PublicPiece. Fallback de mes: planMonth, fecha prevista, fecha de creación. Archivos locales viven por asset.id en IndexedDB, la metadata sólo admite source demo sin credenciales, IDs Drive ni URLs externas. Estos campos requieren futura migración privada SQL y handlers antes de habilitar producción.
