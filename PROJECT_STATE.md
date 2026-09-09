# Estado del proyecto

## Checkpoint actual — 2026-09-09

Base anterior: `6da041d`. Este bloque conecta el trabajo interno a Supabase; no amplía el POV cliente ni integra Drive todavía.

### Implementado
- Ingreso del equipo con Supabase Auth por correo/contraseña, sesión persistente y cierre entre pestañas. Alta manual por administrador, sin autoasignación de permisos ni correos de invitación.
- API `/api/workspace` y `/api/commands`: valida sesión y usa el JWT del usuario para RPCs; workspace fijo en servidor, sin service_role. Clientes, plan, generación mensual, piezas, guion, notas, producción y archivo usan PostgreSQL.
- Migración privada de planes/producción, RLS, revisión esperada, bloqueo por workspace, rollback transaccional y recibos idempotentes por usuario/solicitud. `app_private.command_receipts` también tiene RLS sin policies de acceso directo.
- Formularios esperan confirmación remota y conservan borrador ante conflicto. UUID del guardado pendiente en sessionStorage permite reintento tras respuesta perdida/recarga. Actualización al foco y cada 15 segundos con pestaña visible.
- Medios, aprobaciones y enlaces remotos permanecen cerrados explícitamente. La demo y sus archivos locales siguen disponibles por separado, sin importación automática.
- Worker y Pages Functions usan el mismo handler para web/API en un solo origen. Sin despliegue todavía.

### Estado real de las cuentas
- Proyecto Supabase `mpgngcsmumlgrfrroupw`, São Paulo, creado por el usuario.
- Aplicadas desde SQL Editor las migraciones `202609060001_initial.sql` y `202609080001_shared_workspace.sql`. Verificado: 17 tablas públicas; recibos privados con RLS; workspace Aramis con Miguel como staff activo.
- Usuario de Auth creado por Miguel y asociado al equipo. Verificado correo confirmado, contraseña establecida y sin bloqueo. La contraseña no se leyó ni guardó en el repositorio.
- Lectura inicial de `aramis_workspace` en PostgreSQL alojado mediante rol/claim controlados: Aramis, cero clientes y un miembro. Después se completó el ingreso real por contraseña, verificación Auth y llamadas RPC desde el navegador.
- Prueba real: cliente **Prueba de conexión**, plan de septiembre de 2026 con dos posteos y un reel; base generada una sola vez, guion guardado en Posteo 01 y paso a producción/Diseño. Verificados los tres contenidos tras reiniciar servidores/recargar y el guion completo en otra pestaña. El cliente queda como ejemplo identificado; no se importaron datos de la demo. Sólo cuenta de Miguel: prueba con Eliana/otras identidades sigue pendiente.
- `.env.shared.local` y `.dev.vars` configurados localmente e ignorados por Git. Contienen URL, clave pública y workspace. No se copió ninguna clave privilegiada.
- Cloudflare CLI sin autenticar; cuenta del usuario existente. Google/Drive y Resend pendientes. No se enviaron mensajes ni se cambió DNS.

### Evidencia de este bloque
- 269 pruebas unitarias pasan, incluyendo 41 de SQL real en PGlite, 23 de API y el adaptador de sesiones/reintentos.
- 20 recorridos de navegador demo pasan; 5 recorridos compartidos con Auth/API simulados pasan. Estos últimos no se presentan como pruebas contra Supabase real.
- Compilación TypeScript/Vite, Worker dry-run y empaquetado de Pages Functions pasan.
- API local: health 200 y workspace sin sesión 401. La API pública de configuración de Auth en Supabase responde 200 y tiene acceso por correo habilitado.
- Prueba ZIP ajustada a comparación binaria nativa (mismo contenido exacto), evitando timeout al comparar un Buffer de más de 1 MB en carga paralela.
- La prueba real detectó que workerd rechaza `redirect: 'error'`. Corregido a `manual` con validación de estados en Auth/RPC y primitivas Google/Drive; no se siguen redirecciones con credenciales. El Worker local ya verifica sesiones válidas y rechaza tokens inválidos con 401. Login muestra errores más específicos.

