# Hoja de ruta — Gestor Aramis V1

Versión acordada el 2026-09-06. Objetivo: coordinación interna visible para la hermana del usuario y calendario, aprobaciones y material para clientes desde WhatsApp. Contratos compartidos en contracts/. Detalles y justificación en DECISIONS.md.

## Estados y regla de cierre
Pendiente → En curso → Probado en aislamiento → Integrado. Bloqueado siempre indica la dependencia. Demo/local y servicios reales se informan por separado. Una interfaz simulada NO completa un bloque de producción.

| Bloque | Dependencias | Entrega | Aceptación | Estado al 2026-09-10 |
|---|---|---|---|---|
| C00 Contratos | — | Roadmap, estado, decisiones, AGENTS, tipos, fixtures | Coherencia entre datos, operaciones y permisos | Integrado localmente |
| C01 Aplicación | C00 | Rutas, componentes, marca, build y modo demo | Arranca y navega en escritorio/móvil, estados de error/vacío | Integrado en demo |
| C02 Datos/negocio | C00/C01 | SQL, migraciones, API, transiciones, historial | Invariantes, idempotencia y concurrencia; RLS | Núcleo de equipo integrado; migraciones instaladas en Supabase; ver evidencia real en PROJECT_STATE |
| C03 Acceso | C02 | Sesión equipo, luego OTP, roles, enlaces scope/revocación | Aislamiento API entre clientes, recuperación y correo real | Login equipo correo/contraseña integrado; usuario Miguel creado; OTP/enlaces remotos pendientes |
| C04 Drive | Inicia C01, integra C02/C03 | OAuth, selección, subidas, streaming privado, versiones | Video real reanudado y reproducido en teléfono; permisos y cuota | Integración interna implementada y probada con mocks; esquema/secretos alojados; consentimiento y prueba Google real pendientes |
| C05 Panel interno | Inicia C01, integra C02/C03 | Semana, bloqueos, filtros, alta, responsable, fechas, detalle | Hermana identifica quién debe avanzar; persistencia y errores | Planificación compartida conectada; materiales disponibles en demo, Drive pendiente; falta prueba Miguel/Eliana |
| C06 Calendario cliente | Inicia C01, integra C02/C03 | Mes/agenda, enlace lectura/sesión, icono móvil | No filtra internos; fechas consistentes; acceso Android/iPhone | Integrado en demo; sesión y teléfonos reales pendientes |
| C07 Aprobaciones | C02/C03/C04 | Preview/copy, aprobar/cambiar/comentar, historial | Versión exacta, reintentos, nueva revisión invalida anterior | Integrado en demo; medios reales pendientes |
| C08 Material | C02/C03/C04 | Pedido, varios archivos, progreso, verificación interna | Fallos parciales, recibido≠completo, reanudación real | Demo integrada; transporte aislado, subida real pendiente |
| C09 WhatsApp | C05/C07/C08 | Mensaje/link manual, enviado, registro de respuesta externa | Abrir no marca enviado; misma regla de aprobación | Integrado en demo; envío siempre manual |
| C10 Piloto | C02–C09 reales | Subdominio, observabilidad, backup/restore, rollback, guía | Recorrido completo y restauración, 3 clientes/2 semanas | Núcleo interno publicado en Pages; smoke alojado pasa; piloto completo pendiente |

## C00 — preparación
Fijar entidades clientes, integrantes, piezas, versiones, solicitudes, archivos, respuestas, shares y actividad. IDs opacos. Fecha de calendario local YYYY-MM-DD, historial ISO UTC. Estados planned/production/review/approved/scheduled/published; archived separado. Un responsable interno persistente. Visibilidad cliente explícita. Una revisión vigente con copy+assets exactos.

## C01 — base ejecutable
Shell con sidebar, pantalla Esta semana, rutas calendario y solicitud, estilo marca, estados carga/error/vacío, simulador de API y configuración explícita. Build y preview reproducibles, entornos separados.

