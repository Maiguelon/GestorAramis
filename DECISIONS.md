# Decisiones

## D21 — Visor Google opcional (2026-09-17)
El usuario autoriza implementar/probar el visor sin servicios pagos. MOV/M4V y fallos de reproductor nativo ofrecen Ver con Google, con un solo iframe a demanda. Mantener miniatura y descarga privada existentes. El visor usa sesión/permisos Google propios del usuario, no la credencial OAuth del servidor; abrirlo no comparte el material ni modifica permisos. Link validado tras autorizar el asset; reintento y salida directa disponibles porque la app no puede inspeccionar fallos internos cross-origin. Uso interno mutable, excluido de aprobaciones exactas. Acceso de Eliana en Drive pendiente; no se infiere autorización para hacer públicos los archivos.

## D20 — Miniaturas de video sin conversión (2026-09-17)
Eliana prioriza miniaturas y descarga del original. Usar las imágenes generadas por Drive también para MOV/M4V mediante proxy privado con autorización y validación por archivo. No exponer thumbnailLink ni tokens, no publicar los archivos ni contratar servicios de video. Tarjetas lazy; MP4/WebM reproducen sólo tras pulsar. MOV/M4V permanecen descargables sin reproducción. Visor Google y duración quedan para evaluación posterior; ausencia de miniatura no bloquea material.

## D01 — Producto y V1
WhatsApp es la entrada del cliente, envío humano con mensaje preparado. Calendario incluido V1: enlace secreto revocable read-only y acceso habitual autenticado. Aprobación/material por link restringido. No bot ni autopublicación ni métricas.

## D02 — Stack
React + TypeScript + Vite; Tailwind/shadcn; FullCalendar Standard cuando se integre el calendario completo; Cloudflare Pages y Worker; Supabase PostgreSQL/Auth; Drive API; Resend SMTP. El usuario eligió un repositorio propio: no crear una aplicación Sites alternativa.

## D03 — Datos demo y producción
La demostración persistirá únicamente datos ficticios en el navegador, con indicador constante y mecanismo de reinicio. No hay login falso, correo ficticio ni entrega Drive simulada como real. En producción, configuración ausente bloquea con error; no cae a demo. La integración real conserva políticas RLS y tokens hash en servidor.

## D04 — Permisos y versiones
Visibilidad cliente opt-in por pieza; no mostrar notas internas. Las revisiones capturan texto y archivos. Mutar copy o crear versión nueva invalida aprobación anterior. Estado aprobado solo por respuesta de revisión vigente. Material recibido y completo son estados distintos. Un comentario no autoriza publicación. Reintentos idempotentes y actualización con revision esperada.

## D05 — Drive
Se mantiene estructura existente; la integración creará su carpeta propia cuando exista autorización funcional. OAuth de cuenta Aramis con drive.file y offline access. Elegir explícitamente archivos anteriores mediante Picker; compartir una carpeta no implica permiso a todos sus descendientes. Sin credenciales Google en frontend. Carga reanudable con permiso por envío; comprobar tamaño/existencia antes de registrar recibido. Revisiones conservadas con archivo y checksum verificables. No sincronización automática del disco físico en V1.

## D06 — Marca
Azul institucional #1b2a41, rojo #8b2634, fondo #e9ecf1, amarillo #f4b943 y azul #5c9cd9 como acentos. DM Serif Display para títulos y Lato para lectura/UI. Español rioplatense, profesional y cercano.

## D07 — Continuidad y audiencia
Hasta tres subagentes + coordinador, sin ediciones superpuestas. Cada módulo entrega evidencia y pendientes. No publicar, usar datos reales ni contactar clientes durante la demostración; preparar configuración y pruebas controladas. Si faltan accesos externos, continuar trabajo aislado y pedir al usuario lo necesario para la siguiente integración.

## D08 — Versión exacta y concurrencia (2026-09-07)
Crear una revisión también exige revisión esperada, igual que editar una pieza. Un formulario abierto no puede invalidar una aprobación más reciente ni trasladar una respuesta WhatsApp a otra versión. Mensajes y formularios de respuesta se reconstruyen cuando cambia su revisión. Publicar exige resolver el borrador sin guardar; una pieza publicada mantiene texto y aprobación histórica, incluso al archivarla.

## D09 — Calendario y acceso a pedidos
La visibilidad en calendario y el enlace de una solicitud son permisos diferentes. Una pieza oculta del calendario puede tener un pedido explícitamente compartido. El calendario secreto es estrictamente de lectura y no entrega tokens de solicitudes. La futura sesión de cliente deberá autorizar por separado su navegación a acciones pendientes.

