# Avisos internos por correo — 2026-09-30

Alcance autorizado: Diseño recibe entradas/devoluciones a producción; Marketing recibe entregas nuevas en revisión. Cada persona configura su área explícitamente, independientemente de la vista del navegador y del responsable de una pieza. Resumen diario a las 09:00 de Argentina por defecto, con opciones inmediato, cada hora o cada seis horas; horario diario editable y opción de pausar.

## Bloques

- N1: preferencias privadas, transiciones y cola persistida en la misma transacción de negocio. Sin avisar por una edición de texto, por tomas aún en grabación ni por trabajo previo a activar las preferencias.
- N2: despachador programado en un Worker separado; agrupación por persona, sólo novedades aún accionables, lease para ejecuciones concurrentes y cuerpo inmutable por envío. Reintentos usan una única clave de Resend; si se pierde certeza más allá de su ventana, revisión manual en vez de reenvío ciego. Envío apagado por defecto.
- N3: configuración en el gestor y enlaces del correo a la pieza, con autenticación habitual. Guardar preferencias debe ser idempotente y proteger cambios concurrentes. Demo claramente local sin simular correos.
- N4: verificación local de SQL/autorización/cola y proveedor simulado, interfaz escritorio/móvil y compilación. Aplicar migración y publicar configuración con envío desactivado cuando estén verificados.
- N5: cuenta Resend, dominio remitente verificado y secreto servidor; definir áreas iniciales del equipo explícitamente, comprobar correo real con Miguel y activar envíos. Sin credenciales, este bloque queda pendiente y no se afirma entrega real.

Los avisos son de novedades, no recordatorios diarios de la misma tarea vencida. El tiempo de cada etapa y las notificaciones del cliente quedan para bloques posteriores. La aprobación del proveedor se distingue de la llegada a la bandeja de entrada.

Referencias: [Resend envío](https://resend.com/docs/api-reference/emails/send-email), [claves de idempotencia](https://resend.com/docs/dashboard/emails/idempotency-keys), [Cloudflare Cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

## Cierre — 2026-10-01

N1–N5 integrados y verificados. SQL instalado y pruebas alojadas con rollback exitosas; 525 unitarias, 27 recorridos compartidos, compilación y smoke público aprobados. Resend muestra sent y delivered de un único correo con dos piezas sintéticas a Miguel; batch e identificación de proveedor en `handoffs/C11-email-notifications.md`. Prueba archivada y preferencias del equipo verificadas: Eliana Diseño, Miguel/Eric Marketing, diario 09:00 Argentina. Pages y Worker programado activos. Guardado autenticado de preferencias confirmado en el sitio y persistente tras recarga.

Pendientes separados: feedback del equipo con novedades reales, reconciliación manual de envíos inciertos si aparece alguno, SMTP de Auth, vistas/correos de clientes y métricas. No se afirma prueba de recepción con identidad de Eliana/Eric ni lectura de la bandeja de entrada de Miguel.
