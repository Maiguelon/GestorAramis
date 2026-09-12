# C05 — entrada de Diseño

Fecha: 2026-09-12. Base: `9142905`. Alcance autorizado: UI/UX de entrada para Eliana. La prueba física de celular quedó a cargo de Miguel para después.

## Entrega

En el menú, Vista de trabajo → Diseño abre directamente producción y recuerda la preferencia por espacio/miembro en este navegador. La sesión sigue siendo la cuenta autenticada; no se asignan roles ni se crea Eliana. Gestión mantiene la pantalla semanal. Su navegación queda plegada para Diseño y siempre accesible.

Las tarjetas priorizan cliente, pieza, etapa y fecha prevista de publicación. Pendientes/Por empezar/En curso tienen cantidades; filtran cliente y búsqueda. Se incluyen fechas futuras y piezas sin fecha. Grabación, tareas de Marketing y pedidos activos de material aparecen en En espera, cerrado inicialmente. No se deduce completitud de tomas a partir de los archivos.

Guion y texto abre la ruta de lectura existente. Material abre directamente esa pestaña del detalle. Empezar a producir usa update-piece con expectedRevision; queda en edición sólo al confirmar. Errores y conflictos conservan el estado; el mecanismo compartido de reintento sigue disponible.

## Archivos

- `src/internal/Workspace.tsx`: preferencia, entrada y navegación, detalle con pestaña inicial.
- `src/internal/work-mode.ts`: clave por entorno/espacio/miembro y lectura segura de preferencia.
- `src/internal/DesignProduction.tsx` y `design-production.css`: cola visual, esperas, filtros, acciones y responsive.
- `src/internal/PieceDetail.tsx`: pestaña inicial opcional; controles de guardado/material existentes conservados.
- `tests/e2e/design-production.spec.ts` y `tests/shared-ui/shared.spec.ts`: recorridos nuevos.

## Evidencia

404 unitarias, 22 recorridos demo y 20 compartidos pasan. Las pruebas compartidas usan Auth/API simulados; incluyen rechazo de revisión obsoleta sin falso cambio de etapa y persistencia después del guardado. Demo comprueba acceso a guion/material, selección/recarga, orden, esperas, filtros y retorno a Gestión. Capturas `work/design-desktop.png` y `work/design-mobile.png` revisadas; 390 px sin desborde ni menú tapando contenido una vez terminada su transición.

Compilación TypeScript/Vite compartida y empaquetado Pages con Worker pasan. Publicado en **https://5d7aaccb.gestor-aramis.pages.dev**, disponible en **https://gestor-aramis.pages.dev**. Smoke alojado aprobado: acceso, rutas y denegación anónima/de otros orígenes incluyendo Drive. En la sesión real existente de Miguel se verificaron selección de Diseño, tarjeta Posteo 01, acceso directo a Material y entrada en Producción tras recargar. No se cambió su etapa ni se cargó más material. El cambio de etapa se probó con API simulada, no modificando la pieza alojada. Infraestructura y credenciales no cambian.

## Probar y retomar

Ingresar al dominio estable y seleccionar Vista de trabajo → Diseño en el menú; en celular abrir primero el menú superior. Recargar conserva Producción. Para volver al panel habitual seleccionar Gestión. Prueba de conexión tiene Posteo 01 listo para producción, suficiente para ver la nueva tarjeta; sus otras piezas siguen en preparación.

Pendiente: feedback de Miguel/Eliana, teléfono físico y regla de tomas completas para reels. La fecha mostrada es publicación prevista; no existe aún una fecha límite separada para Diseño. La preferencia no se sincroniza entre dispositivos. No reiterar OAuth, claves, migraciones o cargas de diagnóstico de Drive. No se modificó la vista del cliente.