## D10 — Snapshots Drive y copia privada
El borrador de texto se guarda en `piece_drafts` sólo para equipo; el cliente obtiene texto de la revisión sellada vigente. Un checksum seguido de descarga del head de Drive deja una carrera. Los snapshots de medios deben guardar `driveRevisionId` con `keepForever` y transmitir esa revisión exacta. Las primitivas están probadas con mocks; faltan persistencia, handlers y prueba Google real. La retención de Drive no sustituye un backup.

## D11 — UI de trabajo (2026-09-07)
Aramis sin acento y logo original. Priorizar pendientes, acciones y filtros; eliminar slogans y tarjetas decorativas. Lato en encabezados funcionales para lectura compacta. La demo no representa cuentas reales.

## D12 — Base mensual y producción interna (2026-09-07)
Miguel y Eric trabajan desde Clientes; Eliana desde Producción. Plan actual editable por cliente (posteos incluye post/carrusel, reels separado). Generación explícita una vez por mes, completa faltantes sin mover ni eliminar piezas existentes, sin fechas automáticas. Quitar archiva y conserva historial; no regenera espacios eliminados. planMonth representa el mes del plan y es independiente de la fecha de publicación. Cantidades mostradas comparan con el plan actual, sin snapshot contractual histórico.
Preparación usa planned; productionStage distingue ready, recording y editing dentro de production. Listo para producción pasa a Diseño; grabación a Marketing. Filtros de área reemplazan responsables; ownerId se conserva para integridad e historial.
Material del equipo privado en la pieza, guion también privado. Demo guarda blobs por ID en IndexedDB, nunca URLs blob en contratos, hasta 100 MB/archivo. Puede previsualizar y descargar localmente; no hay Drive ni sincronización. Exportación de metadata no incluye archivos. Nuevos campos aún no migrados al esquema SQL remoto. El POV cliente queda pendiente de revisión posterior.

## D13 — Logos de referencia, ZIP y lectura ampliada
Se usan copias originales de Aura, Beecomex y Musas como referencia visual en los tres clientes ficticios; no se cambian nombres ni datos locales. Los clientes nuevos conservan iniciales. No se implementó carga de logos todavía.
El material del equipo permite Descargar todo (ZIP), sin compresión adicional (videos ya comprimidos), nombres seguros y únicos, hasta 2 GB. Si falta cualquier archivo, no descarga un paquete parcial. Preview individual permanece igual.
Expandir guion y texto abre /text/:pieceId en otra pestaña, sólo lectura del estado local guardado; cambios sin guardar bloquean el enlace. Se actualiza mediante eventos de almacenamiento entre pestañas. Guion, copy y notas de equipo legibles/copiar, sin duplicación ni exportación de un Doc. Ruta bloqueada junto al resto de la demo en modo production; autenticación remota pendiente antes de cualquier despliegue.
Notas de producto pendientes (no implementadas en este bloque): entrada predeterminada de Eliana a piezas listas para producir; diferenciar entrega completa de tomas de reel frente a post que no requiere medios. No buscar videos en Descargas, el usuario canceló esa petición.

## D14 — Primer bloque compartido (2026-09-09)
Equipo habilitado manualmente, correo y contraseña de Supabase Auth para probar sin depender de SMTP. No alta pública ni autoasignación de roles. OTP/recuperación y acceso habitual de clientes siguen pendientes. La demo mantiene su almacenamiento y puerto; modo compartido exige configuración y sesión, sin importar fixtures o videos locales.
API del equipo bajo el mismo origen. El Worker verifica sesión con Auth y usa el JWT del usuario para RPCs con membresía activa; no requiere service_role. RPCs normalizadas por workspace, serialización y revisión esperada. Reintentos conservan UUID y comando en sessionStorage, se limpian al confirmar/cerrar sesión. Lectura al foco y cada 15 segundos con la pestaña visible. No se afirma sincronización instantánea.
El bloque habilita clientes, planes, piezas, guiones y producción. Medios, revisiones y enlaces remotos permanecen cerrados hasta Drive y sus operaciones transaccionales. Pages Functions reutiliza el mismo handler Worker para evitar una API en otro dominio. Credenciales y configuración del proyecto concreto fuera de Git.

