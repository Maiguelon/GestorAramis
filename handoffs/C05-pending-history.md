# Pendientes, Aprobados e Historial — 2026-09-30

Plan: `docs/PLAN_PENDIENTES_HISTORIAL.md`. Miguel autorizó ejecutar todos los bloques y resolver decisiones rutinarias sin esperar su regreso.

## P1 — Reglas compartidas

Integrados `src/domain/work-lists.ts`, `src/internal/use-aramis-date.ts` y 11 pruebas en `tests/work-lists.test.ts`. Todo lo pendiente como conjunto base; aprobados al final hasta fecha inclusive; históricos por fecha Argentina, sin mutaciones automáticas. Semana lunes–domingo con vencidos y sin fecha. Compatibilidad con programados/publicados antiguos y clasificación transversal Atención. Hook actualiza al cruzar medianoche y recuperar foco.

Verificado: 11 pruebas específicas; la suite de integración en curso alcanzó 487 unitarias. Sin servicios reales por P1.

## Siguiente checkpoint

P2–P5 integrados y verificados; migración aplicada. Falta publicación y smoke remoto. No volver a crear selectores ni renovar OAuth por este cambio. Los agentes no hicieron commits ni tocaron servicios alojados.

## P5 — Recuperación y lecturas del servidor

Backend integrado con contrato `restore-piece`: recuperación explícita a Planificación/Marketing, revisión esperada, membresía, bloqueo e idempotencia en RPC. Se conservan textos, fechas, material, versiones y decisiones anteriores; `invalidatedAt` evita reutilizar una aprobación vieja. No se reactivan enlaces revocados y la pieza recuperada queda interna. Lectura de assets archivados permite consultas staff por pieza y descarga de versión exacta; escrituras, sincronización, carga y papelera siguen bloqueadas. Cliente API y Worker aceptan el comando.

Verificado: 102 pruebas focalizadas de backend/SQL/Drive, suite de 487 unitarias y prueba de interfaz compartida de recuperación con respuesta perdida/reintento UUID único. Nueva migración `202609300001_history_restore.sql` aplicada una vez, éxito confirmado en Supabase. No repetirla. No restaurar piezas reales por inferencia.

## P2–P4 — Integración de interfaz

Gestión abre Pendientes con Todos/Esta semana, fecha ascendente, Atención separado primero y proceso Planificación/Para producción/Revisión/Aprobados. Los conteos y filas se filtran por cliente/área/búsqueda. Aprobados van al fondo hasta su fecha inclusive; las piezas sin fecha permanecen. No se exige programar/publicar; los datos legacy siguen legibles.

Diseño mantiene Producción y Calendario directos. Selector consulta Para producción (default), En espera, Revisión y Aprobados con conteos. Cambiar modo resetea la entrada, búsqueda/cliente quedan disponibles y las devoluciones siguen destacadas. Desktop y móvil revisados en `work/design-final-desktop.png`, `work/pending-desktop.png`, `work/pending-mobile.png` y `work/history-desktop.png` (artefactos locales ignorados).

Historial conserva completados en calendario/mes; consulta de archivadas no dispara folder/sync/upload/trash. Entrega muestra las versiones exactas enviadas y un desplegable de originales finales, incluidos borradores nunca enviados. Texto y respuesta anteriores se conservan, aprobación invalidada se identifica como versión anterior. Recuperación tiene confirmación, revisión esperada y reintento por UUID. El modal permanece en consulta si una respuesta perdida deja el comando pendiente.

P2–P4 se integran en un checkpoint de interfaz porque comparten Workspace, menú y apertura de detalles; así no se deja un commit con rutas o imports incompletos. P1 y el backend de P5 tienen checkpoints propios y pruebas independientes.

Verificación: 487 unitarias; 28 recorridos demo cubiertos con repeticiones de expectativas antiguas y mes del fixture explícito; 25 recorridos compartidos cubiertos entre suite y repeticiones focalizadas. Se corrigieron locators que suponían Producción lateral, pasos programar/publicar, y nombre accesible de Pendientes estable aunque cambie el badge. No fue una falla de carga de archivos. Test shared nuevo confirma material archivado/originales finales sin writes, versión exacta de entrega y recuperación con respuesta perdida/idempotencia.

## Evidencia alojada

2026-09-30: SQL Editor de Supabase confirmó `Success. No rows returned` al aplicar la migración. Luego la prueba bajo rol authenticated y claim de la membresía de Miguel retornó `hosted_restore_verified_with_rollback = true`. Creó cliente/pieza temporales, archivó/recuperó y reintentó el mismo requestId; preservó textos y creó una sola actividad. Revisión antigua rechazó CONFLICT. Rollback eliminó todos los efectos de prueba; no hubo piezas reales restauradas, provider files ni OAuth modificados. Esta prueba de RPC no sustituye prueba personal de Eric/Eliana ni un restore desde navegador de producción.

Próximo y único paso técnico de este bloque: publicar paquete Pages y smoke remoto; después feedback del equipo. No ejecutar correos ni portal cliente en esta entrega.
