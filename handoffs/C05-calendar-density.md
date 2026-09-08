# C05 — Densidad del calendario interno

## Alcance
- Componente independiente `src/internal/InternalCalendar.tsx`, con los mismos props que el calendario anterior.
- Celdas y semanas de altura fija. Cada día muestra hasta dos piezas y un botón `+N más` para consultar todas las que coinciden con los filtros activos.
- El número del día también abre la lista. La lista muestra cliente, formato, título y estado, y permite abrir una pieza directamente.
- Navegación por teclado, cierre con Escape y restauración del foco mediante el componente Modal compartido.
- En móvil, las siete columnas caben dentro de la pantalla; el panel del día permite leer títulos completos.
- Sin cambios en el calendario ni permisos del cliente, almacenamiento o fechas de las piezas.

## Prueba
`npx playwright test tests/e2e/calendar-density.spec.ts --reporter=list`

El recorrido concentra las piezas de ejemplo con títulos largos en un día, comprueba alturas iguales, dos tarjetas visibles y lista completa; verifica teclado, foco, ancho móvil y apertura de una pieza oculta por el límite.

## Estado de integración
Integrado y verificado por el coordinador. La prueba de densidad pasó dentro de los 17 E2E del cierre; build también pasó. Los contenidos sin fecha corresponden al mes del plan seleccionado.

## Limitaciones
Los títulos se truncan en la cuadrícula para preservar la altura. Se leen completos en el panel del día. La vista conserva seis semanas y no redistribuye fechas automáticamente.
