# Estado del proyecto

## Restablecimiento de contraseña de Miguel — en curso, 2026-10-14

Miguel aclaró que había vuelto a probar el enlace viejo y después informó que no recuerda su contraseña. La apertura del dominio nuevo está comprobada; su mensaje anterior de poder entrar no se usa como evidencia de autenticación. Solicitó restablecer su misma cuenta. Supabase muestra el usuario existente; la UI sólo ofrece enviar recuperación y el gestor aún no tiene pantalla de recuperación. Se preparó un formulario local de un uso en `work/reset-miguel-password.mjs` (ignorado), restringido al ID/correo de Miguel verificados y ligado sólo a 127.0.0.1, con vencimiento de 15 minutos. El titular debe escribir, confirmar y enviar su nueva contraseña personalmente. No la imprime, refleja ni guarda en archivos; actualiza sólo password mediante la API administrativa existente.

Estado al preparar el handoff: formulario abierto, **contraseña todavía no cambiada ni ingreso confirmado**. Se verificaron GET privado, no-store/CSP, rechazo de origen ajeno, ruta ajena y contraseña ausente, sin enviar contraseña ni modificar cuentas. Esperar confirmación del titular y resultado seguro del proceso antes de marcar cerrado. Sin cambio de código publicado, esquema, cuenta, correo, membresía o permisos. Detalle: `handoffs/C03-password-reset.md`.

## Acceso recuperado con dominio propio — 2026-10-14

Dirección del equipo **https://gestor.aramis.agency/**. Miguel confirmó que pudo abrir la dirección nueva; el ingreso autenticado está pendiente de recuperar su contraseña, como aclara la nota superior. Fallo reproducido en el origen anterior: ERR_NAME_NOT_RESOLVED / NXDOMAIN de la red para pages.dev, mientras Google/Cloudflare DNS resolvían y el servidor respondía HTTP 200 con TLS válido. Limpiar caché no arregló el origen anterior. No se cambió el DNS de Windows. Miguel autorizó el subdominio propio; Cloudflare lo tiene activo con certificado y Namecheap usa ALIAS `gestor` → `gestor-aramis.pages.dev`, TTL cinco minutos. CNAME simple se probó primero y aún fallaba al seguir pages.dev; ALIAS entrega A/AAAA desde el proveedor. Web, MX, Resend y nameservers conservados.

Publicado **dabfa01b.gestor-aramis.pages.dev**, dominio propio activo. Pages y Worker de avisos usan `NOTIFICATION_APP_URL=https://gestor.aramis.agency`; Worker versión **f302675e-f71c-4104-abd1-413a7cbc00c0**, mismo cron y secretos. Compilación TypeScript/Vite/Worker, validación de secretos del paquete y smoke remoto normal aprobados. Durante propagación el smoke inicial falló por DNS; una comprobación aislada con resolución desde el router pasó, y después pasó el comando normal sin overrides. UI anónima observada en IAB; ingreso autenticado informado por Miguel, sin guardados de prueba ni contraseñas leídas. Drive existente comprobado: refresh exitoso, carpeta raíz legible HTTP 200 y scope conservado.

**Pendiente concreto:** registrar en Google el retorno `https://gestor.aramis.agency/api/google/callback`, instalarlo como GOOGLE_REDIRECT_URI en Pages y publicar. El panel Google Auth Platform arroja Failed to load al abrir el cliente; la lista antigua de Credenciales carga pero redirige al formulario que falla. Miguel tiene una pregunta pendiente para comprobarlo desde su navegador. La conexión actual de Drive funciona; renovar desde la dirección nueva sigue pendiente porque el servidor rechaza un retorno de otro origen. No afirmar nueva renovación completada ni cambiar ese secreto antes de registrar el retorno. No repetir SQL, OAuth ni claves. Handoff reproducible: `handoffs/C10-custom-domain.md`.

## Flujo simple y Deshacer aprobación — 2026-10-13

Publicado en **62d0e851.gestor-aramis.pages.dev** y **https://gestor-aramis.pages.dev/**. Preparación/grabación queda en Planificación. Pasar a producción manda directamente a Diseño; se elimina el bloque Esperando grabación. Las acciones están arriba del detalle, junto al estado, e incluyen Volver a planificación. Deshacer aprobación, confirmado por Miguel, vuelve a Revisión con el mismo ID, versión, Caption y archivos; queda auditado y no pide un motivo de cambios ficticio. Pedir cambios sigue requiriendo explicación y devolviendo a Diseño.

Migración **202610130001_simple_production_undo_approval.sql aplicada con éxito una vez**. Dos piezas activas de grabación/Marketing pasaron a Planificación con revisión incrementada e historial; archivos, aprobaciones y archivados conservados. Postflight: función nueva presente, helper privado sin ejecución directa para authenticated, cero preparaciones antiguas restantes y dos actividades de migración. No repetir la migración. Demo conserva datos anteriores mediante migración local de una sola vez; comandos recording antiguos se interpretan como Planificación en ambos dominios.

Validación: suite unitaria completa de 532 casos y luego los 20 de API con un caso nuevo de migración local (533 casos distintos cubiertos); 28 recorridos demo y 13 compartidos focalizados aprobados entre suites y repeticiones justificadas. TypeScript/Vite/Worker, QA móvil y smoke remoto aprobados. Prueba alojada bajo rol authenticated e identidad staff, con cliente/pieza sintéticos dentro de rollback: producción directa, vuelta a planificación, corrección exacta, reintento idempotente, conflicto y auditoría singular, evento de revisión único; todo descartado, sin archivos ni correo enviados. En la UI real se observaron 11 piezas para Diseño, cinco en Planificación y el botón Pasar a producción sobre una pieza migrada. No se deshicieron aprobaciones reales. Handoff: `handoffs/C05-simple-production-undo-approval.md`. Para probar, recargar y abrir una pieza; las acciones están antes de las pestañas. Próxima fase de clientes sigue pendiente.

## Nuevo contenido sin selector de área — 2026-10-13

