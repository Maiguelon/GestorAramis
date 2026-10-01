# Plan de Pendientes, Aprobados e Historial

Fecha: 2026-09-30. Estado: ejecución autorizada e iniciada; P1 implementado y probado. P2–P5 en integración, sin publicación todavía. Base local: `a7d1920`.

## Resultado de producto

Gestión abre en **Pendientes**, con todo el trabajo de todos los meses disponible. Las piezas que requieren trabajo se ordenan por fecha ascendente; las vencidas siguen visibles y las que no tienen fecha quedan después de las fechadas. Las aprobadas se muestran al fondo, en un grupo separado, durante su fecha prevista inclusive. A partir del día siguiente se consultan desde Historial. La aprobación cierra el trabajo interno y no exige pasos posteriores para retirar la pieza de la vista cotidiana.

Diseño conserva como entrada las piezas listas para producir, con sus accesos directos a texto, material y entrega. El menú lateral queda con Producción y Calendario; Configuración y el selector Gestión/Diseño permanecen abajo. Un selector de consulta dentro de Producción permite ver En espera, Revisión y Aprobados sin cambiar el modo de trabajo. Para planificación y administración de clientes se utiliza Vista de trabajo → Gestión.

## Decisiones de interfaz

- **Atención primero y separado del proceso.** Es un filtro transversal de problemas, no una etapa. Se coloca antes de la secuencia, con espacio/divisor y un tratamiento discreto cuando su conteo es cero. No ordenar todas las filas por gravedad al seleccionar Todos: el orden base pedido es por fecha.
- Secuencia visible: **Planificación → Para producción → Revisión → Aprobados**. Los conteos de Atención pueden solaparse con las etapas; no presentarlos como cantidades que deban sumarse.
- En Gestión, retirar el destino lateral Producción: se accede al mismo conjunto desde Para producción en Pendientes. El cambio elimina la diferencia actual entre producción global y el resto limitado a una semana.
- Alcance temporal: **Todos** por defecto y **Esta semana** opcional. Esta semana significa lunes a domingo e incluye los pendientes vencidos y los pendientes sin fecha; el rango se muestra explícitamente. No oculta trabajo vencido por ser de otro mes. Calendario conserva su consulta mensual completa.
- Aprobados permanecen debajo del trabajo pendiente; al filtrar Aprobados se puede consultar sólo ese grupo. El texto visible pasa de Listos para publicar a Aprobados.
- En Diseño, mantener las tarjetas y sus accesos de trabajo. Agregar un solo selector **Ver: Para producción / En espera / Revisión / Aprobados**, inicialmente Para producción. Conservar búsqueda y cliente. Consultar otra categoría no cambia ni recuerda una nueva pantalla de entrada; volver a ingresar al modo Diseño abre Para producción.

## Reglas de datos y fechas

1. Para la lista cotidiana, separar trabajo pendiente de aprobados aunque compartan la misma pantalla. La fecha organiza; no aprueba, publica ni archiva automáticamente.
2. Usar el día de Aramis, `America/Argentina/Buenos_Aires`, para el corte. Una aprobada del 30/9 sigue visible todo el 30/9 y figura en Historial el 1/10. No se necesita una tarea programada para ese cambio: se deriva al leer/refrescar la vista, incluyendo el caso de dejar la aplicación abierta durante medianoche.
3. Una aprobada sin fecha permanece en el grupo de Aprobados sin fecha. No retirarla tomando como sustituto el mes del plan.
4. Una pieza sin aprobar permanece pendiente aunque su fecha haya pasado. Atención incluye trabajo vencido que requiera intervención y material por verificar, no una aprobada simplemente por tener fecha pasada.
5. Si se reprograma una aprobada del historial a una fecha actual/futura, vuelve al grupo inferior. Si una entrega recibe cambios, vuelve al trabajo de producción aunque su fecha sea pasada.
6. Las piezas terminadas permanecen en el calendario y en el mes del cliente. Archivar sigue siendo una acción explícita para retirar una pieza; se conserva historial y archivos.
7. Compatibilidad: los estados ya guardados `scheduled` y `published` deben seguir siendo legibles. No convertir registros de forma masiva ni borrar historial. Aprobados/programados antiguos se clasifican como trabajo cerrado con las mismas reglas de fecha; publicados antiguos van al Historial. Las nuevas acciones cotidianas cierran en Aprobado. Definir esta traducción en un único selector compartido para evitar conteos contradictorios.
8. Historial empieza con filtros de Completados y Archivados, cliente, mes y búsqueda. Su orden es fecha descendente, con tratamiento explícito de piezas sin fecha. El plan mensual mantiene su identidad aunque la fecha prevista cambie de mes.

## Bloques de ejecución

Cada bloque deja documentación, comprobaciones apropiadas y un commit propio. No reiniciar lo integrado al cambiar de sesión.

### P1 — Reglas compartidas de listas

