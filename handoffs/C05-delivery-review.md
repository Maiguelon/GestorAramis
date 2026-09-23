# Entrega, revisión y correcciones — 2026-09-23

Estado: integrado y publicado, con prueba real controlada. Base anterior 952f5c9. Despliegue final https://bc8f6c24.gestor-aramis.pages.dev, alias https://gestor-aramis.pages.dev.

## Uso

1. Desde Producción, abrir Entrega en una pieza; subir archivos terminados.
2. Seleccionar los archivos que integran la versión, ajustar su orden y comprobar el texto guardado en Detalles.
3. Enviar a revisión. La carga por sí sola no mueve la pieza.
4. En Entrega, el equipo registra aprobación o cambios, indicando origen Equipo/Cliente. Para cambios se exige motivo; la pieza vuelve a Diseño / Lista para producir y muestra el motivo arriba y en la tarjeta.
5. Subir/seleccionar la corrección y reenviar. Se conserva la versión anterior con su texto, archivos y respuesta.
6. Aprobar habilita los registros de Programado y Publicado existentes; no publica en redes ni envía mensajes.

## Persistencia y permisos

Migración supabase/migrations/202609220001_deliveries.sql aplicada una única vez en SQL Editor alojado, Success. No rows returned. No volver a aplicarla. No se cambiaron credenciales, OAuth, compartición ni cuentas. Tabla app_private.deliveries con RLS y sin grants públicos. Comandos submit-delivery y review-delivery dentro del bloqueo de workspace, validación de membresía, expectedRevision e idempotencia existentes. No se admite decidir una entrega anterior ni saltarse el flujo con edición genérica de estado/texto; publicado queda protegido.

Purpose se deriva del mapping persistido de la carpeta, no de un dato libre del navegador. Entregas separado del material, también en listados. La carga fija driveRevisionId con keepForever antes del registro final. Streaming y descarga de entregas leen la revisión fijada, incluso si cambia el head de Google; si no se puede verificar falla cerrado. Viewer Google mutable se rechaza para entregas, permanece disponible para material. No se permite enviar a papelera archivos de Entrega. Ningún dato nuevo se expone en PublicPiece.

## Evidencia

- 466 pruebas Vitest en 16 archivos pasan antes del último ajuste. Incluye cuatro escenarios SQL con PGlite aplicando todas las migraciones: orden/texto/versiones, conflictos/idempotencia, estados, referencias inválidas y permisos.
- Ajuste final: ignorar subcarpetas en el listado plano de Material sin advertir falsamente de archivos omitidos. Nueva prueba y 72 pruebas focalizadas de drive-import/drive-service pasan. Total actual de casos: 467, sin repetir la suite completa por este ajuste focalizado.
- Compartido: ejecución general 23 aprobados/1 expectativa obsoleta fallida; actualizado el caso que esperaba la vieja pestaña deshabilitada. Reejecución de shared.spec + delivery.spec: 8 aprobados. Los 24 casos quedaron cubiertos; recorrido completo delivery.spec repetido tras último ajuste: 1 aprobado.
- 22 recorridos demo aprobados. Prueba de entrega incluye subida simulada, selección/orden, conflicto, devolución requerida, tarjeta de Diseño, segunda versión, historial, aprobación, texto bloqueado, programación, recarga y ancho móvil de 390 px sin desborde. No equivale a teléfono físico.
- Build TypeScript/Vite/Pages y control de secretos del paquete aprobados. Smoke alojado final exige autenticación también en delivery-assets y rechaza otros orígenes.
- Prueba real en sesión de Miguel: pieza [Prueba técnica] Entrega 22-09, ID 7b58ad23-0815-436c-82fc-e55f980a8daa, bajo Hugo. PNG sintético de 67 bytes, asset e203169c-01b2-4188-b5fa-89211b64ab51. Subida real, v1 en revisión, devolución atribuida al cliente, vuelta a Diseño con motivo visible, texto corregido v2, aprobación y estado Programado confirmados. Se reutilizó el PNG para v2; no se modificaron piezas reales.
- Consulta privada de la revisión Google confirmó keepForever=true y descarga idéntica al PNG. Imágenes de ambas versiones cargadas en la UI; Material permanece vacío. Carpeta propia de pieza 1A0z0ZweTs3vATiFEvdoAMl5ivqYZeFS7, Entregas 1ibJrVlhx7wyDepVo_2kSCJ3SK_wCQiZd.
- Limpieza: pieza técnica ARCHIVADA por UI; modal cerrado y cinco pendientes reales de Diseño visibles. Se conservan historial y diminuto archivo de prueba, sin borrado definitivo.

Logs locales ignorados work/delivery-{all-tests,polish-tests,focused-ui,final-ui,demo-ui,final-deploy,final-smoke,pin-evidence}.txt y captura work/delivery-mobile.png. No commitear helpers/secretos de work ni .dev.vars.

## Límites y próxima acción

Recoger feedback del equipo con archivos terminados representativos. No se probó como Eliana ni desde teléfono real; sí layout móvil y subida sintética alojada. MOV de Entrega requiere descarga para revisión exacta; Material mantiene Google Viewer. No se importan entregas cargadas directamente en Drive: usar el gestor para fijar su revisión. La sincronización de tomas originales sigue funcionando.

No hay eliminación de borradores de Entrega ni límites de historial paginado en este bloque. Máximo 100 archivos por versión, 2 GiB por archivo; ZIP hasta 256 MiB. keepForever no sustituye backup ni evita que alguien borre el original fuera del gestor. Demo conserva revisión anterior; este flujo nuevo es del espacio compartido.

OAuth External/Testing sigue pendiente separado: una autorización del 16/09 podría requerir reconexión a los siete días; no confundir ese plazo con una fecha de verificación obligatoria. No se cambió el modo de publicación Google. Calendario/acciones remotas de cliente continúan fuera de este bloque.