Publicado en **57cc81f6.gestor-aramis.pages.dev** y **https://gestor-aramis.pages.dev/**. Se retira Marketing/Diseño del formulario Nuevo contenido y el comando crea explícitamente en Marketing, con el estado inicial Planificación existente. Alta desde Clientes ya usaba Marketing. Decisión D28; handoff `handoffs/C05-new-piece-marketing.md`.

Validación: recorrido demo existente de creación/material/revisión/aprobación aprobado; TypeScript/Vite/Worker y smoke remoto aprobados. Formulario real comprobado con la sesión existente: título, cliente, formato y fecha, sin selector Área. Se cerró sin crear registros y se restauró la preferencia Diseño usada antes de comprobarlo. No se agregan tests nuevos para este ajuste de formulario. Para verlo, recargar → Gestión → Nuevo contenido.

## Historial tolera clientes retirados — 2026-10-13

Publicado en **9a119ba7.gestor-aramis.pages.dev** y **https://gestor-aramis.pages.dev/**. Se reprodujo con la sesión real el fallo de Archivados: la RPC omite clientes con archived_at pero conserva piezas antiguas de esos clientes; la pantalla asumía que siempre existía su nombre. Historial ahora relaciona cada pieza con el catálogo de clientes disponible antes de buscar, contar y dibujar filas. Los registros de clientes retirados se omiten de Completados/Archivados; los de clientes vigentes siguen consultables y recuperables. No se borran datos ni se modifica SQL, permisos, Drive o avisos.

Validación: nuevo recorrido compartido reprodujo el mismo TypeError antes del cambio y pasó después; cubre vacío, clientes ausentes, piezas vigentes, búsqueda y ausencia de writes. Recuperación compartida existente y cinco recorridos demo de pendientes/historial aprobados. TypeScript/Vite/Worker y smoke remoto aprobados. Con la sesión real tras publicar se abrieron Completados (7 piezas) y Archivados (15 piezas), sin errores nuevos de consola ni cambios de registros reales. Handoff: `handoffs/C05-history-client-filter.md`. Para comprobarlo, recargar y entrar a Gestión → Historial → Archivados. Siguiente fase de clientes sigue pendiente de autorización.

## Etiqueta Caption — 2026-10-13

Publicado en **76331a59.gestor-aramis.pages.dev** y **https://gestor-aramis.pages.dev/**. Reel, Post y Carrusel muestran **Caption** en el editor de Detalles, la lectura ampliada y la consulta de piezas archivadas. Historias conserva su único campo Contenido de la historia. Sólo cambia texto de interfaz: mismos datos, guardado, permisos y versiones.

Validación: compilación TypeScript/Vite y empaquetado Pages/Worker; cuatro recorridos demo existentes y un recorrido compartido de entrega/revisión/aprobación con API simulada; smoke remoto del alias aprobado, sin operaciones autenticadas sobre datos reales. No se agregan pruebas nuevas ni se repiten suites ajenas a la etiqueta. Handoff: `handoffs/C05-caption-label.md`. Para comprobarlo, recargar el gestor y abrir una pieza → Detalles o Abrir texto completo. Siguiente fase de clientes conversada, aún sin implementación nueva ni habilitación remota.

## V1 interna cerrada y alcance del README aclarado — 2026-10-01

Miguel confirma que el equipo usa el gestor y considera terminada la V1 interna desde antes de los correos. Se registra ese corte: planificación, producción, material y revisión forman la versión interna operativa; avisos por mail son una mejora posterior. Las vistas/enlaces de cliente son la próxima fase, aún sin habilitar en producción. El README en inglés refleja ese estado y distingue login de Supabase de la configuración OAuth de Google por despliegue. Se retiró la afirmación general de Testing/caducidad; el estado real de esa conexión se conserva en las notas operativas anteriores. Capturas conservadas, con datos ficticios y logos de muestra existentes. Sólo documentación: enlaces y estructura Markdown comprobados, sin cambios de aplicación ni servicios. Handoff actualizado: `handoffs/C00-portfolio-readme.md`. El desarrollo de nuevas funciones sigue detenido hasta el próximo pedido.

## README de portfolio — 2026-10-01

README reescrito en inglés para describir la V1 interna que usa el equipo: problema operativo, flujo, funciones reales, decisiones, arquitectura, demo sin cuentas, configuración compartida, verificación y próximos bloques. Dos capturas nuevas en `docs/images/` tomadas de una demo local aislada con fixtures ficticias, no de clientes o material de producción. Se distingue la aplicación alojada con login de las vistas de cliente aún locales y la evidencia histórica de pruebas de una ejecución nueva. Links, comandos, archivos de imágenes y estructura Markdown comprobados; sin cambios de código, dependencias ni despliegue, por lo que no se repitieron suites funcionales. Handoff: `handoffs/C00-portfolio-readme.md`. Desarrollo de producto detenido por pedido de Miguel; siguiente fase sigue pendiente de su arranque.

## Avisos internos por correo activos — 2026-10-01

N1–N5 cerrados y publicados en **bb87f26d.gestor-aramis.pages.dev** y **https://gestor-aramis.pages.dev/**. Migración `202609300002_notifications.sql` aplicada una vez; no repetir. Worker `gestor-aramis-notifications` activo cada minuto, versión **350529dd-8dbd-4bac-8ed1-1136e46caead**, sin endpoint público. Pages y Worker tienen el envío habilitado y claves privadas sólo como secretos/configuración ignorada.

Remitente **Aramis <gestor@avisos.aramis.agency>**, dominio verificado en Resend (São Paulo). Tres registros nuevos en Namecheap bajo avisos/rsend/send; web y correo Zoho conservados. Resend usa una clave restringida a envío desde ese dominio. Configuración real del equipo: Eliana → Diseño; Eric y Miguel → Marketing; todos habilitados, diario **09:00 Argentina**. Inicialización explícita sin avisar por el trabajo anterior. Cada persona puede cambiar área, frecuencia, horario o pausar desde Configuración → Avisos por correo; la vista Gestión/Diseño sigue siendo independiente.

