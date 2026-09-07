# Cuentas y conexión de servicios — Gestor Aramís

Estado al 6 de septiembre de 2026: se puede trabajar y probar localmente sin crear cuentas. La aplicación usa una demostración local declarada. Existen una migración PostgreSQL probada y módulos de servidor probados en aislamiento; **crear las cuentas y agregar sus claves todavía no convierte el prototipo en una aplicación conectada**. Faltan los adaptadores, las rutas de negocio y las pruebas con servicios reales indicadas abajo.

No se creó ninguna cuenta, proyecto remoto, carpeta de Drive ni despliegue durante esta entrega. No se enviaron correos ni mensajes externos. El Drive compartido por el usuario sigue siendo una referencia; no autoriza reorganizarlo.

## 1. Qué puede continuar sin intervención del usuario

```powershell
npm ci
npm test
npm run typecheck
npm run build
npm run worker:check
npm run dev
```

`npm test -- tests/server.test.ts` ejecuta PostgreSQL local mediante PGlite, configura roles de prueba y aplica la migración real. No requiere Docker, Supabase, Drive ni red. Los dos archivos de `supabase/tests/` contienen datos ficticios y sustitutos de Auth para esas pruebas: **no se ejecutan en Supabase real**.

La respuesta de `/api/health` identifica el servidor como `scaffold`. Las demás rutas API devuelven `503 configuration_missing` si falta configuración, o `501 feature_unavailable` si está presente pero la operación todavía no fue implementada. No devuelven datos de demostración.

## 2. Qué pedir al usuario cuando toque probar en línea

En una única intervención, pedir que el titular de Aramís cree o abra las cuentas de **Supabase, Cloudflare y Resend**, y que identifique la cuenta de Google que debe ser dueña de los archivos de trabajo. Puede usarse la cuenta Google que ya usan; no hace falta migrar sus materiales. También hace falta saber dónde administran el DNS del dominio y elegir el subdominio de la herramienta.

No pedir contraseñas, tokens ni claves por el chat. El usuario ingresa en los sitios y las claves se configuran en los mecanismos de secretos. No contratar planes pagos ni cambiar el DNS de la página actual por supuesto. Los precios y límites se revisan cuando se habiliten los servicios.

### Supabase: datos y acceso

