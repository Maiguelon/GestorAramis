# C02/C03 — integración de equipo compartido

Fecha: 2026-09-09. Coordinador integra SQL, servidor, adaptador y UI. Base anterior `6da041d`.

## Alcance
Clientes, planes mensuales, piezas, guiones/notas y producción guardan en Supabase con sesión de equipo. La API verifica Auth y reenvía el JWT; RPC security definer verifica membresía activa y workspace. Sólo cinco tipos de comando; revisión y material remoto siguen fuera del bloque. La demo conserva datos y medios locales.

Errores HTTP seguros `{code,error}`; límites de body, origen único, caché no-store, timeout y sin detalles SQL. El Worker no necesita service_role. Pages Functions delega al mismo handler; Vite redirige /api al Worker local.

UI asincrónica, bloqueo durante guardado, borradores ante conflicto y reintento visible con UUID persistido en sessionStorage. La lectura no puede sobrescribir un guardado más reciente y respuestas de una sesión anterior no pueden restaurar datos tras salir. Cerrar sesión borra estado/diario local. Auth real por contraseña; OTP/SMTP y recuperación autónoma pendientes.

## Evidencia
269 unitarias, 20 E2E demo y 5 E2E compartidas simuladas; build demo/compartido, Worker dry-run y empaquetado Pages pasan. SQL: ver C02-shared-sql.md. Auth/API mock en tests/shared-ui es intencional y no demuestra integración alojada.

En Supabase real se aplicaron ambas migraciones y se provisionó sólo Miguel, por alta realizada por el propio usuario. Comprobadas 17 tablas públicas, RLS de recibos, staff activo y llamada de lectura con rol/claim controlados en SQL Editor. Luego se completó login por contraseña, validación de sesión y RPC por la API local: cliente Prueba de conexión, base de tres piezas, guion y paso a producción/Diseño. Otra pestaña recupera el texto; reinicio de servidores y recarga mantienen sesión y datos. No se probó todavía una segunda identidad.

La comprobación en workerd encontró una incompatibilidad que los mocks no detectaban: no soporta fetch redirect:error. Auth, RPC y primitivas Google/Drive usan ahora manual y validan el estado sin seguir redirecciones. Una prueba adicional rechaza redirects del proveedor sin reenviar credenciales; las pruebas previas de Drive conservan verificación de respuestas y 308 reanudable. No se declara Google real validado.

## Reproducción y límites
`docs/SHARED_SETUP.md` contiene variables, instalación y comandos. Configuración concreta sólo en archivos locales ignorados. Nunca aplicar supabase/tests/* en el proyecto real. Proyecto y migraciones ya existentes: no volver a instalarlos.

Antes del piloto falta verificar aislamiento/concurrencia alojados con identidades distintas. Cloudflare no desplegado ni autenticado por CLI. Google/Drive y Resend no configurados. No se hicieron envíos ni modificaciones al Drive/DNS. Siguiente bloque: publicación de prueba y acceso de Eliana.

La lectura devuelve el espacio completo; crecimiento y retención de recibos se revisan con volumen real. Los medios remotos y shares se omiten; no presentar la versión compartida como aprobación de videos disponible.