## D15 — Material compartido en Drive (2026-09-10)
Una cuenta Google conecta el espacio del equipo mediante drive.file, PKCE y estado de un uso asociado al usuario real. El servidor verifica Supabase Auth, pertenencia activa y alcance de la pieza; una RPC restringida al servidor revalida pertenencia antes de acceder a registros privados. La clave de Supabase de servidor y AES-GCM viven sólo en configuración ignorada y secretos de Pages. Los tokens Google, verificadores y sesiones de carga se cifran antes de persistir; nunca se devuelven al navegador, excepto una URL reanudable limitada al archivo autorizado.

Carpetas propias y perezosas: Gestor Aramis/cliente/mes del plan/pieza/Material, creadas recién al subir. IDs reservados antes de llamar a Google; carpetas conservan padre/nombre originales al reintentar y no se mueven al replanificar. Sin adopción de carpetas por nombre ni modificación del árbol existente. Sesión de subida guardada con comparación y actualización atómicas; reintentos devuelven la reserva ganadora.

Assets privados del equipo separados de revisiones de clientes. Confirmación exige verificar ID, pertenencia, MIME, tamaño y checksum de Drive; cada alta suma historial/revisión una sola vez. Videos se transmiten por rangos tras autorizar cada petición mediante JWT o cookie cifrada breve. ZIP en memoria limitado a 256 MiB, sin entregar paquetes parciales; archivos individuales hasta 2 GiB. Se conserva la demo sin importar datos. No se implementan aún regla de tomas completas, vista inicial de Diseño, Picker de carpetas existentes ni POV cliente remoto.

## D16 — Entrada de Diseño (2026-09-12)
Preferencia Gestión/Diseño, elegida desde el menú y guardada por modo demo/compartido, espacio y miembro en localStorage. No es un rol ni concede/restringe acceso. No se infiere el área por nombre de persona; no requiere el alta de Eliana para probarla. En otro navegador hay que seleccionarla otra vez.

Diseño abre Producción: piezas no archivadas en production, área design (incluye datos antiguos sin área) y etapa ready/editing. Grabación, área marketing o pedido activo de material se muestran plegados en En espera. Fechas de publicación previstas visibles, vencidas primero, futuras incluidas y sin fecha al final; no inventar una fecha límite de producción. Material recibido aún sin confirmar no se considera disponible por inferencia. La confirmación de tomas completas de un reel sigue pendiente; el marcado listo de Marketing conserva su significado existente.

Guion/texto y material accesibles directamente; empezar producción cambia sólo la etapa usando el comando existente con revisión esperada. La UI espera confirmación, muestra conflictos y no aprueba ni envía piezas. El panel de Gestión, la demo y los permisos existentes se conservan. Calendario/aprobaciones remotas de cliente siguen fuera de este bloque.

## D17 — Logo del cliente
Miniatura pequeña normalizada en navegador, PNG embebido de hasta 48.000 caracteres en clients.logo, nullable. Se guarda con datos/plan bajo la misma revisión y transacción; null elimina, omitir preserva. Fuente PNG/JPG/WebP hasta 5 MiB; lado máximo 192 px y reducción adicional si excede el límite. No se almacena el original ni se crea infraestructura/archivos en Drive. La UI y la base rechazan URLs externas y SVG. Esto identifica al cliente en el equipo; no amplía las vistas públicas. Los logos de muestra siguen sólo para fixtures antiguas sin logo explícito.

## D18 — Material recibido desde Drive (2026-09-14)
El equipo puede cargar y seleccionar tomas desde Drive; Diseño permanece en el gestor. Solicitar drive.readonly adicional a drive.file, con explicación explícita de lectura global a nivel OAuth y restricción del servidor a mappings de piezas. Incorporar sólo metadatos verificados; no copiar, mover ni modificar originales. Material existente no significa listo para producción. Reconciliación al abrir Material y periódica mientras visible; sin vigilancia global con aplicación cerrada en este bloque. Carpetas nuevas por pieza sin Material, creación anticipada best effort y reintento; compatibilidad de carpetas previas intacta. Etiqueta Planificación acordada.

## D19 — Papelera desde el gestor (2026-09-16)
Miguel solicita botón para eliminar material y elige habilitarlo también para archivos externos. Operación reversible tras confirmación, sin borrado definitivo. Google requiere drive para modificar archivos externos; el consentimiento debe explicar que abarca todo el Drive aunque el servidor sólo acepte assets persistidos del workspace. Conserva historial y estado de producción. Se exige confirmar Google antes de ocultar el registro; reintentos idempotentes. No se amplían permisos de compartición ni se cambian propietarios de archivos.
