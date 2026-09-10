# C04 — persistencia privada de Drive

Fecha: 2026-09-10. Estado: probado en PostgreSQL aislado (PGlite); pendiente de integración HTTP y ejecución en Supabase alojado por el coordinador.

## Alcance

Migración aditiva `supabase/migrations/202609100001_drive_team.sql`. No cambia `aramis_workspace`, las tablas de revisiones ni los permisos de los clientes. Crea cinco tablas privadas con RLS sin policies y sin grants de acceso directo, incluso para `service_role`:

- `drive_connections`: una cuenta de Google por workspace, tokens cifrados, generación estable y carpeta raíz.
- `drive_oauth_states`: hash de estado, payload cifrado, dueño, vencimiento y consumo único.
- `drive_folders`: reserva inmutable de ID, padre y nombre por clave lógica.
- `drive_uploads`: reserva de archivo y sesión de carga, identificada por UUID y dueña del usuario.
- `drive_team_assets`: resultado de verificación del servidor, privado del equipo.

Única entrada: `public.aramis_drive(p_workspace_id uuid,p_user_id uuid,p_action text,p_payload jsonb default '{}') returns jsonb`. Sólo `service_role` puede ejecutarla. El servidor debe validar previamente el JWT de Supabase y enviar el ID de ese usuario; jamás aceptar `p_user_id` elegido por el navegador. Cada llamada SQL vuelve a exigir membresía staff activa en el workspace. La función es `security definer`, usa `search_path=''`, nombres cualificados y el mismo orden de bloqueo workspace/membresía que `aramis_command`.

## Contrato para el coordinador

Los nombres JSON usan camelCase. Los sobres cifrados usan exclusivamente `{iv:number[12],ciphertext:number[16..131072]}` con bytes 0..255. SQL valida su forma; el cifrado real y AAD son responsabilidad del servidor. No enviar tokens o URLs de sesión sin cifrar.

| Acción | Payload | Resultado |
|---|---|---|
| `connection-get` | `{}` | conexión o `null` |
| `connection-save` | `{expectedGeneration:null\|uuid,generation:uuid,encryptedTokens,accountEmail,accountPermissionId,rootFolderId:null\|string}` | conexión guardada |
| `state-put` | `{stateHash:hex64,encryptedPayload,expiresAt:ISO}` | `{stored:true}`; vence dentro de 1 hora como máximo |
| `state-take` | `{stateHash}` | `{stateHash,encryptedPayload,expiresAt}` o `null`; borra atómicamente sólo si dueño/workspace coinciden; vencido se descarta |
| `folder-get` | `{logicalKey}` | `{logicalKey,folderId,parentId,name}` o `null` |
| `folder-put` | `{logicalKey,folderId,parentId?:string\|null,name?:string\|null}` | reserva ganadora, conservando ID/padre/nombre iniciales |
| `upload-put` | `{uploadId,pieceId,name,mimeType,size,fingerprint,driveFileId,folderId,generation,encryptedSession:null\|sobre}` | reserva/carga actual; metadata inmutable |
| `upload-get` | `{uploadId}` | carga del propio usuario o `null`; otro dueño/workspace produce `NOT_FOUND` |
| `upload-update` | `{uploadId,encryptedSession?:sobre,offset?:number,status?:'uploading'\|'expired'}` | carga actual; offset monotónico |
| `upload-complete` | `{uploadId,asset:{driveFileId,checksum,driveRevisionId?:string\|null,mimeType,size}}` | asset verificado; ID igual a uploadId |
| `list-assets` | `{pieceId?:uuid}` | assets de piezas/clientes activos del workspace |
| `get-asset` | `{assetId}` | asset accesible por cualquier staff activo o `null` |

Conexión: resultado contiene `generation,encryptedTokens,accountEmail,accountPermissionId,rootFolderId,updatedAt`. Un refresh/reconsentimiento conserva `generation`; cambio de cuenta o carpeta raíz existente se rechaza. `expectedGeneration` debe ser `null` sólo en la inserción inicial. No se implementa desconexión/cambio de cuenta implícito.

Carga: resultado contiene `uploadId,workspaceId,userId,pieceId,clientId,name,mimeType,size,fingerprint,driveFileId,folderId,generation,encryptedSession,offset,status,createdAt,updatedAt`. Se puede reservar antes de iniciar la sesión externa y guardar el sobre cifrado después. El destino debe estar previamente reservado en `drive_folders` dentro del workspace. Límite SQL 10 GiB por archivo; el servidor puede imponer uno menor.

Inicialización concurrente: para el mismo `uploadId`, usuario, pieza, nombre, MIME, tamaño, huella, carpeta y generación, `upload-put` devuelve siempre la reserva ganadora aunque otra llamada haya pregenerado un `driveFileId` distinto. El servidor debe usar el ID devuelto. `upload-update` guarda `encryptedSession` sólo si estaba vacío; si otra llamada ya lo guardó, devuelve todo el registro ganador sin reemplazar sesión, offset ni status. El progreso posterior actualiza `offset` sin enviar de nuevo `encryptedSession`.

Asset: `id,workspaceId,pieceId,clientId,name,mimeType,size,driveFileId,folderId,generation,checksum,driveRevisionId,createdAt`. No incluye usuario, huella ni sesión cifrada. La finalización exige coincidencia de tamaño/MIME/Drive ID con la reserva, checksum MD5 válido, y sólo puede ejecutarla quien subió. Nombre/pieza/cliente se derivan de la reserva. Tras completar borra la sesión cifrada, suma una revisión a la pieza y una actividad interna, una sola vez. Repetición idéntica devuelve el mismo asset; checksum/revisión distintos se rechazan. El contenido no se agrega a una revisión ni se aprueba automáticamente.

Pieza o cliente archivado bloquean creación, continuación, finalización y lecturas de archivos. Miembro inactivo pierde todas las operaciones, incluso reintentos. Los errores relevantes son `FORBIDDEN` (SQLSTATE 42501), `VALIDATION`, `CONFLICT`, `ACCOUNT_CONFLICT`, `FOLDER_CONFLICT`, `DRIVE_NOT_CONNECTED`, `FOLDER_NOT_FOUND`, `IDEMPOTENCY_CONFLICT`, `ASSET_MISMATCH`, `NOT_FOUND` y `UNKNOWN_ACTION`.

## Verificación

- `npm.cmd test -- tests/drive-sql.test.ts tests/shared-sql.test.ts`: **64 pruebas pasan**, incluyendo 23 de Drive después del ajuste de inicialización concurrente.
- Cobertura de comportamiento: ACL/RLS, todos los caminos de acción con cliente/otro tenant/inactivo/desconocido, CAS y cuenta, sobres rechazando plaintext, estado de un uso/expirado/dueño ajeno, carpeta ganadora estable, reserva/carga idempotente, metadata conflictiva, offset, verificación de tamaño/checksum, historial exactamente una vez, staff distinto leyendo assets pero no sesiones, aislamiento de proyecciones cliente y archivo.
- No hubo llamadas a Google, migraciones alojadas, credenciales, dependencias nuevas ni commits en este subagente.

Próximo paso: coordinador integra el adaptador de servidor, aplica la migración una vez al proyecto existente y prueba autorización/carga/lectura reales. No ejecutar `supabase/tests/bootstrap.sql` ni fixtures en Supabase alojado.
