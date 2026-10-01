# Pendientes, Aprobados e Historial — 2026-09-30

Plan: `docs/PLAN_PENDIENTES_HISTORIAL.md`. Miguel autorizó ejecutar todos los bloques y resolver decisiones rutinarias sin esperar su regreso.

## P1 — Reglas compartidas

Integrados `src/domain/work-lists.ts`, `src/internal/use-aramis-date.ts` y 11 pruebas en `tests/work-lists.test.ts`. Todo lo pendiente como conjunto base; aprobados al final hasta fecha inclusive; históricos por fecha Argentina, sin mutaciones automáticas. Semana lunes–domingo con vencidos y sin fecha. Compatibilidad con programados/publicados antiguos y clasificación transversal Atención. Hook actualiza al cruzar medianoche y recuperar foco.

Verificado: 11 pruebas específicas; la suite de integración en curso alcanzó 487 unitarias. Sin servicios reales por P1.

## Siguiente checkpoint

P2–P5 escritos en el árbol de trabajo; falta cerrar recorridos completos de UI, revisar integración, aplicar nueva migración y publicar. No volver a crear selectores ni renovar OAuth por este cambio. Los agentes no hicieron commits ni tocaron servicios alojados.

## P5 — Recuperación y lecturas del servidor

Backend integrado con contrato `restore-piece`: recuperación explícita a Planificación/Marketing, revisión esperada, membresía, bloqueo e idempotencia en RPC. Se conservan textos, fechas, material, versiones y decisiones anteriores; `invalidatedAt` evita reutilizar una aprobación vieja. No se reactivan enlaces revocados y la pieza recuperada queda interna. Lectura de assets archivados permite consultas staff por pieza y descarga de versión exacta; escrituras, sincronización, carga y papelera siguen bloqueadas. Cliente API y Worker aceptan el comando.

Verificado: 102 pruebas focalizadas de backend/SQL/Drive, suite de 487 unitarias y prueba de interfaz compartida de recuperación con respuesta perdida/reintento UUID único. Nueva migración `202609300001_history_restore.sql` pendiente de aplicación real en este checkpoint. No restaurar piezas reales por inferencia.
