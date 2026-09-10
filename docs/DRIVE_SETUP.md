# Drive del equipo

La conexión pertenece al espacio Aramis. El personal entra al gestor con Supabase; una cuenta de Google autoriza dónde guardar los materiales del equipo. Son accesos distintos.

## Configuración de servidor

La migración `202609100001_drive_team.sql` requiere las dos migraciones anteriores. Se instaló en el proyecto alojado el 10/9/2026; **no volver a ejecutarla**. Crea tablas privadas y `aramis_drive`, ejecutable sólo por el servidor, que comprueba otra vez la membresía activa. No otorga a usuarios del navegador acceso directo a tokens, verificadores ni sesiones de subida.

Variables privadas en `.dev.vars` local ignorado y en secretos de Cloudflare Pages producción:

- `SUPABASE_SERVICE_ROLE_KEY`: admite la clave moderna `sb_secret_…` o la anterior de servidor; nunca `VITE_`.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.
- `DRIVE_ENCRYPTION_KEY`: 32 bytes aleatorios en base64. **Conservar esta clave**; cambiarla impide descifrar conexiones y cargas pendientes existentes.

El callback registrado es `https://gestor-aramis.pages.dev/api/google/callback`. `scripts/configure-drive.mjs <ruta-al-JSON-OAuth>` incorpora el JSON descargado a la configuración local, preservando la clave de cifrado si ya existe. `node scripts/configure-drive.mjs --install` envía sólo las cinco variables por entrada privada de Wrangler a producción. No imprime valores ni los copia al paquete público. Cambios de secretos requieren una nueva publicación para tomar efecto.

`scripts/capture-server-key.mjs` es un formulario local de uso único para instalar una clave ya existente sin pegarla en una conversación. Tiene dirección aleatoria, escucha sólo en loopback y caduca a los 15 minutos. No crea ni rota claves. No publicar este formulario ni el archivo local.

El empaquetado de Pages conserva la lista de variables públicas y verifica que ningún valor privado de la configuración local figure en sus archivos. Los secretos no se incluyen en versiones preview por defecto.

## Conectar y usar

1. Ingresar al dominio estable y abrir **Configuración → Conectar Drive**.
2. Elegir la cuenta de Google autorizada y conceder `drive.file`. Volver al gestor y comprobar el mensaje de conexión.
3. Abrir una pieza → **Material** → seleccionar una o varias tomas. El avance es por archivo; el gestor confirma cada archivo con Google antes de adjuntarlo.
4. El material queda disponible para previsualizar, descargar individualmente o agrupar en ZIP. El guion se mantiene en el gestor y conserva su botón para abrirlo completo en otra pestaña.

La primera carga crea `Gestor Aramis / Cliente / YYYY-MM / Pieza / Material`. El mes es el del plan. Las reservas de carpeta mantienen su ubicación cuando se cambia título o fecha; no se reorganizan carpetas anteriores de Drive. Este bloque no integra carpetas existentes mediante Picker.

## Límites y recuperación

- Máximo de 2 GiB por archivo. Subida directa en bloques de 4 MiB mediante una URL limitada a esa carga; los tokens de la cuenta Google quedan cifrados en el servidor.
- Pausar/reintentar conserva lo recibido. Después de recargar hay que seleccionar el archivo original. Sólo se guardan UUID y metadatos para el reintento, nunca la URL de subida ni tokens Google en el almacenamiento del navegador.
- Si vence una sesión de subida, quitarla de la lista y seleccionar el archivo para iniciar otra. Las sesiones abandonadas no equivalen a archivos adjuntos.
- ZIP completo hasta 256 MiB para limitar memoria del navegador. Si falla un archivo, no se entrega un ZIP parcial. Para conjuntos mayores, descargar individualmente o abrir la carpeta de Drive. Esto no limita el tamaño de cada subida.
- Las previsualizaciones usan una cookie privada breve y lectura por rangos; cada solicitud vuelve a comprobar usuario y pertenencia. Los formatos que el navegador no puede reproducir siguen siendo descargables.
- Una cuenta Google diferente no reemplaza una conexión existente por accidente. Usar **Renovar conexión** con la misma cuenta si se revoca o vence.
- Google permanece en External/Testing: la autorización de prueba tiene duración limitada. La publicación de OAuth y sus datos legales son un paso posterior.
- La carga de material no significa “tomas completas” ni aprueba la pieza. Revisiones y clientes reales siguen en bloques posteriores.

## Verificación y continuidad

Pruebas de SQL en PGlite, HTTP con servicios simulados y navegador con Auth/Drive simulados cubren permisos, reintentos, concurrencia y fallos parciales. No sustituyen una carga real ni una prueba desde el teléfono de Eric. Consultar `PROJECT_STATE.md` y `handoffs/C04-drive-integration.md` para la evidencia alojada y el siguiente paso exacto.

Fuentes: [claves de Supabase](https://supabase.com/docs/guides/getting-started/api-keys), [subidas de Drive](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [audiencia de OAuth](https://support.google.com/cloud/answer/15549945?hl=en).