Prueba real: dos posts sintéticos de producción generaron **un correo agrupado a Miguel**, batch `b8e3b42f-b53a-4a90-88f1-f029b3afc843`, un intento, Resend `01a0f5a2-13e7-755f-b765-9d54f2cfcb00`, **sent + delivered** a las 01:03 Argentina del 1/10. Enlace abrió la pieza correcta con sesión normal. No se afirma lectura humana ni llegada a una carpeta específica de Outlook. Cliente y dos piezas de prueba archivados, sin borrado ni cambios de archivos Drive. Limpieza y preferencias verificadas tras la interrupción de créditos. Guardado real de las preferencias de Miguel confirmado y persistente al recargar; banner de envío inactivo ausente en publicación final.

Validación: **525 unitarias / 23 archivos**, **27 recorridos compartidos** (incluyen reintento idempotente de preferencias y enlace de mail tras login), SQL real alojado dentro de rollback aprobado, revisión escritorio/390 px, TypeScript/Vite/Worker y smoke remoto del alias aprobados. La compilación local final de Wrangler quedó esperando después de producir el bundle; se detuvo ese proceso concreto y se completó el despliegue, que recompiló y publicó con éxito. No se modificaron dependencias para ese cierre. `redirect:manual` evita el fallo real de `redirect:error` en workerd y rechaza respuestas 3xx.

Handoff y procedimiento: **handoffs/C11-email-notifications.md**. Próximo: observar los resúmenes con novedades reales del equipo; luego vistas remotas de clientes. No pendiente ninguna cuenta para activar este bloque. Google continúa External/Testing, separado del correo: renovación comprobada el 30/9 y recordatorio de revisión para el 7/10. Los enlaces/OTP/clientes reales y métricas siguen en bloques posteriores.

## Conexión de Drive comprobada — 2026-09-30

Miguel informó haber pulsado la renovación. Comprobación real de la credencial persistida: intercambio de refresh token exitoso y lectura de metadatos de la carpeta raíz con HTTP 200; permiso `drive` conservado. Token de acceso obtenido sólo en memoria, sin modificar la conexión persistida ni archivos. Esto confirma conexión operativa; no acredita por sí solo la hora del último consentimiento ni reinicia el plazo de Testing. Evidencia y procedimiento en `handoffs/C04-drive-renewal-check.md`.

## Encabezado compacto de Pendientes — 2026-09-30

Publicado en **8098703c.gestor-aramis.pages.dev** y alias habitual. Título, selector Mostrar y Nuevo contenido comparten fila en escritorio; en anchos reducidos, los controles quedan juntos debajo del título. Se elimina la fila separada del selector y se reduce el espacio hasta las categorías. Otros encabezados conservan su estructura. Compilación compartida/Pages y smoke remoto aprobados; comprobación local en 1440/1024/390/320 px sin desborde, cambio de alcance y apertura del formulario funcionando. Sólo interfaz, sin migraciones ni modificaciones de datos reales. Ver `handoffs/C05-pending-header.md`.

## Pendientes, Aprobados e Historial — 2026-09-30

P1–P5 implementados, verificados y publicados en **3d859d4a.gestor-aramis.pages.dev** y alias **https://gestor-aramis.pages.dev/**. Gestión abre **Pendientes**, con todos los meses, fecha ascendente y alcance Esta semana opcional (lunes–domingo, conserva vencidos y sin fecha). Atención separado primero, luego Planificación/Para producción/Revisión/Aprobados. Conteos respetan cliente, área y búsqueda. Aprobados al fondo hasta su fecha inclusive; después se consultan en Historial sin modificar datos. Aprobadas sin fecha siguen visibles, trabajo vencido sin aprobar no desaparece. Día de Argentina actualizado al cruzar medianoche o recuperar foco.

Diseño: Producción y Calendario directos; selector Para producción/En espera/Revisión/Aprobados, con Para producción como entrada al regresar. Se conservan tarjetas, devolución destacada y accesos. Gestión no tiene otro destino Producción. Aprobar es el cierre normal; se retiraron botones programar/publicar, manteniendo legibilidad de estados antiguos.

Historial interno: Completados/Archivados, cliente, mes del plan y búsqueda. Las completadas siguen en calendario/cliente y pueden reprogramarse. Archivadas ofrecen textos, decisiones, material, entregas exactas y originales de archivos finales sólo en consulta. Recuperar a planificación requiere confirmación; conserva información, invalida aprobaciones antiguas y no reabre enlaces revocados. Archivar no elimina archivos de Drive.

Migración `202609300001_history_restore.sql` aplicada una vez en Supabase, éxito confirmado. Prueba real de RPC bajo rol authenticated y membresía de Miguel, con cliente/pieza sintéticos dentro de transacción: recuperación, conservación de textos, revisión esperada e idempotencia aprobadas; rollback completo, sin registros de prueba persistidos ni modificaciones de piezas reales. No se tocaron permisos Google ni archivos del proveedor.

Validación local: 487 unitarias, 28 recorridos demo y 25 compartidos cubiertos entre suites y repeticiones focalizadas luego de actualizar expectativas antiguas de navegación/publicación. Nuevo recorrido cubre medianoche Argentina, archivos archivados sin writes y reintento de recuperación sin duplicar. Revisión visual de escritorio/390 px y compilación Pages/Worker aprobadas. Smoke del alias publicado pasó (login, texto completo, API configurada y rechazos anónimos/origen ajeno, incluidos endpoints de Drive). La sesión real mostró los 13 contenidos de Gestión por fecha, incluidos futuros y sin fecha, y las dos piezas listas de Diseño con Calendario directo y selector de consulta. Sin modificaciones de piezas reales durante esa revisión. Ver `handoffs/C05-pending-history.md` para evidencia y límites. Bloque cerrado; siguiente paso: feedback del equipo.

## Cambio rápido de formato — 2026-09-28

Publicado en **2a82abc2.gestor-aramis.pages.dev** y alias habitual. Al abrir una pieza, la etiqueta de formato junto al cliente es ahora un selector de Reel, Post, Carrusel o Historia. Guardar otra opción actualiza la pieza con la revisión vigente, sin cambiar título, material, textos ni etapa. Si hay cambios sin guardar en Detalles, el selector espera a que se guarden; el selector anterior dentro de Detalles sigue disponible. No hubo migración ni cambios en piezas reales durante la prueba. Ver `handoffs/C05-format-quick-edit.md`.

