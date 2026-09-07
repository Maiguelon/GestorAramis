# C02 / C03 / C04 — fundamento de servidor y almacenamiento

Estado: **probado en aislamiento**. Fecha: 2026-09-06. No conectado a servicios reales ni habilitado para producción. Sin commit propio: integración y commit a cargo del coordinador.

## Entrega

- `supabase/migrations/202609060001_initial.sql`: modelo normalizado de agencias, clientes, perfiles de Auth, miembros, piezas, notas internas separadas, revisiones, pedidos de material, archivos verificados, asociaciones, respuestas, enlaces y actividad.
- Integridad de pertenencia con claves foráneas compuestas; un responsable debe ser integrante `staff` de la misma agencia. Referencias entre clientes/agencias se rechazan también para inserciones privilegiadas.
- RLS con identidad de `auth.uid()`: equipo sólo su agencia; clientes sólo sus piezas visibles y no archivadas. Notas internas, actividad privada, credenciales de enlace e identificadores de Drive no se entregan a clientes. `shares` no tiene permisos de lectura del navegador. Escrituras autenticadas directas prohibidas, incluyendo cambio de rol.
- Snapshots SQL sellados: texto, versión y asociaciones de archivos no se pueden sobrescribir después del sellado. Metadatos verificados de archivos inmutables. SHA-256 obligatorio para enlaces y unicidad de decisión/reintento por revisión.
- `server/authz.ts`: tokens aleatorios de 256 bits, búsqueda por hash, rechazo de revocación/expiración/alcance/recurso, callback de pertenencia, verificación de identidad mediante Supabase Auth y membresía activa de equipo.
- `server/google-oauth.ts`: `drive.file`, offline, PKCE, estado de un solo uso ligado a identidad/agencia, intercambio y renovación de tokens, cifrado AES-GCM de refresh token ligado a agencia. Repositorios persistentes aún pendientes.
- `server/drive.ts`: copia de un original seleccionado a snapshot separado; inicio reanudable con tamaño y metadatos de pertenencia; confirmación contrastada con Google; streaming con Range y checksum sin cargar todo el video en memoria. URLs de sesión limitadas al endpoint HTTPS de Google, redirecciones bloqueadas y errores saneados.
- `server/index.ts`: `/api/health` sin secretos y estado explícito `scaffold`; cualquier ruta de negocio permanece cerrada con 503/501. No se exponen endpoints de Drive sin autorización implementada.
- `docs/SETUP.md`: cuentas, configuración, secretos, pasos de prueba real y lista precisa de integración pendiente.

## Verificación realizada

```powershell
npm test -- tests/server.test.ts
```

Resultado: **47 pruebas aprobadas**. Incluyen 11 casos de PostgreSQL con la migración completa ejecutada en PGlite; se cambian roles y `auth.uid()` de prueba para ejercitar las políticas SQL reales. Los casos restantes usan Fetch/WebCrypto y respuestas de Google/Supabase simuladas. Ninguna llamada remota, carga, correo o creación de cuenta.

Se verificaron: cliente vecino de la misma agencia; otra agencia; antiguo integrante; anonimato; notas y hashes privados; SQL directo sin escritura; escalada de rol; FK de pertenencia; snapshots sellados; enlaces inválidos/revocados/expirados; estado OAuth inválido/reutilizado; cifrado por agencia; carga interrumpida; tamaño/MIME/carpeta/propietario de carga incorrectos; archivo cambiado; Range inválido/ignorado; redirección hostil; no reenvío de cookies/URL ni cuerpo de errores de Google.

`npm run typecheck` no detectó errores en los archivos de esta entrega. En la última ejecución global aún faltaba `src/internal/PieceDetail` de otro bloque en curso; el coordinador debe repetir la comprobación global al integrar.

## Límites concretos

- C02 producción no está completo: faltan repositorios, RPC/transacciones de negocio, control de revisión concurrente e historial atómico. El esquema no traduce automáticamente una respuesta en cambio de estado de pieza.
- C03 producción no está completo: falta UI/flujo real de correo, adaptadores de membresía/enlaces, emisión y revocación remotas, límites de peticiones y configuración de Auth.
- C04 producción no está completo: faltan handlers OAuth, almacenamiento persistente de estado/credenciales/sesiones, transferencia y recuperación de chunks, cuotas, Google Picker, creación de carpeta y prueba con videos/celulares reales.
- La copia de Drive tiene checksum para detectar alteraciones. Drive no vuelve inmutable un archivo por usar esta aplicación; si cambia, el reproductor lo rechaza en vez de tratarlo como la versión aprobada.
- `drive.file` no otorga acceso global al árbol compartido por el usuario. Los originales deben seleccionarse explícitamente; no se importó ni alteró la carpeta existente.
- PGlite no verifica configuración real de Supabase/PostgREST, concurrencia de múltiples conexiones ni el navegador de WhatsApp. Es evidencia local, no validación del despliegue.
- Tener credenciales no habilita la API por arte de magia: 501 permanece hasta implementar cada handler seguro.

## Próximo bloque recomendado

Agregar repositorios y RPC transaccionales, con SQL tests sobre conflictos y versión exacta, manteniendo el Worker cerrado para funciones restantes. Después conectar identidad/enlaces y almacenamiento OAuth, y probar en un proyecto remoto de prueba cuando el titular configure las cuentas según `docs/SETUP.md`.

El coordinador debe revisar independientemente RLS y autorización antes de marcar integrado. No editar la migración una vez aplicada a un proyecto real: crear migraciones posteriores.
