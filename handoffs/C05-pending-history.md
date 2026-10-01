# Pendientes, Aprobados e Historial — 2026-09-30

Plan: `docs/PLAN_PENDIENTES_HISTORIAL.md`. Miguel autorizó ejecutar todos los bloques y resolver decisiones rutinarias sin esperar su regreso.

## P1 — Reglas compartidas

Integrados `src/domain/work-lists.ts`, `src/internal/use-aramis-date.ts` y 11 pruebas en `tests/work-lists.test.ts`. Todo lo pendiente como conjunto base; aprobados al final hasta fecha inclusive; históricos por fecha Argentina, sin mutaciones automáticas. Semana lunes–domingo con vencidos y sin fecha. Compatibilidad con programados/publicados antiguos y clasificación transversal Atención. Hook actualiza al cruzar medianoche y recuperar foco.

Verificado: 11 pruebas específicas; la suite de integración en curso alcanzó 487 unitarias. Sin servicios reales por P1.

## Siguiente checkpoint

P2–P5 escritos en el árbol de trabajo; falta cerrar recorridos completos de UI, revisar integración, aplicar nueva migración y publicar. No volver a crear selectores ni renovar OAuth por este cambio. Los agentes no hicieron commits ni tocaron servicios alojados.
