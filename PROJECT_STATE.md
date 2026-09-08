# Estado del proyecto

Fecha: 2026-09-07. Checkpoint previo: 0700e7f. Este bloque retoma y termina el trabajo interrumpido por límite de uso.

## Entrega actual — lista para prueba interna
- Clientes: alta y datos/plan mensual editables; generar base una vez por mes, completar faltantes, editar filas, agregar extras sin título, quitar archivando. Sin distribución automática de fechas ni drag and drop.
- Producción: pendientes globales de producción (también futuros), filtros cliente y Marketing/Diseño, etapas lista/grabación/edición. Preparación separada; guion privado por pieza. El mes del plan puede editarse en detalle, independiente de fecha prevista.
- Calendario interno: altura fija, dos tarjetas por día y +N abre todas. Sin fecha sólo del mes seleccionado; semana no trae bases sin fecha de meses futuros.
- Material equipo: archivos en IndexedDB, hasta 100 MB por archivo, preview imagen/video y descarga persistente. Pedidos al cliente quedan plegados como excepción. Nada en Drive; sólo el mismo navegador. Exportación JSON no incluye blobs; limpiar datos del sitio borra todos los archivos, reset de demo sólo vuelve a metadata inicial.
- Datos antiguos se leen sin reset. Nombres de fixtures nuevas Miguel/Eliana/Eric; IDs previos conservados. Sigue sin usuarios reales ni sesión compartida.
- Vista del cliente sin rediseño; nuevos datos internos quedan excluidos de su proyección.

## Evidencia
- npm test: 186 pruebas / 6 archivos pasan (incluye base mensual y compatibilidad de datos antiguos).
- npm run build: pasa; compilación TypeScript incluida.
- npx playwright test --reporter=list: 17 recorridos pasan, escritorio/móvil, densidad calendario, ediciones concurrentes y video generado de prueba reproducible/descargable después de recargar.
- QA visual en work/qa (ignorado en Git), escritorio 1440 y móvil 390. Worker no modificado; dry-run previo, ninguna prueba de servicios reales ni despliegue.

## Cómo probar con Eliana
npm run dev y abrir http://127.0.0.1:5173/. Clientes → Trabajar mes → Editar datos y plan → Generar base → editar pieza/guion → Listo para producción. Eliana abre Producción, filtra Diseño y revisa Material. Usar archivos de prueba pequeños. Todo en el mismo navegador/equipo.

## Pendiente
Esperar devolución de Miguel y Eliana. Sin ampliar POV cliente ahora. Supabase/Google/Cloudflare/correo siguen pendientes; Worker cerrado 503/501. Nuevos campos de cliente/plan/producción/archivos todavía necesitan migración SQL privada y adaptadores remotos; agregar claves no habilita la V1. Leer handoffs/C05-monthly-production.md y docs/SETUP antes de integrar servicios.
