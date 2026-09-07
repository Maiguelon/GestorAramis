# C04c — revisión binaria fijada y streaming privado

Estado: **probado en aislamiento**. Fecha: 2026-09-07. Ninguna llamada a Drive real, ruta pública, migración ni cuenta creada. Sin commit propio; checkpoint a cargo del coordinador.

## Problema corregido en la primitive

Comprobar el checksum con `files.get` y después descargar la cabeza actual con `files.get?alt=media` deja una carrera: el contenido podría cambiar entre ambas peticiones. `streamDriveAsset` conserva compatibilidad, pero queda expresamente marcado como transporte mutable **no apto para aprobaciones exactas**. Esta aclaración sustituye la afirmación más general sobre checksum del handoff inicial C03-C04.

`server/drive.ts` incorpora `PinnedDriveAsset` con `driveRevisionId`, `pinDriveAssetRevision`, `copyPinnedDriveSnapshot` y `streamPinnedDriveAsset`:

1. Copiar el original seleccionado a un archivo de la app y comprobar pertenencia, formato y checksum.
2. Leer `headRevisionId` y fijar esa revisión mediante `revisions.update` con `keepForever: true`. Validar ID, checksum, tamaño, MIME y retención de la revisión devuelta antes de guardar el snapshot.
3. Para reproducir, autorizar previamente la relación share/revisión/archivo desde la base. La primitive revisa pertenencia y papelera del archivo, valida los metadatos de la revisión guardada y transmite exclusivamente `/files/{fileId}/revisions/{revisionId}?alt=media`.
4. Una nueva cabeza puede tener bytes diferentes: se sigue mostrando la revisión fijada. Si esa revisión desaparece o pierde acceso, fallar; nunca sustituirla por el contenido actual.

La identidad de una revisión binaria evita la carrera de contenido entre metadatos y media porque sus bytes son inmutables. Google expone `headRevisionId` para archivos binarios. [Modelo oficial de revisiones](https://developers.google.com/workspace/drive/api/guides/change-overview).

El endpoint de actualización admite `drive.file`. [Referencia de revisions.update](https://developers.google.com/workspace/drive/api/reference/rest/v3/revisions/update). La descarga por revisión admite `Range` y exige conservarla primero. [Descarga de versiones anteriores](https://developers.google.com/workspace/drive/api/guides/manage-downloads#download_blob_file_content_at_an_earlier_version).

El streaming comparte validación de rangos y longitudes con la primitive anterior: no acepta un rango distinto, un total cambiado ni un 200 cuando pidió 206. Devuelve el stream sin cargar todo el archivo, no reenvía cookies ni errores privados y usa `private, no-store`, `nosniff` y MIME permitido.

## Evidencia local

```powershell
npm exec vitest run tests/drive-edge.test.ts tests/upload.test.ts
```

**76 pruebas aprobadas** (47 de metadatos/streaming, 29 de transporte de carga) el 2026-09-07. Los casos añadidos cubren fijación, respuesta de retención no verificable, cabeza cambiada, revisión equivocada, acceso cruzado, papelera, IDs inválidos, descarga por revisión, ausencia de fallback, rangos y fallo de permisos/retención. Los casos Google usan Fetch simulado; no acreditan reproducción ni permisos remotos.

## Límites y siguiente integración

- La base todavía no persiste `driveRevisionId`; falta migración posterior para snapshots, mapeo del repositorio y constraints de identidad inmutable. No conectar una revisión real usando únicamente `drive_file_id` y checksum del esquema actual.
- Ninguna ruta de Drive está expuesta en `server/index.ts`. Cada petición de reproducción debe autorizar la revisión y el share vigente; las etiquetas de Drive son una comprobación adicional, no autenticación del cliente.
- Copiar, fijar y guardar en PostgreSQL no forman una sola transacción remota. Falta una operación persistida y reintentable para evitar duplicados y registrar copias huérfanas; no borrar copias automáticamente sin conocer su uso.
- `keepForever` evita limpieza automática, no la eliminación voluntaria por el propietario. Hay hasta 200 revisiones conservadas por archivo y consumen almacenamiento. No hay garantía de backup. [Retención y límites oficiales](https://developers.google.com/workspace/drive/api/guides/manage-revisions#specify_revisions_to_save_from_auto_delete).
- Esta primitive admite imágenes y videos binarios conocidos, no exportaciones de documentos Google. Los originales se seleccionan expresamente; no se modifica la estructura existente.
- Falta probar con Google real: acceso a revisiones con `drive.file`, cambio de cabeza tras sellado, eliminación de revisión, reproducción/seek móvil y comportamiento de redirecciones del endpoint. Las redirecciones se rechazan por diseño; si el proveedor las requiere, habrá que validar destinos y credenciales de forma explícita antes de habilitarlo.

Próxima acción: persistir ID de revisión junto al snapshot sellado y completar autorización/handlers; después verificar videos de prueba cuando el usuario configure las cuentas.
