# Piezas multicliente — 2026-10-18

## Alcance

Miguel aprueba una única tarea compartida para efemérides, sin separar entregas por cliente. Alta: título, Cliente/Clientes en una fila completa con casilla Varios clientes, selector con Seleccionar todos y resumen de selección; Formato y Fecha en la fila siguiente. Se retiran las dos aclaraciones del alta. Cambiar al selector múltiple conserva el cliente; volver a individual conserva el primero seleccionado. Se rechaza una selección vacía y se conserva el guardado incierto con el mismo recibo.

La selección queda fijada a los clientes actuales: un cliente creado después no se incorpora automáticamente. Tarea, título, fecha, mes, texto, material, entrega, revisión y estado son únicos. Pendientes y Diseño no duplican filas; filtros, búsqueda, calendario, mes e historial encuentran la pieza por cualquier destinatario. Las compartidas se muestran como extras y no reducen la base mensual. Archivar desde el detalle o el mes avisa que afecta a todos. El editor de destinatarios después del alta queda fuera de este bloque.

Miguel pide durante el trabajo reemplazar los logos superpuestos por un símbolo multicliente. El resultado usa un icono de grupo, con nombre accesible y cantidad de destinatarios, junto a los nombres. Las piezas individuales conservan su logo. El calendario compacto mantiene la altura y el título legible; en su vista móvil conserva la regla existente de ocultar avatares para dejar espacio al texto. El desplegable de selección se expande dentro del formulario para que la lista no quede cortada.

## Persistencia y servicios

- Migración `202610180001_multi_client_pieces.sql` **aplicada una vez**. No repetirla. Relación privada normalizada `app_private.piece_clients`; claves del mismo workspace, posiciones únicas, selección sin duplicados y clientes vigentes. Se conserva `clientId` como ancla compatible. Los snapshots antiguos permanecen idénticos; `clientIds` es opcional y sólo se añade a piezas compartidas.
- Se extienden las RPC existentes conservando membresía, bloqueo, transacción, revisión e idempotencia. Tabla y validadores sin acceso directo para authenticated. La proyección pública omite destinatarios; no se habilita el portal cliente ni enlaces públicos sobre la entrega común.
- La carpeta nueva es `Gestor Aramis / Multicliente / YYYY-MM / pieza`, con una reserva por pieza. Los archivos y entregas usan el mismo ID de pieza y las verificaciones existentes; no se mueve ni reorganiza Drive anterior.
- Los avisos usan un evento por tarea y muestran los nombres de sus clientes. No se cambian preferencias, cron, remitente ni cuerpos de batches ya preparados.

## Verificación

1. Vitest: 547 casos distintos cubiertos entre suite completa y repetición focalizada del doble de Drive corregido. Nuevos casos de dominio y PostgreSQL: selección fija, atomicidad ante listas inválidas, clientes de otro espacio/retirados, recibo idempotente, una sola tarea/estado/evento, extra mensual y acceso directo denegado. La prueba de Drive comprueba el árbol común y la reutilización de reservas con HTTP simulado; no se afirma una nueva carga real a Google.
2. Playwright: 22 recorridos demo distintos y 12 compartidos con API/Auth simuladas aprobados, incluyendo creación múltiple, selección vacía móvil, persistencia, filtros secundarios, mes, calendario, Diseño, lectura ampliada, archivo e historial y reintento tras respuesta perdida. La ejecución paralela inicial de dos runners compartió `test-results` y falló al cerrar un artefacto; la repetición secuencial pasó. Ejecutar esos runners secuencialmente o con carpetas de salida distintas.
3. QA visual: formulario de escritorio y móvil, fila compartida y calendario. Se detectó y corrigió que la composición inicial de logos desplazaba el título fuera de la tarjeta; después Miguel pidió el símbolo de grupo. El recorrido ahora comprueba también que el título permanezca dentro de la tarjeta. Evidencia ignorada `work/multi-client-pending-row.png`, `work/multi-client-calendar-day.png`, `work/multi-client-create-mobile.png`, `work/multi-client-create-desktop.png`.
4. TypeScript/Vite/Pages y control del paquete sin secretos aprobados. Smoke remoto del dominio propio aprobado; repetir sólo tras el despliegue final si cambia el paquete.
5. Supabase real: preflight 46 piezas y 7 clientes, migración ausente; aplicación confirma Success. `supabase/tests/multi_client_hosted.sql` se validó primero en PostgreSQL aislado y luego pasó alojado bajo rol authenticated/identidad staff: dos clientes sintéticos, una pieza, destinatarios ordenados, replay, producción, extra mensual y un evento. **Todo dentro de rollback**. Postflight: 46 piezas, 7 clientes, cero asociaciones de prueba, comando ampliado presente y lectura/ejecución directa de authenticated denegadas. No quedan datos de prueba, archivos ni correos.
6. Navegador alojado con sesión existente, refrescado tras la última publicación: pendientes cargados, Nuevo contenido muestra el formulario nuevo, selección de los cinco clientes activos, último cliente seleccionable dentro de la lista y cierre sin crear registros. Capturas `work/multi-client-hosted-form.png` y `work/multi-client-hosted-selector.png`. Postflight SQL guardado en `work/multi-client-supabase-postflight.png`; pestaña temporal de Supabase cerrada y gestor conservado como entrega.

## Publicación y continuidad

Publicado **7ab5ced8.gestor-aramis.pages.dev** y **https://gestor.aramis.agency/**; smoke remoto final aprobado. La migración ya está aplicada y no debe volver a ejecutarse. No revertir borrando las asociaciones. Material, OAuth, cuentas, permisos Drive y datos existentes permanecen conservados.

Para usarlo: recargar https://gestor.aramis.agency/ → Nuevo contenido → Varios clientes → elegir destinatarios o Seleccionar todos → Crear contenido. Después se trabaja como una pieza común. La selección no se edita en esta entrega; las futuras vistas de clientes deben definir qué mostrar de una entrega compartida antes de habilitar su acceso.