Validación: cambio Reel → Post → Historia persistido tras recargar en demo, con editor de Historia correcto; comprobación visual de escritorio y móvil; 467 unitarias, 24 recorridos compartidos, recorrido principal demo, build compartido y smoke remoto aprobados. El bundle publicado contiene el selector; no se hizo un guardado autenticado de formato sobre una pieza real.

## Acceso al texto más visible — 2026-09-23

Publicado en **7823478e.gestor-aramis.pages.dev** y alias habitual. “Abrir texto completo” ahora está arriba de las pestañas del detalle, visible desde Detalles, Material y Entrega. Tiene un botón bordó de alto contraste; en móvil ocupa el ancho de la tarjeta. Mantiene el bloqueo ante cambios de texto sin guardar. Verificado visualmente en 1280 y 390 px, con 3 recorridos demo, 7 compartidos, build compartido y smoke remoto. No se modificaron piezas ni datos de Drive. Ver `handoffs/C05-story-content.md`.

## Texto de Historias y acceso de lectura — 2026-09-23

Publicado en **dcccc00c.gestor-aramis.pages.dev** y alias habitual. El detalle de una Historia ofrece un solo campo “Contenido de la historia” para escribir los slides; se guarda en el texto que usa Entrega/Revisión. Las indicaciones privadas de Historias anteriores se conservan y se muestran separadas, sólo al equipo, sin copiarlas automáticamente al texto revisable. Reel, Post y Carrusel mantienen sus campos anteriores. El acceso “Abrir texto completo” ahora está en una tarjeta visible junto al editor y conserva la protección contra cambios sin guardar. No hubo migración ni modificación de piezas reales.

Validación: 467 pruebas unitarias, 3 recorridos demo de lectura (incluido uno nuevo de Historia), 7 recorridos de interfaz compartida, build compartido y smoke del alias publicado. El smoke remoto cubre login/ruta de texto y rechazos anónimos; no se realizaron operaciones autenticadas en el sitio real. Ver `handoffs/C05-story-content.md`.

## Producción simplificada y alta sin responsable visible — 2026-09-23

Publicado en **f360d5f1.gestor-aramis.pages.dev** y alias habitual. Diseño muestra una sola lista “Para producción” para piezas antiguas `ready` y `editing`, sin “Por empezar”, “En curso” ni “Empezar a producir”. Gestión usa el mismo grupo y conserva “Esperando grabación”. El detalle permite pasar entre “Para producción” y “Esperando grabación”; las devoluciones de Entrega siguen regresando a la primera. Nuevo contenido asigna internamente el creador como responsable sin pedirlo en el formulario. No se migran ni borran datos de piezas existentes. Smoke remoto pasó; en la sesión real de Miguel se comprobaron los cinco pendientes de Diseño con la misma etiqueta, el formulario sin Responsable y la preferencia de Diseño restaurada. Ver handoffs/C05-production-simplified.md.

## Identificación visual del formato — 2026-09-23

Etiquetas con fondo suave y borde: Reel azul, Post/Carrusel bordó e Historia amarillo. Aplicadas en Producción, listado de Gestión, encabezado del detalle y listado ampliado del día del calendario. Sólo presentación, sin cambiar estados, formularios ni datos. Los otros comentarios de UX siguen pendientes. Evidencia y cierre en handoffs/C05-format-badges.md.

## Entrega y devolución a Producción — cierre 2026-09-23

Publicado en **bc8f6c24.gestor-aramis.pages.dev** y https://gestor-aramis.pages.dev. En el espacio compartido, **Entrega** permite subir archivos terminados, elegirlos y ordenarlos, y enviar explícitamente a **Revisión**. Material conserva las tomas originales. Aprobar habilita programar/publicar; pedir cambios exige motivo y devuelve la pieza a Diseño / Lista para producir, con devolución destacada en tarjeta y detalle. El origen Equipo/Cliente se registra manualmente por un integrante; no envía mensajes ni habilita el portal cliente.

Cada versión conserva texto, orden y referencias a revisiones binarias fijadas en Drive. La descarga y reproducción nativa de entregas usan la revisión exacta. Google Viewer se mantiene para Material; en Entrega los MOV se descargan para revisar esa versión. Los archivos terminados se guardan en la subcarpeta Entregas; no se importan automáticamente archivos añadidos directamente a esa subcarpeta. No hay papelera de entregas en este bloque, ni siquiera para borradores, para preservar referencias.

Migración **202609220001_deliveries.sql aplicada una vez** en Supabase alojado, éxito confirmado. No repetirla ni renovar OAuth/configuración por este cambio. Tabla privada sin acceso directo de clientes; comandos conservan membresía, bloqueo de workspace, revisión esperada e idempotencia. El snapshot público excluye entregas/notas internas.

Validación: suite de 466 unitarias aprobada; después se añadió una prueba de carpetas y pasaron 72 pruebas focalizadas Drive. Los 24 recorridos compartidos quedaron cubiertos entre ejecución general y repetición de los 8 afectados (una expectativa antigua de Revisión se actualizó a Entrega); recorrido de entrega repetido en código final aprobado. 22 recorridos demo, build TypeScript/Vite/Pages y smoke remoto final pasan. Prueba real con Miguel: v1, devolución de cliente, texto corregido v2, aprobación y Programado; ambas versiones conservadas, imágenes cargadas y Material separado. Revisión Google keepForever y descarga de 67 bytes idéntica al archivo sintético confirmadas. Pieza técnica archivada al finalizar; los cinco pendientes reales de Diseño permanecen.

Handoff reproducible: **handoffs/C05-delivery-review.md**. Próximo: feedback de Miguel/Eliana con una entrega real representativa. No afirmar prueba con identidad de Eliana, videos finales grandes ni móvil físico por esta entrega. OAuth External/Testing y portal cliente siguen como pendientes separados.

