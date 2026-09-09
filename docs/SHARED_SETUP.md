# Datos compartidos y acceso del equipo

Este bloque conecta clientes, planes mensuales, piezas, guiones, notas y producción a Supabase. La demo permanece en el navegador y no se importa automáticamente. Los archivos, aprobaciones y enlaces de clientes siguen pendientes de sus integraciones; la interfaz compartida los indica como no disponibles.

## Instalación en un proyecto nuevo

1. Aplicar, en orden, `supabase/migrations/202609060001_initial.sql` y `supabase/migrations/202609080001_shared_workspace.sql` desde el editor SQL. Ambas contienen una transacción. Verificar éxito antes de continuar. No repetirlas si ya fueron aplicadas ni ejecutar los archivos de `supabase/tests/` en el proyecto real.
2. Auth → Users → Add user → Create new user. Correo acordado y contraseña ingresada por su titular; Auto confirm evita enviar un correo. No agregar invitaciones ni abrir altas públicas desde la app.
3. El administrador completa `supabase/setup/first-staff.sql` con el UUID del usuario de Auth y un UUID nuevo del espacio. Repetir para otra persona requiere su propio usuario, nombre y el mismo workspace. El navegador no puede otorgarse permisos. Eliana y Eric aún no están provisionados.
4. Guardar el UUID del espacio como `ARAMIS_WORKSPACE_ID` del servidor. La API verifica el JWT con Supabase Auth y envía ese JWT a la función SQL. No utiliza una clave `service_role` para estas operaciones.

## Probar en esta computadora

Crear `.env.shared.local` (ignorado por Git):

```dotenv
VITE_APP_MODE=production
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=PUBLIC_PUBLISHABLE_KEY
VITE_API_BASE_URL=/api
```

Copiar `.dev.vars.example` a `.dev.vars` y completar la misma URL/clave pública y `ARAMIS_WORKSPACE_ID`. No son necesarias las credenciales de base de datos ni de Google para esta fase.

En dos terminales:

```powershell
npm.cmd run worker:dev
npm.cmd run dev:shared
```

Abrir http://127.0.0.1:5174 e ingresar con el usuario creado. El servidor local escucha en 8787 y Vite redirige `/api` al servidor. Si el puerto está ocupado, comprobar si el proceso ya está funcionando. `npm.cmd run dev` conserva la demo en 5173. No ejecutar ambos modos en el mismo puerto.

La sesión se conserva en este navegador. Los datos están en Supabase; cada pestaña actualiza al recuperar foco y cada 15 segundos cuando es visible. Un borrador abierto mantiene su revisión y exige cargar los cambios actuales si alguien guardó antes. Si se corta la respuesta de un guardado, usar **Reintentar guardado**: conserva el mismo identificador para evitar duplicados, incluso tras recargar la pestaña. No cerrar sesión mientras haya un guardado sin confirmar.

## Pruebas y despliegue

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run worker:check
npm.cmd run pages:check
npm.cmd run test:e2e
npm.cmd run test:e2e:shared
```

`build:shared` compila con `.env.shared.local`. Pages Functions (`functions/api/[[path]].ts`) utiliza el mismo servidor bajo `/api/*`; mantiene web y API en el mismo origen. `pages:check` sólo empaqueta el código y no publica. `pages:dev` permite verificar un build en el runtime local de Cloudflare.

`test:e2e` prueba la demo; `test:e2e:shared` utiliza servicios simulados en un puerto separado (5175), sin tocar Supabase real. La evidencia de ingreso/guardados reales está registrada por separado en PROJECT_STATE.md.

En Cloudflare Pages, configurar el build con `VITE_APP_MODE=production`, URL y clave pública de Supabase. Configurar para Functions `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` y `ARAMIS_WORKSPACE_ID`. La compilación normal en Cloudflare usa `npm run build`, salida `dist`. No subir `.env*`, `.dev.vars`, datos de prueba o secretos al repositorio. Publicar requiere la sesión del titular de Cloudflare. No hace falta cambiar el DNS de Aramis para el primer ensayo en un subdominio de Pages.

## Límites del bloque

- Correo y contraseña para equipo habilitado manualmente. OTP, SMTP, recuperación autónoma e ingreso habitual de clientes se conectan después.
- Cada comando guarda una transacción y serializa por espacio; adecuado para el equipo pequeño actual. La carga inicial lee el espacio completo del equipo. Paginación y sincronización incremental se evalúan si el volumen lo exige.
- El diario de reintentos es privado de la pestaña (sessionStorage), separado de la demo, sin tokens de acceso. Cerrar sesión lo borra; cerrar por completo una pestaña puede perder ese diario. Confirmar antes de salir.
- Drive y archivos remotos no están conectados. Los videos locales de la demo siguen en su navegador original y no se anuncian como compartidos.
- Las pruebas PGlite y de transporte simulado no sustituyen las pruebas de Auth, RLS y concurrencia alojadas. Registrar aparte la evidencia real en PROJECT_STATE.md y el handoff.