1. Crear una organización de Aramís y un proyecto de **prueba**, con contraseña de base de datos guardada por el titular. Registrar la región elegida para mantenerla coherente con el futuro proyecto de producción.
2. Registrar el identificador del proyecto y su URL. Distinguir la clave pública `publishable` de la clave privilegiada `service_role`; esta última existe sólo en el servidor.
3. En un proyecto nuevo y vacío, revisar y aplicar `supabase/migrations/202609060001_initial.sql` mediante el editor SQL de Supabase. Alternativamente, cuando se configure la CLI, incorporarla al flujo de migraciones del proyecto; no ejecutar ambas rutas ni repetir manualmente la migración.
4. Crear usuarios de prueba acordados desde Auth. La migración no crea identidades reales. Desde el administrador de base de datos, crear los registros `profiles`, un `workspace`, sus `clients` y `members`. Los UUID de `profiles.user_id` corresponden a Auth; un miembro `staff` tiene `client_id = null` y un miembro `client` tiene el cliente correcto. No permitir autoasignación de roles desde el navegador.
5. Configurar URL de la aplicación y lista explícita de redirecciones permitidas en Auth. Para acceso por código, revisar la plantilla de correo y su confirmación; la aplicación de inicio de sesión todavía debe conectarse y probarse.
6. Configurar SMTP de Resend antes de probar clientes externos. El servicio SMTP predeterminado de Supabase es limitado y orientado a pruebas, no al envío general de correos de la aplicación. [Documentación de SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
7. Repetir contra el proyecto real los casos de cliente A, cliente B, integrante inactivo y usuario sin membresía, incluyendo peticiones directas a la API. PGlite demuestra las reglas SQL locales; no sustituye la verificación de JWT, PostgREST ni configuración del proyecto alojado.

La migración concede lectura autenticada con RLS y prohíbe escrituras directas a todos los usuarios de la aplicación. Las notas internas viven en una tabla separada porque RLS restringe filas, no columnas. Los enlaces guardan sólo SHA-256 del token, y su tabla queda oculta al navegador. [RLS en Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security)

### Google: autorización y archivos

1. Desde la cuenta elegida, crear un proyecto de Google Cloud para Gestor Aramís y habilitar Drive API. Habilitar Google Picker API cuando se implemente la selección de archivos existentes.
2. Configurar Google Auth Platform: nombre Aramís, correo de soporte y audiencia correspondiente a su cuenta. Durante pruebas externas, agregar únicamente las cuentas del equipo que vayan a autorizar Drive.
3. Declarar solamente `https://www.googleapis.com/auth/drive.file`. Crear un cliente OAuth de aplicación web y registrar el callback exacto que tendrá el Worker. El módulo propone `/api/google/callback`, pero el handler todavía no está conectado. Para trabajo local se admite un callback `http://localhost` con su puerto exacto.
4. Registrar `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `GOOGLE_REDIRECT_URI` como configuración exclusiva del servidor. El secreto y el refresh token nunca van a variables `VITE_*`.
5. Implementar la conexión accesible sólo a integrantes activos: guardar estado OAuth de un solo uso, asociado a usuario/agencia, y verificador PKCE; validar sesión, estado y expiración al volver del consentimiento. Los módulos existentes preparan y verifican esos datos, pero falta el repositorio persistente y los handlers.
6. Almacenar el refresh token cifrado en almacenamiento privado del servidor, con clave AES-GCM guardada aparte como secreto y con procedimiento de rotación. Los helpers existentes vinculan el cifrado a la agencia. Falta integrar su almacenamiento y renovación automática.
7. Autorizar la conexión desde la cuenta del equipo. Solicitar una carpeta de prueba concreta antes de crear archivos reales. La futura aplicación podrá crear su carpeta de trabajo una vez acordado ese destino; no renombrar, mover ni importar en bloque la estructura actual de Aramís.
8. Usar Google Picker para conceder acceso explícito a originales existentes. `drive.file` permite los archivos creados o seleccionados para la aplicación: elegir una carpeta no implica tener acceso global a todos los archivos que ya contiene. La copia de revisión conserva un archivo separado y un checksum. [Permisos de Drive](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [copias de archivo](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/copy)
9. Probar un video representativo: comenzar carga, cortar conexión, reanudar, confirmar desde Google, reproducir y adelantar en Android/iPhone. Las sesiones de carga son capacidades privadas: no registrarlas en logs. No declarar recibida una carga a partir de un identificador enviado por el navegador. [Cargas reanudables](https://developers.google.com/workspace/drive/api/guides/manage-uploads)
10. Verificar revocación y reconexión de OAuth, archivo borrado o modificado, falta de permisos y límites. Antes del piloto, revisar el estado de publicación/consentimiento de la aplicación y la duración real de los refresh tokens según su configuración; el modo de prueba de OAuth no es una solución de operación permanente. [OAuth para servidor web](https://developers.google.com/identity/protocols/oauth2/web-server)

### Resend: correos de ingreso

1. Crear la cuenta de Aramís y verificar un dominio de envío o subdominio dedicado, sin alterar los registros de recepción del correo actual.
2. Agregar los registros DNS que indique Resend y esperar la verificación.
3. Configurar los datos SMTP en Supabase Auth con remitente de Aramís. Para este flujo, Resend se conecta a Supabase; no hace falta exponer una ruta libre de envío de correos en el Worker.
4. Probar sólo con direcciones acordadas. Comprobar ingreso por código, código inválido/vencido, reenvío con límites y conservación de sesión en el teléfono.

### Cloudflare: web y servidor

1. Crear la cuenta del titular. Vincular el repositorio cuando la versión conectada esté lista para un entorno de prueba.
2. Configurar Pages: compilación `npm run build`, salida `dist`. Mantener la demostración y producción claramente separadas; `VITE_APP_MODE=production` debe bloquear adaptadores que todavía no existen.
3. Configurar el Worker desde `wrangler.toml`. Primero ejecutar `npm run worker:check`, que empaqueta sin desplegar. El archivo actual deshabilita `workers.dev` para evitar una publicación accidental.
4. Configurar secretos mediante el panel de Cloudflare o `wrangler secret put`, nunca valores dentro de `wrangler.toml` ni del repositorio. [Secretos de Workers](https://developers.cloudflare.com/workers/configuration/secrets/)
5. Cuando se conozca el dominio exacto, configurar el enrutamiento `/api/*` al Worker y el resto a Pages. Si la zona DNS no puede usar ese esquema, resolver antes una dirección de API separada con CORS limitado al origen exacto; no usar `*` para habilitar credenciales. Este enrutamiento aún no se configuró ni probó.
6. Revisar caché privada, política de referencia y logs: los enlaces de cliente y las URLs de carga no deben convertirse en información pública. Probar que una URL de enlace no se filtra en navegación ni en errores.

## 3. Variables y dónde van

| Nombre | Ubicación | Estado |
|---|---|---|
| `VITE_APP_MODE` | `.env.local` / Pages | `demo` para la demostración local |
| `VITE_SUPABASE_URL` | Frontend | Pública, pendiente de proyecto |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Frontend | Pública, su seguridad depende de RLS |
| `VITE_API_BASE_URL` | Frontend | `/api` por defecto; requiere enrutamiento |
| `SUPABASE_URL` | Worker | URL del mismo proyecto |
| `SUPABASE_PUBLISHABLE_KEY` | Worker | Verificación de sesión |
| `SUPABASE_SERVICE_ROLE_KEY` | Secreto Worker | Privilegiada; jamás frontend |
| `GOOGLE_CLIENT_ID` | Worker | OAuth, sin implementación de handler aún |
| `GOOGLE_CLIENT_SECRET` | Secreto Worker | OAuth |
| `GOOGLE_REDIRECT_URI` | Worker | Debe coincidir exactamente con Google |
| Clave de cifrado AES-GCM | Secreto Worker | Falta implementar su carga y rotación |
| SMTP de Resend | Supabase Auth | Configurar con datos reales del proveedor |

Los nombres de la clave de cifrado y del almacenamiento de estados OAuth se fijarán al implementar esos adaptadores; no hay una variable ficticia que los active hoy. Para desarrollo del Worker, `.dev.vars` debe seguir ignorado por Git.

## 4. Trabajo que falta antes de conectar el producto

1. Implementar repositorios SQL de sesiones/membresías y enlaces, estados OAuth, credenciales cifradas y sesiones de carga. No almacenar tokens crudos de enlaces; devolverlos solamente al crearlos. No usar la forma `Share.token` de la demo como modelo persistente de producción.
2. Implementar transacciones de negocio: comprobar revisión esperada, modificar pieza, versionar revisión y sellarla, responder con idempotencia, registrar historial y recuperar conflictos. Los constraints SQL refuerzan integridad pero no implementan por sí solos todo el flujo.
3. Conectar handlers autenticados a los módulos existentes. Antes de cada lectura de archivo o operación de carga, resolver el recurso desde la base de datos y verificar pertenencia exacta a cliente, agencia, pieza y solicitud; no confiar en IDs recibidos del navegador.
4. Decidir e implementar la transferencia de chunks y su recuperación en navegador. El código actual inicia y comprueba sesiones de Drive, pero no contiene aún el transporte de chunks, cuotas por solicitud ni cancelación. Si se entrega una capacidad de carga al navegador, limitarla al envío autorizado y documentar su validez independiente del enlace de la aplicación.
5. Integrar inicio de sesión y API remota en la interfaz, preservando los contratos del producto. Habilitar producción sólo después de esos recorridos; no quitar el bloqueo por falta de configuración para aparentar éxito.
6. Revisión independiente de permisos, tokens, snapshots y respuestas; después, pruebas completas contra los servicios reales, copia de seguridad/restauración, prueba en teléfonos y piloto.

**Próximo pedido al usuario:** cuentas y dominio cuando comience la integración real. No son necesarios para seguir corrigiendo y validando el trabajo local de esta entrega.