Entrega: funciones que clasifican pendientes, aprobados visibles, completados históricos, archivados y Atención; orden por fecha; alcance de semana. Extraer la lógica hoy repartida entre Workspace y DesignProduction para que los conteos usen el mismo conjunto que las filas. Mantener el criterio de Diseño: sólo piezas listas, sin pasos previos pendientes.

Dependencias: ninguna. No requiere servicio ni migración.

Pruebas: reloj fijo antes/después de medianoche argentina, aprobada hoy/ayer/futura/sin fecha, pendiente vencida, devolución a producción, cambio de fecha, estados antiguos y pieza archivada. Confirmar que cada pieza tiene una ubicación coherente y que cambiar filtros no modifica sus datos.

### P2 — Pantalla de Gestión y aprobación como cierre

Entrega: Pendientes como entrada y etiqueta lateral; Todos/Esta semana; Atención separado; proceso en orden; Aprobados al fondo; conteos coherentes con filtros de cliente/área/búsqueda. Retirar Producción del menú de Gestión. Ajustar textos y accesos del detalle para que Aprobado sea el cierre normal sin obligar a programar/publicar dentro del gestor; preservar compatibilidad de registros anteriores.

Dependencia: P1. Puede comprobarse en demo y versión compartida simulada sin tocar Supabase alojado.

Pruebas: pieza futura de otro mes visible en Todos; vencida visible en ambos alcances; selección de cada categoría con conteo y filas consistentes; aprobar una entrega la desplaza al grupo inferior sin perder la versión; devolverla la reintegra a pendientes; filtros conservan el orden por fecha. Revisar escritorio y móvil y la preferencia de Gestión/Diseño.

### P3 — Navegación y consulta de Diseño

Entrega: quitar el desplegable Gestión del menú; Producción y Calendario visibles; selector de consulta dentro de Producción; conservar acciones de texto/material/entrega y el motivo de devolución destacado. Al consultar Revisión o Aprobados, ofrecer accesos apropiados para ver la entrega, evitando presentar una acción que presuponga que aún se debe producir.

Dependencia: P1; coordinar el menú común con P2. No requiere migración ni cuentas nuevas.

Pruebas: entrada sigue mostrando Para producción de todos los meses; cambios pendientes destacan el motivo; En espera muestra el paso previo; Revisión/Aprobados pueden consultarse; Calendario es accesible directamente; cambiar a Gestión da acceso a Clientes e Historial y volver a Diseño recupera su entrada habitual. Verificar ancho de teléfono y teclado.

### P4 — Historial de completados y archivados

Entrega: destino Historial en Gestión, separado de la lista diaria; filtros por categoría/cliente/mes/búsqueda; abrir una completada y consultar textos, entrega exacta, material e historial. Las archivadas tienen una presentación de consulta que no dispara cargas, sincronizaciones ni comandos de edición.

Dependencias: P1 y P2. La consulta de completados activos puede integrarse sin migración. Para material archivado, comprobar y ajustar de forma acotada los endpoints/RPC de lectura que hoy exigen pieza activa; se mantiene autorización staff y workspace y se conserva el bloqueo de escritura. Documentar por separado qué archivos pueden leerse hasta completar esa parte.

Pruebas: aprobada pasada accesible y ausente de pendientes; calendario/cliente conservan el contenido; archivo de entrega exacta no se reemplaza por el original mutable; archivada visible con acceso exclusivamente interno y sin acciones de escritura. No filtrar notas/entregas a clientes ni reactivar enlaces revocados.

### P5 — Recuperar archivadas

Entrega: acción explícita Recuperar a planificación, con confirmación, preservando textos, archivos e historial. Implementar una operación autorizada con revisión esperada e idempotencia: la RPC actual y el motor demo rechazan editar una archivada, por lo que no basta con poner `archived: false` desde la interfaz. La recuperación crea actividad y no resucita aprobaciones ni enlaces revocados.

Dependencia: P4. Necesita cambio del motor demo y migración/operación compartida. Mantener aislado para poder publicar P1–P3 mientras se verifica contra la base real.

Pruebas: consulta sin mutaciones; recuperación única; reintento no duplica historial; edición concurrente rechazada; usuario ajeno rechazado; archivos conservados; regreso a planificación visible y enlaces revocados siguen cerrados. Confirmar con una pieza sintética, no restaurar piezas reales por inferencia.

## Orden y cierre

Orden recomendado: P1 → P2 → P3 → P4 → P5. P2/P3 son pequeños cambios de interfaz una vez fijadas las reglas; P4/P5 necesitan especial cuidado por las versiones y el acceso a material archivado. Publicar checkpoints funcionales, sin prometer un historial completo antes de integrar su consulta.

Antes de cada publicación: verificaciones del bloque, compilación compartida, recorridos afectados y smoke remoto; actualizar PROJECT_STATE y handoff con evidencia, límites y siguiente bloque. No repetir suites sin motivo ni declarar prueba contra Google/Supabase por resultados simulados. Este plan no depende de la cuenta de correo y no inicia notificaciones.