## C02 — datos y reglas
Persistencia PostgreSQL normalizada, índices, constraints, migraciones y RLS. Repositorio/servicio con comandos validados. Pruebas crear/editar/archivar, responsable preservado, respuesta idempotente, concurrencia sin pérdida, estados protegidos. No utilizar snapshot global público en producción.

## C03 — identidad y links
Supabase Auth OTP+SMTP Resend configurado; renovación de sesión, recuperación y signout. Asociación persona-cliente y equipo. Token de 256 bits guardado en forma hash, scope y target verificables, revocación. Endpoint real debe negar acceso por defecto y no confundir login con OAuth de Drive. Revisión independiente de permisos y correos de prueba acordados.

## C04 — Drive
OAuth server-side drive.file con refresh; configuración de producción Google (evitar expiración de 7 días del modo Testing). Crear carpeta propia al autorizar integración; Picker para archivos existentes. Subir en chunks reanudables y verificar proveedor; obtener streaming Range sin exponer token OAuth ni cargar archivo completo en memoria. Separar versión revisada de fuente editable. Rechazar archivo cambiado/eliminado. Prueba grande real, interrupción, reproducción/seek y permisos en móvil, conexión revocada y espacio insuficiente. No dar aprobado este bloque con mocks.

## C05 — coordinación
Semana con vencidos y sin fecha de meses actuales/anteriores; Producción global con filtros cliente/área/etapa. Clientes con plan y base mensual explícita editable. Crear con cliente+título, responsable inicial creador; editar fecha y responsable rápido; detalle lateral con material/revisiones/historial. Demostración de una semana representativa con la hermana.

## C06 — cliente
Calendario mensual y agenda móvil, estados comprensibles, links a pedidos vigentes con autorización específica. Calendario mediante login o enlace de lectura sin notas internas. Añadir icono pantalla inicio; sin aprobaciones offline. Probar Android+iPhone antes del piloto.

## C07 — revisión
Preview imágenes en orden/video + copy de snapshot. Aprobar, pedir cambios con comentario requerido y comentar sin decidir. Confirmación visible. Doble toque no duplica. Cliente con página vieja no aprueba versión nueva. Revisión independiente del flujo.

## C08 — material
Instrucciones, vencimiento y referencias; varios archivos/progreso por archivo. Conservar exitosos ante error. Verificar carga antes de recibido. Equipo acepta completo o reabre solicitud. Reanudar y reconocer entregado previamente.

## C09 — comunicación
Mensajes editables y URL según scope; abrir WhatsApp/copy sin enviar automáticamente. Enviado se registra explícitamente. Respuestas por WhatsApp registradas por integrante y siguen mismas reglas de versión/estado. No leer chats ni usar bot.

## C10 — cierre
Camino E2E: pedir material → entregar → producir → revisar → cambiar → aprobar → programar → publicar. Calendario por sesión/link; errores externos recuperables; backup Supabase y restauración en entorno distinto; versión estable y rollback compatible con datos; subdominio y correo; monitorizar errores sin datos sensibles. Probar con 3 clientes por 2 semanas. Metas observacionales: bloqueos en <1 minuto; operaciones simples <30 segundos; 80% solicitudes por link sin ayuda. No simular métricas.

## División entre sesiones y agentes
Coordinador conserva contratos, dependencias, integración y checkpoints. Hasta 3 agentes, archivos/ramas sin solapamiento. Entrega handoffs/Cxx.md: alcance, evidencia, instrucciones, referencia commit, limitaciones y próximo paso. Subdividir C04a OAuth, C04b carga, C04c reproducción si falta margen. No dejar grandes módulos sin integrar.

Al retomar: leer PROJECT_STATE, inspeccionar git, verificar punto estable y seguir siguiente bloque. No reiniciar lo completado. Si falta una credencial, avanzar sólo lo independiente y distinguir pruebas reales/simuladas.
