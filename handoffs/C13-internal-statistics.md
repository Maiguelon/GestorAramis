# C13 — Estadísticas internas

Primera versión en `feature/internal-statistics`, basada en el gestor del equipo. La sección Estadísticas aparece en Gestión sólo si la cuenta tiene permiso explícito. La base vuelve a comprobar el permiso y la membresía activa para cada consulta. La lista privada de acceso empieza vacía.

## Qué mide

| Dato | Cálculo |
|---|---|
| Piezas aprobadas | Entrega aprobada vigente con fecha de aprobación dentro del período, una por pieza. Una aprobación deshecha deja de sumar. |
| Clientes atendidos | Clientes distintos de esas piezas. Una pieza multicliente suma una sola vez al total y aparece para cada destinatario en su fila correspondiente. |
| Primera entrega | Tiempo desde la última entrada registrada a Diseño hasta el envío de la v1. El período filtra por fecha de envío. |
| Revisión interna | Tiempo del envío a la primera decisión registrada de cada versión, si fue del equipo. El período filtra por fecha de esa decisión. |
| Con cambios | Piezas aprobadas en el período que tienen al menos una devolución de entrega registrada. |
| Avance del plan | Piezas aprobadas al momento de consultar, entre las asignadas al período por mes del plan. Excluye archivadas y multicliente. El denominador son las piezas asignadas, no el cupo configurado hoy. |

El período usa meses de Argentina. Los tiempos son corridos y muestran mediana y cantidad de casos. Se reutiliza el evento existente de listo para Diseño y la fecha persistida de cada envío. Un disparador guarda las decisiones de entrega en la misma transacción, incluido el hecho de volver a revisión. La migración toma del histórico sólo decisiones con fuente y ambas fechas persistidas. No puede reconstruir una decisión que ya se sobrescribió antes de instalarla. Piezas sin fecha de entrada a Diseño no pesan en ese tiempo.

El alcance de este bloque es el flujo interno. Se conserva el origen cliente para distinguirlo del equipo. Quedan fuera la espera opcional de material, los tiempos de WhatsApp y la publicación en redes.

## Activación en producción

1. Aplicar una sola vez `supabase/migrations/202611160001_internal_statistics.sql` al proyecto del gestor del equipo con un operador de base de datos.
2. Verificar el UUID de Auth de Miguel y su membresía activa de equipo en el workspace de Aramis. Con esos identificadores verificados, conceder el acceso:

   ```sql
   insert into app_private.statistics_readers(workspace_id, member_id)
   select workspace_id, id
   from public.members
   where workspace_id = '<UUID del workspace>'
     and user_id = '<UUID de Auth de Miguel>'
     and active and role = 'staff'
   on conflict do nothing;
   ```

   Comprobar que la lista del workspace contiene solamente esa membresía. Quitar su fila revoca el acceso.
3. Publicar el paquete del equipo con `npm.cmd run pages:deploy` y correr el smoke del dominio habitual. Verificar la sección y una consulta autenticada con la cuenta de Miguel, y que un integrante sin permiso reciba 403 al consultar directamente.
4. Antes de citar una cifra pública, usar un período cerrado y guardar la fecha de consulta y la cantidad de casos. La tabla de avance describe el estado actual de un mes del plan, por lo que puede actualizarse después del cierre.

La migración y el despliegue se completaron el 21/11/2026. El titular ejecutó el archivo operativo generado después de verificar su cuenta y membresía. No repetir la migración en Aramis. La sección publicada fue comprobada después con datos reales, como se detalla al final.

## Verificación local

