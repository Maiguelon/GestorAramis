# C01 / C05 / C09 — aplicación y coordinación local

Estado al 2026-09-07: **integrado localmente**, pendiente de API remota. Sin cuentas, mensajes ni despliegues realizados.

## Entrega

Panel con próximos siete días, vencidos y sin fecha; contadores consistentes con ese alcance, búsqueda y filtros por marca/responsable. Los pedidos vencidos aparecen aunque la publicación esté lejos. En móvil el próximo paso y su actor siguen visibles.

Alta de contenido, comienzo de producción, editor con fecha/responsable/visibilidad/nota privada, revisión, material e historial. Un pedido compartido puede abrirse sin incluir la pieza en calendario. Las solicitudes se prueban en otra pestaña del mismo navegador y sus respuestas actualizan el panel.

Revisiones con muestra gráfica local y texto congelado; nueva versión invalida anterior. Publicación manual de estados; el editor protege publicado y advierte cambios sin guardar. Crear una revisión requiere `expectedRevision`: no reemplaza una edición o aprobación reciente desde un formulario viejo.

Mensajes editables para copiar y registro explícito de envío. Texto demo identificado, sin abrir WhatsApp ni contactar destinatarios. Cambiar de revisión reinicia el formulario WhatsApp y el mensaje: no se arrastra una respuesta o un link viejo a la versión actual.

Radix en modales y pestañas, foco contenido/restaurado, tipografías locales y colores de marca. Preview interno revisado en navegador integrado; QA móvil y cliente según C06-C08.

## Evidencia

`npx playwright test --reporter=list`: **13/13** recorridos aprobados. Los seis internos cubren:

- Crear → producir → pedir/recibir/verificar material → revisión → cambios → nueva versión → aprobar → programar → publicar.
- Revisión vieja versus edición concurrente: rechaza sin perder texto vigente.
- Formulario de respuesta WhatsApp y mensaje editado versus nueva revisión: no trasladan aprobación ni link.
- Borrador sin guardar bloquea publicar y cambio de sección; se puede guardar o descartar.
- Dos pestañas editando detalles: conflicto explícito y persistencia tras recarga.
- Pedido vencido con publicación lejana y siguiente actor visible en móvil.

`npm run typecheck`, `npm run build` y `npm run worker:check` pasaron. Worker dry run confirma empaquetado del scaffold; no despliegue ni integración cloud.

## Próxima acción

Backend transaccional y adaptadores autorizados según ROADMAP. Preservar pruebas, contratos y fixtures; no rehacer la UI. Agregar cobertura contra servicios reales sólo cuando existan cuentas. La selección de archivos actual simula exclusivamente metadatos, no subida ni almacenamiento binario.