## Visor de Google integrado — 2026-09-17

Publicado en 8b93da56.gestor-aramis.pages.dev y alias habitual. Ver con Google en MOV/M4V y fallback de video nativo abre un modal único; conserva miniaturas/descargas, reintento y enlace directo a Google. GET /assets/:id/viewer verifica usuario, membresía, asset y proveedor; devuelve sólo enlace de visor sin OAuth ni modificar compartición. Sin servicios pagos, conversión ni migración.

456 tests pasan, 14 recorridos Drive + recorrido focalizado de miniatura/visor pasan, compilación Pages y smoke remoto pasan. En producción, con sesión de Miguel, MOV IMG_2796.mov de Luján se reprodujo dentro del modal hasta 0:09/0:09. Archivo también mostró imagen en el visor directo Google. Evidencia y límites en handoffs/C04-google-viewer.md.

Pendiente concreto: el correo Google de Eliana no tiene acceso en la lista de permisos del archivo probado. Su usuario del gestor sigue viendo miniaturas y descargando; para el iframe necesitará permiso Google sobre el material y sesión de esa cuenta. No se compartieron carpetas ni archivos, no se enviaron mensajes. No prometer reproducción para Eliana todavía. No repetir despliegue/configuración/OAuth por esta entrega; siguiente paso es definir/autorizar el acceso de lectura adecuado y probar con ella.

## Miniaturas de video — 2026-09-17

Publicado en 38e9bc92.gestor-aramis.pages.dev, alias habitual actualizado. Videos muestran miniaturas privadas generadas por Drive, incluidos MOV/M4V; éstos conservan descarga del original sin reproducción. MP4/WebM crean reproductor sólo al pulsar Reproducir. Imágenes lazy, estados de carga/no disponible y reintento con Actualizar material. Sin conversión, servicios pagos, migración ni ampliación OAuth.

450 tests de suite, 15 recorridos compartidos de Drive, compilación TypeScript/Vite/Pages y smoke remoto pasan. Endpoint thumbnail protegido por la misma sesión y validaciones de asset, conexión y carpeta; URLs/tokens Google no salen del servidor, no hay caché compartida. Evidencia real: tres MOV de Club Luján entregan JPEG de 10–11 KB; descarga parcial del original retorna 206/attachment. Comprobación visual en la versión publicada con sesión de Miguel: miniaturas MOV visibles dentro de Tercera Fecha del Regional / Material, pieza dejada abierta.

Alcance, límites y pruebas en handoffs/C04-drive-thumbnails.md. Bloque cerrado; próximo sólo si Miguel lo pide: evaluar visor de Google para reproducir MOV. Duración y conversión no implementadas. Google Testing y pendientes anteriores siguen separados; no repetir configuración ni consentimiento.

## Logos editables de clientes — 2026-09-12

Implementado y publicado en `83c632a1.gestor-aramis.pages.dev` (dominio estable actualizado). Clientes → Datos y plan mensual / Editar datos y plan → Subir logo, Cambiar logo o Quitar logo → Guardar datos y plan. También disponible al crear cliente. Aparece en fichas y tareas del equipo; fallback a iniciales.

Se aceptan PNG/JPG/WebP hasta 5 MiB, se normalizan a PNG de hasta 192 px conservando proporción/transparencia y se reduce hasta caber en 48.000 caracteres. Sólo se guarda la miniatura en Supabase junto al cliente, no el original en Drive. Migración `202609120001_client_logo.sql` aplicada una vez desde SQL Editor y confirmada exitosa; no repetirla. Conserva revisión esperada, transacción, permisos e idempotencia de las RPC existentes.

406 unitarias (incluye SQL de persistencia, eliminación, conflicto y rechazo de URL/SVG/tamaño/tipo inválidos), 22 recorridos demo y 7 recorridos compartidos de shared.spec pasan. Compilación/Pages/Worker y smoke alojado pasan. Prueba real con sesión de Miguel: logo sintético guardado en Prueba de conexión, visible tras recargar en tarjeta Posteo 01; quitado y guardado al terminar. No se cambiaron los logos de clientes reales ni el Drive. Revisión visual del formulario completada. Handoff `handoffs/C05-client-logos.md`.

## Alta del equipo y prueba móvil informada — 2026-09-12

Miguel creó personalmente las cuentas de Auth de Eliana y Eric e ingresó sus contraseñas. Se localizaron por los correos acordados, se comprobó email confirmado y se agregaron sus perfiles y membresías staff activas al espacio Aramis existente. Lectura posterior verificó exactamente una membresía activa por persona. No se leyeron ni modificaron contraseñas, no se enviaron invitaciones y no se creó otro workspace. Su primer ingreso personal sigue pendiente; la verificación administrativa no sustituye una prueba de login.

Eliana debe elegir Vista de trabajo → Diseño en su navegador; Eric puede conservar Gestión. Ambos usan el Drive del equipo ya conectado. Miguel confirmó que la carga desde su celular funciona y aceptó mantener la carpeta propia Gestor Aramis; no implementar adopción/reorganización de carpetas por inferencia. Interrupciones de red, otros teléfonos y colaboración cotidiana siguen por probar. Detalle en `handoffs/C03-team-access.md`.

## Checkpoint vigente — entrada de Diseño (2026-09-12)

Base `9142905`. Implementada la vista pedida para Eliana: seleccionar **Vista de trabajo → Diseño** en el menú abre Producción y recuerda la entrada por usuario/espacio en este navegador. Gestión conserva su entrada semanal. No se infiere el área de un nombre ni se crean roles o cuentas; es una preferencia visual, sin cambios de permisos.

