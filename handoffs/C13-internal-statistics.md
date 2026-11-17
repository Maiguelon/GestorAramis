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

La migración y el despliegue de producción quedan pendientes. Las pruebas locales usan registros ficticios y no verifican la cobertura del historial real.

## Verificación local

- `npm.cmd test`: 588 pruebas en 32 archivos. Se verifica en PostgreSQL el cálculo, cierre de mes local, revisión interna, decisiones al reabrir, conteo multicliente y denegación por miembro, cliente, sesión anónima y workspace.
- `npx.cmd playwright test --config playwright.shared.config.ts tests/shared-ui/statistics.spec.ts tests/shared-ui/shared.spec.ts`: 14 casos distintos aprobados entre la suite compartida y la repetición focalizada de Estadísticas. La ejecución inicial necesitó instalar el navegador de prueba y el caso en móvil expuso una etiqueta de filtro; ambas condiciones se resolvieron.
- `npm.cmd run typecheck` y `npm.cmd run pages:prepare`: aprobados, incluida la compilación del Worker y verificación de secretos del paquete.
