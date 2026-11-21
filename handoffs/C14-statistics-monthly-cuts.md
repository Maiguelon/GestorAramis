# C14 — Cortes mensuales, versiones y cumplimiento

Fecha: 2026-11-21. Estado: integrado y verificado en producción. Base C13 ya activada; no repetir su migración. Implementación de datos/API/programador: `6aedf07`. Interfaz y cierre en el commit siguiente de la misma rama `feature/internal-statistics`.

## Alcance y definiciones

- Sólo la membresía que ya podía consultar Estadísticas. Gestión muestra los datos actuales y los cortes mensuales; Diseño no recibe pantallas, campos ni pasos nuevos.
- **Versiones:** una pieza con aprobación vigente cuenta una sola vez. Se cuentan sus entregas registradas hasta esa aprobación, incluidas versiones reemplazadas. Mediana, muestra y distribución 1 / 2 / 3+; detalle expandible con cliente, formato, versiones y decisiones de cambios separadas por equipo/cliente. Conserva las limitaciones históricas del ledger de C13.
- **Plazo:** aprobación vigente frente a la primera fecha prevista de publicación que el sistema conoce. Incluye el día completo argentino. La fecha inicial se conserva al moverla, quitarla o reasignarla. No es publicación real, horas trabajadas ni un plazo interno de Diseño.
- **Cobertura:** la migración guarda como línea de base la fecha actual de las piezas existentes. Una aprobación anterior a ese registro queda fuera del porcentaje, aunque tenga fecha en el calendario. Se muestran muestra elegible y cantidad sin dato verificable. Las próximas aprobaciones de piezas con compromiso registrado alimentan el indicador.
- **Cortes:** JSON inmutable por workspace/mes, con fecha real de captura, origen manual/automático, versión de definición y el informe completo. Todos los clientes y formatos. Primer guardado exitoso gana; reintentar o guardar el mismo mes devuelve el original. Descargar conserva exactamente ese JSON. Los cortes incluyen nombres/títulos internos: revisar o anonimizar antes de publicarlos fuera del equipo.
- El Worker existente intenta cerrar meses desde el mes de activación, a partir del primer minuto del mes siguiente en Argentina. Ante una interrupción recupera un mes faltante por tick, identificado por su captura real posterior. No requiere visitas a la app ni correos habilitados. No genera cortes retroactivos con fechas de captura ficticias.
- Guardar manualmente un mes anterior es una captura de sus datos actuales, etiquetada con la fecha de hoy; no reconstruye el estado histórico al cierre. Se conservó octubre como primer corte manual.

## Datos, permisos y despliegue

Migración nueva: `supabase/migrations/202611210001_statistics_monthly_cuts.sql`. Tablas privadas `piece_deadlines`, `statistics_tracking`, `statistics_monthly_snapshots`; RLS y sin acceso directo de anon/authenticated/service_role. El cálculo anterior se conserva en una función privada sin permisos públicos. La RPC de consulta revalida al lector; lectura/guardado de cortes también. El cierre programado sólo tiene EXECUTE para service_role. El API del navegador usa el JWT de la persona y el workspace fijado en el servidor. El programador recibe el secreto existente del servidor.

Las fechas, el guardado de snapshots y las decisiones se registran en PostgreSQL. No se escribe en Drive ni se alteran piezas para probar estadísticas. Los cierres son independientes del despacho de emails; un fallo de un trabajo no cancela al otro. La llamada programada tolera únicamente la ausencia conocida de la nueva RPC durante un despliegue por etapas.

