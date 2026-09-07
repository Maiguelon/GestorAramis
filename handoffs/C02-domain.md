# C02 — Dominio local verificable

Estado: **probado en aislamiento**. No representa un backend multiusuario ni una integración probada contra servicios externos.

## Entrega

- `src/domain/engine.ts`: `applyCommand(state, command, context)`, `DomainError` e `isCalendarDate`. Función pura, copia profunda de entrada y snapshots separados. Validación de responsables, fechas, transiciones, versiones, archivo, solicitudes y reintentos.
- `src/domain/selectors.ts`: `getClientView`, `assertPublicCommandAccess`, `localDate`, `addDays`, `weekRange`, `currentReview`, `activeMaterial` y `piecePriority`. Proyección explícita sin notas, propietarios, teléfonos, tokens, identificadores de Drive ni borradores de texto no enviados a revisión.
- `src/domain/seed.ts`: `createSeed(today?)`. Tres clientes ficticios, dos integrantes, siete piezas y fechas relativas al día local. Los tres enlaces iniciales se refieren a Casa Oliva: `demo-calendar`, `demo-review`, `demo-material`.
- `tests/domain.test.ts`: 31 pruebas de comportamiento; cubren permisos, privacidad, versiones exactas, concurrencia y recuperación de reintentos.
- `src/lib/api.ts` y `tests/api.test.ts`: adaptador de demostración con 17 pruebas adicionales de persistencia, límites públicos y errores del almacenamiento.

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

Resultado: **48 pruebas aprobadas**. `npm run typecheck` global también pasó después de integrarse los archivos de interfaz. El coordinador debe ejecutar los checks de aplicación al terminar su integración.

## Configuración y límites

- Sin credenciales ni red. No se escribieron archivos, carpetas ni permisos en Google Drive.
- Los archivos de muestra referencian `/demo/cover-oliva.svg`, `/demo/cover-norte.svg`, `/demo/cover-bruma.svg`; el coordinador crea sus placeholders gráficos.
- `applyCommand` es el dominio interno; el adaptador público debe llamar primero a `assertPublicCommandAccess`. No debe confundirse la demostración local con autorización segura en un servidor.
- `receive-material` valida metadatos, no verifica que haya bytes en un proveedor. Esa comprobación corresponde al adaptador Drive antes de ejecutar la operación; la demo debe identificar los archivos como simulación.
- Las URLs públicas se filtran y los campos privados de Drive se omiten. La protección real de medios requiere el Worker y verificaciones del proveedor.
- La autorización autenticada, RLS, OAuth, correo, carga reanudable, comprobación de cambios externos de archivos y persistencia multiusuario permanecen pendientes de sus bloques.
- El adaptador detecta una escritura externa entre lectura y guardado, pero `localStorage` no ofrece transacciones: dos escrituras de pestañas estrictamente simultáneas aún requieren la futura transacción del servidor. El modo demo no debe usarse como persistencia multiusuario.
- `getDemoRequestLink` es una ayuda exclusiva de la demostración para navegar a solicitudes ficticias existentes. El calendario real de lectura no debe poder obtener por esta vía capacidades de escritura; el servidor deberá separar ese acceso del calendario autenticado. La limitación fue informada al coordinador.
- El contrato `ClientView.client` fue estrechado por el coordinador a identidad pública básica; los contratos permanecen bajo su control.

## Continuación

Integrar adaptador local y pantallas; realizar revisión independiente de permisos/aprobaciones y ejecutar pruebas globales. Después conectar contratos equivalentes al servidor con autorización y verificación del proveedor. Sin commit de subagente: el coordinador conserva el punto de integración y registra su referencia en el estado del proyecto.
