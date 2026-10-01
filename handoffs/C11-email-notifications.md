# C11 — avisos internos por correo

Cierre: 2026-10-01. N1–N5 integrados, publicados y probados contra Supabase, Cloudflare y Resend. Alcance autorizado en esta conversación: configurar remitente, enviar prueba a Miguel y activar el resumen diario para el equipo si pasa. No se envió correo de prueba a Eric/Eliana.

## Comportamiento

- Eliana (Diseño): nueva pieza lista para producir o devolución desde revisión, con motivo explícito.
- Miguel/Eric (Marketing): nueva entrega para revisar. Sin dependencia de dueño de tarea ni vista Gestión/Diseño.
- Default diario 09:00 Argentina, editable. Opciones inmediato (al guardar o próximo Cron), cada hora, seis horas (00/06/12/18), diario y pausa.
- Registro transaccional: triggers diferidos observan estado final de pieza/producción/pedidos; no envían por una edición de texto, material incompleto o grabación. Sin backlog histórico al instalar o elegir área.
- Sólo novedades aún accionables; agrupadas por persona, una novedad vigente por pieza. Aprobadas, archivadas o trasladadas de etapa dejan de avisar. Un pendiente vencido no vuelve a avisar diariamente por sí solo.
- Mail identifica cliente/título/formato/fecha y motivo explícito de devolución. Sin notas internas ni medios. Enlaces a pieza/configuración requieren login habitual y membresía.

## Componentes y permisos

`contracts/notifications.ts`, `server/notifications.ts`, `server/notification-worker.ts`, `src/lib/notifications.ts`, `src/internal/NotificationSettings.tsx` y CSS. Pages ofrece preferencias y activa el despachador después de un comando confirmado para avisos inmediatos. Worker dedicado programado cada minuto; sin handler público ni workers.dev. Ambos usan leases de base de datos.

Migración **202609300002_notifications.sql aplicada una vez** en Supabase; NO repetir. Tablas privadas con RLS y privilegios revocados. Preferencias propias mediante RPC de usuario autenticado, revisión esperada e idempotencia. Dispatch sólo service_role; claves fuera del bundle/frontend. Journal independiente de preferencias en sessionStorage conserva exactamente el requestID/payload frente a respuesta perdida. Demo explícita sin envío.

Cuerpo de cada envío congelado en base antes de llamar a Resend. Misma clave `aramis-notification/<batch-id>` en reintentos. Lease 3 minutos; hasta cinco batches por ejecución y 200 piezas por batch. Reintento gradual, máximo siete intentos; ventana conservadora de 23 horas antes de retener para revisión. Respuesta desconocida no produce una clave nueva.

Se corrigió un fallo real de workerd: `redirect:error` provocaba TypeError pese a funcionar en Node. Fetches de notificaciones usan `redirect:manual` y rechazan HTTP 3xx. Ningún body del proveedor o secreto en logs.

## Configuración real

- App y preferencias: https://gestor-aramis.pages.dev/?settings=notifications. Último Pages **bb87f26d.gestor-aramis.pages.dev** (alias actualizado).
- Worker **gestor-aramis-notifications**, versión **350529dd-8dbd-4bac-8ed1-1136e46caead**, Cron `* * * * *`, envío activo. Sólo secretos necesarios: Supabase servidor y Resend.
- Supabase `mpgngcsmumlgrfrroupw`, workspace `cc7761e3-36af-4558-9aa9-116a165be3e3`.
- Remitente **Aramis <gestor@avisos.aramis.agency>**. Resend dominio verificado, región São Paulo; clave restringida Sending/ese dominio, id público `e59cd44d-a04e-435a-a649-9a0cc7ac7ed5`.
- Namecheap: TXT `resend._domainkey.avisos`, CNAME `rsend.avisos` → `rsend-sae1.forge.rmta.net`, CNAME `send.avisos` → `send.forge.rmta.net`. TTL Auto; resolución DNS confirmada. Sin tocar registros web, Zoho ni MX/SPF de raíz.
- Áreas del equipo inicializadas mediante `supabase/operator/notification_team.sql` después de comprobar la prueba real: eliana.victoriacarretero@gmail.com → design; eric.esquivel180@gmail.com y miguel_carretero@outlook.com → marketing. Todos enabled/daily/09:00. Script sólo inicializa unassigned; preserva pausas/frecuencias elegidas por usuarios.
- `.dev.vars` ignorado conserva credenciales; `work/notification-deploy/wrangler.json` y `work/pages-deploy/wrangler.json` sólo variables públicas. `NOTIFICATION_EMAIL_ENABLED=true` en ambos despliegues. Archivos de trabajo y credenciales no incluidos en Git.

## Evidencia