1. El control del navegador se recuperó. Se abrió el proyecto exacto de Supabase y se renovó su sesión existente con GitHub. Preflight SQL: C13 instalado y cortes todavía ausentes.
2. Se ejecutó en el editor una transacción con la ampliación y guardas contra repetición. Resultado observado: **Monthly statistics activated**. Se mantuvo el lector de C13; no se concedió acceso a otras personas. El SQL operativo revisable permanece en `work/ACTUALIZAR-ESTADISTICAS-ARAMIS.sql`, ignorado. No volver a ejecutarlo en Aramis.
3. Pages **4446b0ea.gestor-aramis.pages.dev**, dominio **https://gestor.aramis.agency/**. Bundle **index-DT2dGeJQ.js**, SHA-256 **c83c53317741efb1e67ed32d9da9b5e64d772675f9f1b9b8ccf6aa9b8c0e53e4**, idéntico al paquete seguro preparado.
4. Worker **gestor-aramis-notifications**, versión **765acb93-f203-456f-8de8-b6c07e44423e**, cron `* * * * *`. Conserva email habilitado, remitente y dominio actuales. El primer mes automático será noviembre, al cerrarse el 1 de diciembre de Argentina; ese evento futuro aún no se observó. La RPC de cierre se invocó realmente y devolvió null porque todavía no corresponde cerrar un mes desde la activación.

## Verificación

- Vitest: **597 pruebas / 33 archivos**. Pruebas PostgreSQL: versiones, multicliente, fechas de línea de base y primera asignación, cambios/limpieza de fecha, corte a medianoche argentina, muestra histórica excluida, snapshots inmutables/reintentos, calendario de activación y permisos. La serialización por fila y clave única protege capturas concurrentes; no se hizo una prueba multiproceso de concurrencia en producción.
- Playwright compartido completo: **55 recorridos aprobados**, incluyendo datos actuales, detalle, cortes, error/reintento de guardado, descarga exacta y 390 px. Los servicios de estos recorridos están simulados; no confundirlos con comprobación externa.
- TypeScript, paquete Pages/Worker y escaneo de secretos aprobados. `notifications:check` aprobado; se publicó con el paquete operativo preparado, cuyo email está habilitado (no con el TOML de ejemplo deshabilitado). Smoke anónimo alojado aprobado, incluida la nueva ruta de cortes.
- QA real con sesión temporal sólo de Miguel, sin enviar correo, guardada en memoria y cerrada con alcance local. Consulta de septiembre/octubre/noviembre y total; `definitionVersion=2`, muestra de versiones y suma de distribución iguales al total de aprobaciones, detalle con una fila por pieza y cobertura de plazo completa entre elegibles/desconocidos.
- Septiembre–noviembre: **24 aprobadas**, mediana **2 versiones**, distribución **8 / 7 / 9**. Las 24 aprobaciones son anteriores al registro de compromisos y quedan **sin fecha verificable**, con porcentaje null, no 0%.
- Octubre: corte manual **2026-10**, capturado **2026-11-21T05:09:13.785303Z**, **17 aprobadas**, mediana **2 versiones**, distribución **5 / 6 / 6**. Un segundo POST conserva JSON/fecha exactos. GET y descarga desde la app publicada coinciden con el guardado.
- API sin sesión 401/no-store; origen ajeno 403; sustitución de workspace 400; filtros de mes/formato/cliente y vista móvil real aprobados. Las denegaciones de otras membresías se prueban en SQL aislado, sin usar cuentas de compañeros en producción.
- Evidencia privada en `work/statistics-monthly-hosted/report.json`, `desktop.png`, `snapshot.png`, `mobile.png`, `proof.png`. Ninguna pieza, entrega, aprobación o archivo de negocio se modificó para QA. Los únicos datos persistidos de comprobación son el corte manual real de octubre y su intento idempotente.

## Continuación

Recargar el gestor → Gestión → Estadísticas. Ver la distribución y abrir el detalle; Cortes mensuales → octubre → Descargar corte. Guardar otro mes cerrado es opcional; no se reemplaza el corte anterior. Observar las próximas aprobaciones para comprobar la cobertura del deadline y el primer cierre automático de noviembre. No atribuir mejoras causales ni ahorro de tiempo sin comparación válida. Los commits siguen locales en `feature/internal-statistics`; no hay push ni merge solicitado en esta sesión.
