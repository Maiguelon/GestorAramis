# Encabezado compacto de Pendientes — 2026-09-30

Miguel pidió reducir el espacio vacío y alinear título, selector de alcance y Nuevo contenido. Se mueve el selector al encabezado de Pendientes con el botón a su derecha. Escritorio usa una sola fila, con descripción bajo el título; anchos reducidos agrupan los controles en la fila siguiente. Se reduce el margen antes de las categorías. Los encabezados de otras pantallas mantienen su estructura.

Validación: `npm run pages:prepare` compiló TypeScript, interfaz compartida y Worker. Comprobación en demo a 1440, 1024, 390 y 320 px sin desborde horizontal; Esta semana/Todo lo pendiente cambian el alcance y Nuevo contenido abre el formulario. Revisión visual de escritorio y móvil; captura local `work/pending-header-compact.png` (datos ficticios, ignorada por Git). No se agregan tests persistentes para este ajuste de disposición.

Publicado en `https://8098703c.gestor-aramis.pages.dev` y `https://gestor-aramis.pages.dev/`. Smoke del alias pasó: login/rutas de texto, API configurada y rechazos anónimos/origen ajeno, incluidos Drive. No verifica operaciones autenticadas. Sin migraciones, cambios de permisos ni modificaciones de datos reales.

Bloque cerrado. Para verlo, recargar el gestor y entrar a Gestión → Pendientes.