1. Suite final **525 unitarias / 23 archivos**. Incluye SQL con PGlite: acceso, triggers de estado final, frecuencia/horarios, idempotencia, concurrencia, rollback, cancelación, leases y payload congelado; servidor simulado: autenticación, límites, render seguro, redirecciones y errores del proveedor.
2. **27 recorridos compartidos**. Nuevos casos: pérdida de respuesta al guardar preferencias, recarga móvil 390 px y replay del mismo requestID; enlace de correo que exige login antes de abrir detalle. Capturas escritorio/móvil sin desborde.
3. `supabase/tests/notifications_hosted.sql` ejecutado en Supabase real con resultado Success y rollback completo. No persistió material de esa prueba.
4. Prueba separada de entrega real mediante comandos de negocio (`supabase/operator/notification_probe_setup.sql`): dos posts sintéticos de producción en cliente Prueba controlada de avisos 2026-10-01; sólo Miguel Design/Immediate temporalmente. Un Cron real creó un solo batch **b8e3b42f-b53a-4a90-88f1-f029b3afc843**, `sent`, 2 piezas, 1 intento, 2026-10-01 04:03:55.540453 UTC (01:03 Argentina). Resend **01a0f5a2-13e7-755f-b765-9d54f2cfcb00**, subject “Aramis · 2 piezas pendientes de producción”: eventos sent y delivered comprobados en su interfaz. Log Cron outcome ok, sin errores después del arreglo de redirecciones. No se afirma lectura humana ni Inbox frente a Spam.
5. Enlace real abrió la pieza correcta con sesión de Miguel. `notification_probe_cleanup.sql` archivó los dos posts y cliente, devolvió a Miguel Marketing/Daily/09:00; conservación de historial, sin borrado de datos ni archivos Drive. Consulta de comprobación tras el corte de créditos confirmó ambos archivados. No repetir setup/cleanup sin revisar primero; no son scripts generales de mantenimiento.
6. Preferencias reales de los tres leídas en SQL. En app de Miguel: “Guardar avisos” → “Preferencias guardadas.”; recarga conserva Marketing/Daily/09:00. Publicación final muestra envío activo y último correo enviado. TypeScript/Vite y Worker compilados; publicación y smoke remoto pasan (incluidos preferencias anónimas 401 y origen ajeno 403).

Capturas locales ignoradas: `work/notification-email-delivered.jpg`, `work/notification-sent-database.jpg`, `work/notification-team-enabled.jpg`, `work/notifications-enabled.jpg`, `work/notifications-desktop.png`, `work/notifications-mobile.png`. Evidencia del resultado publicada en el chat, sin secretos.

## Operación y reanudación

1. Leer PROJECT_STATE y comprobar git. No repetir migración ni OAuth de Google por este bloque.
2. Configuración individual desde Configuración → Avisos por correo. El horario es Argentina; si no hay novedades no envía mail. Los eventos posteriores al horario diario esperan al siguiente resumen. Elegir un área no notifica retroactivamente tareas existentes.
3. Comprobación sin writes: `supabase/operator/notification_status.sql` (en SQL Editor, ejecutar cada SELECT para ver su resultado), `notification_probe_status.sql` para identificar la prueba aislada; Cloudflare invocaciones del Worker y Resend lista/detalle de emails. Estado `sent` de base significa aceptación de Resend; su evento delivered es comprobación separada.
4. Reproducir local: `npm.cmd test`, `npm.cmd run test:e2e:shared`, `npm.cmd run pages:prepare`, `npm.cmd run notifications:check`. Publicar sólo desde repo con configuración privada disponible: `npm.cmd run pages:deploy`, `npm.cmd run notifications:deploy`. El script prepare genera allowlist pública y verifica secretos; plantilla wrangler.notifications.toml permanece apagada por defecto. Nunca poner claves en argumentos o archivos versionados.
5. Incidencia local al cierre: Wrangler completó la compilación pero dejó su proceso esperando; se interrumpió el proceso concreto ya compilado y se completó Pages. El despliegue recompiló/publicó con exit 0; smoke y verificación autenticada posteriores pasan. Un intento anterior detenido salió con error; no se considera una compilación aprobada. No hubo cambio de dependencia o programa de producción para evitar esa espera. Si reaparece, revisar la herramienta local antes de repetir publicaciones en paralelo.
6. Si un batch está `needs_review`, ese destinatario queda retenido y lo ve en Configuración. Inspeccionar batch, provider_id y eventos Resend antes de resolver. Consultar Resend por id del envío o logs dentro de su ventana; no reenviar con otro batch/idempotency-key hasta aclarar si fue aceptado. Si se confirma aceptación, reconciliar estado/cola/last_sent_at en una transacción revisada; si se confirma rechazo sin envío, corregir causa y decidir reponer novedades aún vigentes. No hay botón de reconciliación administrativa en esta V1.
7. Para detener todos los envíos: publicar `NOTIFICATION_EMAIL_ENABLED=false` en Pages y Worker; no sólo en uno. Pausar un usuario desde la app no afecta a los demás. No desinstalar la migración para apagar correos.

## Límites y próximo paso

No webhooks de rebotes/quejas ni monitoreo de Inbox/Spam; Resend guarda resultados del proveedor. No prueba de correo con identidades Eric/Eliana ni entrega representativa final de ellos. No notifica automáticamente toda edición de un archivo externo de Drive; rigen los cambios de negocio del gestor. Sin SMTP de Auth, links remotos cliente, WhatsApp automático o métricas.

Observar el próximo resumen con novedades reales del equipo y recoger feedback. Luego desarrollar vistas de clientes, conservando privacidad/versión exacta. Google sigue Testing; su renovación semanal es un pendiente independiente y no detiene los correos. Ninguna cuenta pendiente bloquea la activación de avisos internos.