### Retomar / probar
1. Leer `docs/SHARED_SETUP.md`. No reaplicar migraciones ni ejecutar fixtures/bootstrap de PGlite en el proyecto real.
2. `npm.cmd run worker:dev` (8787) y `npm.cmd run dev:shared` (5174). Primero verificar si los puertos ya están ocupados por esos servidores. `npm.cmd run dev` conserva demo en 5173.
3. Ingresar en http://127.0.0.1:5174 usando la contraseña de Auth → Create new user → User Password (distinta del dashboard y de la base). Ingreso y persistencia ya probados; no pedir claves por chat. Al cierre se dejó la aplicación abierta y ambos servidores locales funcionando.
4. Próximo bloque: autorizar Cloudflare para publicar un entorno de prueba; luego habilitar a Eliana y conectar Drive. OTP/correo y calendario/aprobaciones reales de clientes van en sus bloques. Verificar dos usuarios distintos y concurrencia/aislamiento alojados antes del piloto.

Pendientes de producto ya anotados: inicio predeterminado de Eliana en producción y regla de tomas completas para reels. No implementarlos por inferencia en este bloque.

## Historial de checkpoints anteriores

Fecha: 2026-09-07. Checkpoint previo: 0700e7f.

## Entrega actual — lista para prueba interna
- Clientes: alta y datos/plan mensual editables; generar base una vez por mes, completar faltantes, editar filas, agregar extras sin título, quitar archivando. Sin distribución automática de fechas ni drag and drop.
- Producción: pendientes globales de producción (también futuros), filtros cliente y Marketing/Diseño, etapas lista/grabación/edición. Preparación separada; guion privado por pieza. El mes del plan puede editarse en detalle, independiente de fecha prevista.
- Calendario interno: altura fija, dos tarjetas por día y +N abre todas. Sin fecha sólo del mes seleccionado; semana no trae bases sin fecha de meses futuros.
- Material equipo: archivos en IndexedDB, hasta 100 MB por archivo, preview imagen/video y descarga persistente. Pedidos al cliente quedan plegados como excepción. Nada en Drive; sólo el mismo navegador. Exportación JSON no incluye blobs; limpiar datos del sitio borra todos los archivos, reset de demo sólo vuelve a metadata inicial.
- Datos antiguos se leen sin reset. Nombres de fixtures nuevas Miguel/Eliana/Eric; IDs previos conservados. Sigue sin usuarios reales ni sesión compartida.
- Vista del cliente sin rediseño; nuevos datos internos quedan excluidos de su proyección.

## Evidencia
- npm test: 186 pruebas / 6 archivos pasan (incluye base mensual y compatibilidad de datos antiguos).
- npm run build: pasa; compilación TypeScript incluida.
- npx playwright test --reporter=list: 17 recorridos pasan, escritorio/móvil, densidad calendario, ediciones concurrentes y video generado de prueba reproducible/descargable después de recargar.
- QA visual en work/qa (ignorado en Git), escritorio 1440 y móvil 390. Worker no modificado; dry-run previo, ninguna prueba de servicios reales ni despliegue.

## Cómo probar con Eliana
npm run dev y abrir http://127.0.0.1:5173/. Clientes → Trabajar mes → Editar datos y plan → Generar base → editar pieza/guion → Listo para producción. Eliana abre Producción, filtra Diseño y revisa Material. Usar archivos de prueba pequeños. Todo en el mismo navegador/equipo.

## Pendiente
Esperar devolución de Miguel y Eliana. Sin ampliar POV cliente ahora. Supabase/Google/Cloudflare/correo siguen pendientes; Worker cerrado 503/501. Nuevos campos de cliente/plan/producción/archivos todavía necesitan migración SQL privada y adaptadores remotos; agregar claves no habilita la V1. Leer handoffs/C05-monthly-production.md y docs/SETUP antes de integrar servicios.

## Actualización — logos, ZIP y pestaña de texto
Checkpoint previo: 134b8cd. Incorporadas referencias visuales Aura/Beecomex/Musas desde Aramis-Web/public/img/clientes, copias originales en public/brand/clients. ClientAvatar en tareas, clientes, detalle y calendario interno (en móvil calendario prioriza texto).
Material del equipo añade Descargar todo (ZIP); no altera preview. Verifica todos los archivos, no parcial; nombres duplicados se numeran, límite ZIP 2 GB. No dependencias añadidas.
Detalles → Expandir guion y texto abre /text/:pieceId con guion, copy y notas, de lectura y actualizable desde otra pestaña. Se exige guardar el borrador antes de abrir. Pieza archivada/no existente no expone texto. Sólo demo local, no link para clientes reales.
Verificación de este cierre: npm test 190 pruebas / 7 archivos; 20 E2E; npm run build pasa. QA visual escritorio en work/qa. Sin reset de datos, cuentas, Drive ni publicación.
Próximo paso: usuario prueba; pendientes de UX de Eliana y regla de completitud de reels sólo anotados, no implementados. Ver handoffs/C05-reading-zip-logos.md.