- `npm.cmd test`: 588 pruebas en 32 archivos. Se verifica en PostgreSQL el cálculo, cierre de mes local, revisión interna, decisiones al reabrir, conteo multicliente y denegación por miembro, cliente, sesión anónima y workspace.
- `npx.cmd playwright test --config playwright.shared.config.ts tests/shared-ui/statistics.spec.ts tests/shared-ui/shared.spec.ts`: 14 casos distintos aprobados entre la suite compartida y la repetición focalizada de Estadísticas. La ejecución inicial necesitó instalar el navegador de prueba y el caso en móvil expuso una etiqueta de filtro; ambas condiciones se resolvieron.
- `npm.cmd run typecheck` y `npm.cmd run pages:prepare`: aprobados, incluida la compilación del Worker y verificación de secretos del paquete.

## Activación y comprobación real — 2026-11-21

- Proyecto Aramis y la cuenta confirmada de Miguel verificados mediante el administrador de Supabase. La membresía usada en el SQL pertenece a su mismo UUID de Auth, al workspace configurado y al rol staff activo. Antes de activar, la RPC devolvía PGRST202.
- El helper de navegador falló con una solicitud ocupada. Se dejó un SQL atómico y revisable en el directorio ignorado `work/ACTIVAR-ESTADISTICAS-ARAMIS.sql`. Comprueba el proyecto por su workspace y la cuenta por su UUID/correo/membresía antes de aplicar la migración y conceder el acceso. Detiene un segundo intento si la tabla ya existe. Miguel confirmó su ejecución.
- Publicación **4938dc10.gestor-aramis.pages.dev** en el dominio del equipo. Bundle **index-CdyKUDzg.js** y SHA-256 **f9aecc111198611c3c8b06c4011bb63bb4516d251dfe193f1c7c3cab94ef62d2**, coincidencia exacta con el paquete seguro. La demo de portfolio se sirve desde otro proyecto.
- Para comprobar el acceso se generó una sesión temporal de Miguel usando `admin.generateLink` y `verifyOtp`, sin enviar mensajes ni guardar tokens en archivos. Cada sesión de prueba se cerró con `signOut({scope:'local'})`. Se usó un contexto nuevo de navegador para las lecturas de la app. No se ejecutaron comandos del gestor, decisiones, cargas o solicitudes a clientes.
- Consulta autenticada real confirma capability y estadísticas 200. Comprobados filtro de meses, reel y cliente individual, escritorio y 390 px. La captura móvil inicial se tomó durante la transición de la barra lateral; se repitió esperando su salida completa. Las capturas finales están en `work/statistics-hosted/desktop.png` y `mobile.png`.
- Comprobaciones reales de protección: sin sesión 401 y cache no-store, origen ajeno 403, parámetro de workspace no permitido 400 y mes inválido 400. Las pruebas de otras cuentas están cubiertas por PostgreSQL aislado; no se usaron las cuentas de Eric o Eliana en producción.
- Volumen vigente septiembre–noviembre al 21/11: **24 aprobaciones / 6 clientes**, comprobado además contra los registros de piezas actuales (19 reels, 3 historias y 2 posts). Se inspeccionó la presencia de títulos de prueba, sin coincidencias en ese conjunto. Primera entrega tiene 25 casos y revisión interna 70 versiones con fechas registradas. La tabla por cliente y las cifras actuales pueden cambiar si se reabre una entrega o se modifica el mes del plan.
- La falta de fechas antiguas se conserva como ausencia de casos, por ejemplo primera entrega en septiembre. Las decisiones importadas son las que permanecían en cada versión al activar la migración; las que se sobrescribieron antes no pueden recuperarse a partir de ese registro. No interpretar estas duraciones como horas de trabajo efectivo.
- Repetición de Vitest **588 / 32 archivos** y paquete Pages/Worker aprobados. Smoke alojado general pasó y se amplió para comprobar la denegación de la API de estadísticas sin sesión. Evidencia detallada privada en `work/statistics-hosted/report.json`.

El usuario puede recargar el dominio del gestor, seleccionar Gestión y abrir Estadísticas. Los datos se recogen con las acciones habituales. Se sigue trabajando en `feature/internal-statistics`, sin push ni merge a main.