- Pendientes de Diseño por fecha de publicación (vencidos primero, luego futuras, sin fecha al final), filtros cliente/búsqueda y Pendientes/Por empezar/En curso con cantidades. Incluye producción de meses futuros; no filtra por responsable.
- Grabación, área Marketing y pedidos de material sin completar quedan en **En espera**, plegado. Preparación, aprobación y publicación se consultan desde Gestión, también plegada en el menú. El estado listo sigue siendo el marcado por Marketing: no se deduce que las tomas estén completas por existir archivos.
- Accesos directos a guion/texto en otra pestaña y a Material de la pieza. **Empezar a producir** usa el comando existente con revisión esperada y espera confirmación antes de mostrar edición/diseño. El resto de la pieza conserva su editor y protecciones de guardado.
- Pasan **404 unitarias, 22 recorridos demo y 20 compartidos**. Nuevas pruebas: entrada recordada, navegación a Gestión, esperas, orden de fechas futuras/vencidas/sin fecha, filtros, material directo, guion, cambio de etapa y rechazo de un conflicto real dentro de la API simulada. No son pruebas de identidad Eliana ni teléfono físico.
- Compilación compartida y empaquetado Pages/Worker pasan. Revisión visual en 1280 px y 390 px sin desborde; captura móvil espera el cierre de la transición del menú. Publicado en **`5d7aaccb.gestor-aramis.pages.dev`**, dominio estable actualizado; smoke alojado pasa. Con la sesión real de Miguel se verificaron la tarjeta Posteo 01, acceso directo a Material y preferencia recordada. No se modificó la etapa de la pieza alojada.

Retomar publicación/evidencia en `handoffs/C05-design-entry.md`. Próximo: prueba de Miguel en celular cuando pueda, feedback con Eliana y decisión de tomas completas para reels. Drive sigue conectado como se detalla debajo; no repetir su preparación. El cambio de vista se configura una vez en cada navegador, no sincroniza preferencias entre dispositivos.

## Base vigente de Drive — probado en escritorio (2026-09-12)

La conexión real ya permite subir material del equipo, verlo y descargarlo desde **https://gestor-aramis.pages.dev**. Este bloque es la fuente vigente; las secciones siguientes son historia y no deben usarse para repetir configuración o pruebas ya completadas.

- Código funcional `dffa2b8`, primero publicado en `288fa74a.gestor-aramis.pages.dev`; publicación final **`f27d6ae2.gestor-aramis.pages.dev`**, con smoke alojado aprobado. Corrige el Origin de la sesión reanudable y recupera archivos completos cuya respuesta final se perdió; conserva la compatibilidad 308 sin seguir redirecciones. Este checkpoint sólo aclara el alcance de reanudación en la misma pestaña y documenta pruebas reales.
- Google OAuth completado por Miguel, conexión cifrada persistente y refresh probado. Migración Drive aplicada una vez, cinco secretos de Pages producción instalados. **No repetir OAuth, capturar claves, regenerar AES ni reaplicar migraciones.**
- Tres videos sintéticos adjuntos en **Prueba de conexión → Reel 01 → Material**: 2.917.815 bytes y dos de 8.294.597 bytes. Los dos primeros se recuperaron tras una respuesta final ilegible; el tercero se subió desde cero con la corrección publicada. Tamaño y MD5 de los tres coinciden con sus originales; la UI confirma Guardado en Drive y los conserva al recargar.
- Preview real sin errores (readyState 4), reproducción y seek comprobados. Descarga individual de 2.917.815 bytes idéntica al original. ZIP real de los dos primeros videos: 11.212.696 bytes, ambas entradas con tamaño y MD5 exactos. Sólo fixtures técnicas; no se usaron videos personales ni se importó la demo.
- Árbol propio: Gestor Aramis / Prueba de conexión / 2026-09 / Reel 01 / Material. No se reorganizó el Drive anterior ni se adoptaron carpetas existentes.
- Evidencia acumulada del código funcional: **404 unitarias y 19 recorridos compartidos** pasan, incluyendo HTTP nativo y fallos simulados. Los 20 recorridos demo pasaron antes de estas correcciones limitadas a Drive. En este cierre pasan de nuevo compilación TypeScript/Vite y empaquetado Worker; no se repiten suites por un cambio de texto.
- La subida admite 2 GiB por archivo; ZIP completo hasta 256 MiB. Preview de video MP4/WebM; MOV/M4V conserva descarga. Reanudar requiere la misma pestaña y seleccionar el original: cerrar la pestaña puede perder la referencia pendiente. No equivale a una cola persistente entre sesiones.

### Próximo trabajo

1. Prueba de Miguel desde teléfono real: varias tomas, progreso, pausa/cortes y descarga. No está cubierta por responsive ni por los mocks. No hace falta crear otra cuenta para esta prueba.
2. Entrada de Diseño implementada en el checkpoint superior; recoger feedback. Decidir/implementar confirmación de tomas completas para reels. Prueba con Eliana cuando Miguel lo priorice; su alta no es un bloqueo ahora.
3. Antes del piloto sostenido: resolver OAuth External/Testing, comprobar segunda identidad/permisos alojados, revocación, cuota y archivos representativos grandes. Picker de carpetas existentes y revisiones exactas de cliente siguen pendientes.
4. Después del panel interno: calendario, enlaces y aprobaciones reales de clientes, correo y recorrido V1 completo. No declarar C04 ni V1 cerrados por estas pruebas de escritorio.

Detalle reproducible y publicación final en `handoffs/C04-drive-integration.md`; límites/configuración en `docs/DRIVE_SETUP.md`. El commit de este cierre es un checkpoint local; no implica push ni despliegue automático desde Git.

## Historial — integración Drive antes de la validación final (2026-09-12)

Este bloque reemplaza las notas anteriores que indicaban no implementar Drive todavía: Miguel autorizó la integración. UI interna, OAuth, RPC privada, carpetas reservadas, múltiples cargas reanudables, streaming privado y ZIP ya están implementados. Revisión independiente corrigió reintentos concurrentes, recuperación de carpeta reservada y refresh de tokens. Demo conservada; no se incorporaron cambios pendientes de entrada de Diseño ni POV cliente.

