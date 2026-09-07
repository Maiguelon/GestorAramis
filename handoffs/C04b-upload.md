# C04b — transporte de carga reanudable

Estado: **probado en aislamiento**. Fecha: 2026-09-07. No integrado al formulario de cliente ni conectado a Google. Sin commit propio; checkpoint a cargo del coordinador.

## Entrega y contrato

`src/lib/resumable-upload.ts` exporta `uploadResumableFile(file, session, options)`. Recibe un `Blob`/`File` y una sesión emitida por un backend autorizado. Consulta primero los bytes confirmados por Google, transmite por fragmentos de 256 KiB (configurables en múltiplos), y conserva los bytes confirmados ante respuestas perdidas, cortes y fallos transitorios. No lee el archivo completo en memoria.

Los reintentos tienen espera exponencial y límites; soporta abortar, detecta sesiones vencidas, rangos imposibles y confirmaciones que retroceden. Una respuesta 308 nunca equivale a éxito. El progreso indica bytes reconocidos por el proveedor; el resultado final es exclusivamente `uploaded_unverified`.

No recibe ni reenvía tokens OAuth. La URL de sesión es una credencial limitada: no ponerla en logs, analíticas, páginas compartidas ni almacenamiento demo. El transporte limita su destino al endpoint HTTPS esperado de Google, impide redirecciones y descarta cuerpos de proveedor. El navegador calcula Content-Length; el código no intenta establecer ese encabezado prohibido.

La separación entre iniciar, transferir y verificar sigue el protocolo oficial de [cargas reanudables de Drive](https://developers.google.com/workspace/drive/api/guides/manage-uploads).

## Evidencia local

```powershell
npm exec vitest run tests/upload.test.ts
```

**29 pruebas aprobadas** (2026-09-07, Fetch simulado): fragmentos, memoria, reanudación desde confirmación parcial, respuesta perdida, sesión ya terminada, 308 con todos los bytes, errores 408/429/5xx, espera acotada, sesión vencida, permisos, validación de URL/tamaño/MIME, rangos inconsistentes y cancelación. Ninguna transferencia real.

## Integración pendiente

1. Backend autoriza solicitud y pertenencia, impone tamaño/cuota y registra una sesión persistente antes de devolver la capacidad de carga.
2. UI conserva el mismo archivo original y sesión durante los reintentos. Después de recargar, no basta comparar tamaño/nombre para identificar un archivo: falta una estrategia de identidad verificable o reiniciar esa carga.
3. Tras `uploaded_unverified`, cliente entrega sólo `uploadId` al backend. `checkDriveUpload` verifica sesión y metadatos del proveedor; registrar el archivo y estado recibido mediante operación idempotente. La UI no decide que llegó por sí sola.
4. Conservar archivos completados ante un fallo parcial de varios archivos, permitir reintentar los restantes y mantener recibido separado de completo.
5. Verificar CORS/Range visibles, sesiones, cuota y video grande con interrupción en Android/iPhone y navegador de WhatsApp cuando existan cuentas. Esta prueba no la sustituyen los mocks.

La demo actual mantiene su indicación explícita de simulación; este transporte no está conectado a sus botones.
