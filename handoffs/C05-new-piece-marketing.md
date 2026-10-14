# Nuevo contenido inicia en Marketing — 2026-10-13

Miguel solicita retirar la elección Marketing/Diseño del alta, porque texto y material se cargan después de crear. `CreatePiece` en Workspace.tsx elimina el selector Área y envía workArea=marketing explícitamente. La pieza comienza en Planificación mediante el comportamiento existente. El alta desde Clientes ya enviaba Marketing. No requiere migración ni dependencias.

Validación:
- `npm.cmd run test:e2e -- tests/e2e/internal.spec.ts --grep "recorrido del equipo" --reporter=list`: un recorrido existente aprobado, desde creación hasta aprobación de la versión en demo local.
- `npm.cmd run pages:prepare`: compilación TypeScript/Vite compartida y Worker aprobada.
- Publicado en `https://57cc81f6.gestor-aramis.pages.dev`; alias `https://gestor-aramis.pages.dev/` actualizado.
- `npm.cmd run pages:smoke -- https://gestor-aramis.pages.dev`: aprobado, incluyendo rutas protegidas y rechazo anónimo/de otro origen.
- Comprobación con sesión alojada existente: Nuevo contenido muestra título, cliente, formato y fecha sin Área. Se cerró el formulario vacío sin guardar; la preferencia Diseño previa se restauró y se cerró la pestaña temporal. No se afirma un alta nueva sobre Supabase real.

Bloque terminado. Recargar → Gestión → Nuevo contenido. Decisión D28. Próxima fase de vistas reales de clientes sigue pendiente del pedido de Miguel.