- Migración `202609100001_drive_team.sql` aplicada una vez en Supabase alojado. Comprobación real por REST: conexión de Miguel confirmada; clave pública sin sesión denegada 401/42501 y miembro inexistente con clave de servidor denegado 403/42501.
- JSON OAuth existente leído sin imprimir valores; credenciales y clave AES guardadas sólo en `.dev.vars` ignorado. Instalados cinco secretos de Pages **production**, mediante Wrangler, en el proyecto existente. Sin cambios DNS, pagos ni nuevas cuentas.
- Paquete compartido compila y Worker dry-run pasa. Validación final: 382 pruebas unitarias, 20 recorridos demo y 15 recorridos compartidos con Auth/Drive simulados pasan. Incluyen pausa, respuesta perdida, sesión de carga vencida, ZIP binario y cancelación al cerrar sesión.
- Código guardado en commit `9c9338f` y publicado en `efec34ff.gestor-aramis.pages.dev`, dominio estable `https://gestor-aramis.pages.dev`. Smoke online pasa, incluyendo denegación anónima y de otros orígenes para Drive; UI real muestra configuración disponible con sesión de Miguel.
- Miguel completó personalmente el consentimiento Google `drive.file`; la app confirmó conexión exitosa. La primera carga sintética creó las carpetas propias de Prueba de conexión/2026-09/Reel 01/Material, pero el transporte se interrumpió antes de adjuntar el archivo. No se modificó el árbol anterior de Drive.
- `7b94cf8` publicado en `7b80ebd6`: compatibilidad 308 y fallback MOV/M4V; smoke pasa. El problema real restante quedó identificado: las sesiones iniciadas sin Origin reciben el video completo pero su respuesta final 200 carece de CORS. Diagnóstico del servidor confirmó ambos WebM (2.917.815 y 8.294.597 bytes) con MD5 idénticos a las fixtures, todavía sin adjuntar en Supabase. No era una limitación exclusiva del navegador integrado.
- Corrección final preparada: iniciar sesiones con Origin del gestor y verificar en servidor una carga con respuesta final perdida/ilegible antes de marcarla interrumpida. Las sesiones anteriores se recuperan sin duplicar archivos. Pasan 404 unitarias y 19 recorridos compartidos; typecheck y empaquetado pasan. Publicar, recuperar las dos cargas y probar una nueva carga, preview y descargas. No repetir OAuth ni capturar claves. El diagnóstico temporal de consola de `453f6538` se retira en esta publicación.

Retomar por `docs/DRIVE_SETUP.md` y `handoffs/C04-drive-integration.md`. No volver a capturar claves, generar otra AES ni aplicar la migración. No copiar valores privados a la conversación. La integración real todavía no está terminada; teléfono real y permisos con una segunda identidad siguen pendientes del piloto.

## Google Cloud — revisión de configuración (2026-09-09)

Proyecto existente `gestor-aramis`, cuenta de conexión indicada por Miguel: `miguelcarreteroangel@gmail.com`. Verificado desde consola: Drive API en lista de APIs habilitadas; cliente OAuth web Gestor Aramis Web creado, callback correcto `https://gestor-aramis.pages.dev/api/google/callback`; audiencia External/Testing. Miguel confirmó completar ajustes: drive.file guardado (notificación de éxito) y correo agregado como usuario de prueba (1 usuario en tabla). JSON OAuth localizado en Descargas; validado por script que proyecto, cliente y callback coinciden y contiene secreto, sin imprimir contenido ni copiarlo a Git. Credenciales aún no instaladas en Cloudflare ni usadas para conectar Drive.

Audience muestra aviso de Branding incompleto; nombre, soporte y contacto presentes, dominio de Pages presente, enlaces de homepage/privacidad/términos vacíos. Revisar antes de publicar OAuth; no inventar URLs legales. Integración/callback siguen pendientes. Se mantiene el alcance de preparación, sin cambios de producto ni Drive.

## Notas y siguiente paso acordado — 2026-09-09

Sólo documentación en este bloque; no implementar UI ni Drive todavía. Miguel considera suficiente la prueba interna con su usuario hasta integrar materiales; no priorizar el alta de Eliana ahora. Siguiente paso: preparar Google Cloud/Drive con el titular y luego implementar/probar integración real.

Pendientes a contrastar con el código antes de implementar:
- Diseño: entrada predeterminada a pendientes de producción, deadlines y acciones posibles; resto secundario y accesible mediante filtros/navegación. No confundir preferencia de entrada con permisos de seguridad.
- Eric graba y sube desde celular: selección de varias tomas, progreso y recuperación ante cortes deben verificarse en teléfono real; responsive no basta.
- Preferencia por nuevas cargas en carpetas de clientes y meses. Propuesta aún por validar: cliente/mes del plan/pieza/Material y Entregables. Evaluar selección de carpetas existentes con drive.file; no asumir acceso a descendientes ni reorganizar existentes. No mover archivos automáticamente al cambiar una fecha.
- Guiones y descarga de todo ya presentes en demo: verificar su funcionamiento real al conectar Drive. Conservar regla pendiente de tomas completas para reels.

Handoff: `handoffs/C04-google-preparation-notes.md`. No se crearon recursos de Google ni credenciales en esta sesión.

## Publicación de prueba — 2026-09-09

Base `54f2477`. Núcleo compartido publicado en **https://gestor-aramis.pages.dev**. Despliegue inicial: `53d35498.gestor-aramis.pages.dev`. Cuenta de Cloudflare autorizada personalmente por Miguel mediante Wrangler; proyecto `gestor-aramis` creado por carga directa, sin integración GitHub, push, DNS ni plan de pago.

- `pages:prepare` valida configuración pública, compila TypeScript/Vite sin sourcemaps y empaqueta API en un directorio ignorado separado de la demo. `pages:preview`, `pages:smoke` y `pages:deploy` documentados en `docs/PAGES_DEPLOY.md`.
- Eliminado `_redirects` inválido: Pages ya sirve las rutas React por defecto. Rutas `/api/*` usan el mismo handler probado; configuración con URL/clave pública y workspace fijo, sin service_role.
- Build de publicación pasa. Smoke local (8788) y real sobre el dominio estable pasan: login visible, ruta ampliada protegida, health configurado, workspace/comandos sin sesión 401/no-store, otro origen 403 y sin errores JavaScript. No son pruebas de guardado autenticado online.
- Miguel ingresó personalmente en el dominio publicado. Verificados lectura del cliente Prueba de conexión y sus tres piezas, guardado confirmado del guion de Posteo 02 y persistencia/sesión tras navegación completa a `/text/:id`. El guion queda identificado como prueba de publicación del 9/9/2026. No se leyó ni compartió su contraseña.
- Drive, cuenta Eliana, correo y POV cliente real siguen pendientes. Este despliegue es una prueba del núcleo interno, no el piloto V1 completo.

