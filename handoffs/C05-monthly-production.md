# C05 — Trabajo mensual y producción

## Alcance integrado
Cliente editable y plan de posteos/reels. Base mensual explícita completa déficit sin duplicar; extras sin título permitido. Filas editables y archivo de piezas. Concurrencia cliente y pieza protegida por revisión esperada; borrador de fila no se pisa desde otra pestaña. Datos viejos conservados.
Producción separada de preparación con área/etapa y guion privado. Material propio previsualizable/descargable, almacenado localmente. El calendario interno extraído mantiene altura y lista por día.

## Evidencia
186 unitarias y 17 E2E pasan; build pasa. monthly.test.ts cubre generación, extras, archivo sin regeneración, cambios de plan, límites, compatibilidad y proyección privada. monthly.spec.ts verifica el recorrido Miguel→Eliana, persistencia de video real de prueba generado con MediaRecorder y descarga byte a byte, concurrencia y ancho móvil. calendar-density.spec.ts verifica agrupación/foco y altura. QA visual revisado.

## Límites y siguiente paso
Sólo demo local; cliente POV diferido por pedido del usuario. IndexedDB no comparte archivos; máximo 100 MB cada uno, cuota del navegador aplica. JSON exporta metadata; reset no borra blobs huérfanos, limpiar datos del sitio sí. Plan actual no mantiene historia de cantidades contratadas; no regenera bases tras editarlo. Material pendiente de vinculación tras conflicto requiere resolver o descartar antes de salir. Archivos de carga fallida pueden quedar huérfanos localmente hasta limpiar el sitio.
Faltan migraciones SQL privadas de estos nuevos campos y repositorios/handlers remotos. No crear cuentas, conectar Drive ni desplegar en este bloque. Próximo paso: prueba de Miguel y Eliana y ajustes derivados.