Retomar: leer `docs/PAGES_DEPLOY.md` y `handoffs/C10-pages-first-deploy.md`. No crear otro proyecto ni reaplicar migraciones. Núcleo online probado con Miguel; siguiente bloque: habilitar identidad de Eliana y probar colaboración real, luego Drive según alcance acordado.

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

## Limpieza de prueba — 2026-09-13
Por pedido de Miguel, Prueba de conexión quedó archivado junto con Posteo 01, Posteo 02 y Reel 01. Piezas archivadas con revisión incrementada; archivo del cliente y revocación de enlaces completados por SQL Editor (Success). Ya no debe aparecer en el gestor. Se conservan los archivos técnicos en Drive y el historial; no reutilizar este cliente para nuevas pruebas sin autorización. Sin cambio de código ni despliegue.


### 2026-09-14 — Prueba de incorporación desde Drive (sólo lectura)
- Hugo Peñaloza / Reel 02: prueba_drive.mp4 existe en la carpeta Material, verificado en la interfaz de Drive con la cuenta conectada.
- Con la credencial OAuth actual del gestor, files.list de esa misma carpeta devuelve los cuatro archivos anteriores y omite prueba_drive.mp4. GET de metadatos y alt=media por su ID responden 404. No es un archivo ausente ni ubicado en otra carpeta: la conexión actual no tiene acceso al archivo agregado externamente.
- No se cambiaron permisos, archivos, base ni aplicación; sólo renovación de access token en memoria para la comprobación. Script local ignorado: work/probe-drive-import.mjs. Evidencia y siguiente paso en handoffs/C04-drive-import-probe.md.
- Siguiente: decidir acceso para incorporación desde Drive (selección explícita por archivo o autorización más amplia evaluada antes de solicitarla). No prometer sincronización automática con drive.file actual.
- Preferencias acordadas, aún pendientes: nombre Planificación; carpeta por pieza desde su creación; evitar subcarpeta Material para nuevas piezas conservando compatibilidad existente. Diseño permanece en el gestor.

### 2026-09-14 — Sincronización de material desde Drive
- Implementación y alcance en handoffs/C04-drive-import.md. Publicada en 5c198b22.gestor-aramis.pages.dev y alias habitual. Migración 202609140001_drive_import.sql instalada una vez (SQL Editor: Success). No repetirla.
- UI Planificación, carpetas nuevas sin subcarpeta Material y provisión anticipada tras crear pieza/base mensual; reintento al abrir Material ante fallos. Sin reorganización de carpetas existentes.
- Importación protegida por drive.readonly, desactivada en conexiones antiguas hasta consentimiento. Poll visible por pieza, reconciliación idempotente, medios privados externos con comprobación de carpeta/checksum.
- Pruebas: 425 tests de suite + 2 nuevos de provisión de carpetas, todos pasan; 14 recorridos compartidos simulados pasan; build Pages y smoke público pasan.
- Pendiente inmediato: consentimiento Google de lectura ampliada presentado en navegador para miguelcarreteroangel@gmail.com y confirmación solicitada al usuario. Luego comprobar prueba_drive.mp4 (Hugo / Reel 02) real. OAuth sigue Testing; resolver publicación y renovar credencial para evitar caducidad semanal.

### 2026-09-16 — Drive externo comprobado en producción
- Consentimiento ampliado autorizado por Miguel y completado. prueba_drive.mp4 ya se lee e incorpora a Hugo Peñaloza / Reel 02; cinco archivos sin duplicados tras Actualizar material. Reproducción completa de 41.076009 segundos dentro de la app y evento de descarga individual comprobados.
- Corregido fallo real de Cloudflare: redirect:error generaba TypeError en files.list, aunque Node lo admitía. Usar manual y rechazar 3xx. Reproducido en workerd local; nuevo test protege rechazo de redirecciones. Log de sync sólo código/clase de error seguros.
- Planificación aplicado también a la etiqueta compartida de estado (filas y detalle). Suite completa 428 tests pasa y build Pages pasa. Evidencia y límites en handoffs/C04-drive-import.md.
- No repetir migraciones ni consentimiento. Próximo: prueba del equipo usando carga nativa de Drive; resolver modo Google Testing (sigue activo), sin prometer vigilancia con app cerrada ni carga web en segundo plano.
- Publicación final 663ef731.gestor-aramis.pages.dev; alias habitual actualizado. Smoke público pasa; pieza real abierta para Miguel en el navegador.

### 2026-09-17 — Papelera de material publicada y verificada
- Botón por archivo en Material, con confirmación integrada y nombre del archivo. Envía a papelera de Drive, oculta el registro y conserva historial/estado de la pieza. Errores permiten reintentar; sin borrado definitivo.
- Miguel autorizó alcance drive para incluir archivos externos. Consentimiento completado; migración 202609160001_drive_trash.sql instalada una vez. No repetir ni volver a pedir permiso por esta entrega.
- Archivo sintético prueba_papelera_20260916.png: Google trashed:true; ausente del listado privado; cinco originales conservados y una entrada de historial comprobada en Hugo / Reel 02. Videos del equipo intactos.
- 436 pruebas de suite pasan; 14 recorridos compartidos pasan y el recorrido de papelera vuelve a pasar tras integrar modal de confirmación. Build final y smoke público pasan. Despliegue ab348cf1.gestor-aramis.pages.dev, alias habitual actualizado.
- Alcance, recuperación y límites en handoffs/C04-drive-trash.md. Pendiente separado: Google Testing; restaurar originales subidos desde app no vuelve a mostrarlos automáticamente en el gestor.
