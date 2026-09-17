# C04 — Papelera de material

Fecha: 2026-09-16. Pedido: eliminar material desde el gestor. Miguel eligió habilitarlo también para archivos subidos directamente a Drive.

## Implementación
- Botón por archivo “Mover a la papelera”, confirmación con nombre y efecto para todo el equipo. Bloquea operaciones simultáneas; no desaparece por anticipado. Error conserva la tarjeta para reintentar.
- POST /api/drive/assets/:id/trash verifica sesión y membresía, obtiene el registro privado y valida generación. No admite ID de Drive ni datos de archivo del navegador.
- Google: GET de metadata verifica carpeta/checksum/tamaño/MIME y etiquetas para originales de la app; PATCH trashed:true, nunca DELETE. Archivos ya en papelera permiten completar el registro pendiente sin repetir la escritura.
- RPC privada aramis_drive_trash revalida equipo, workspace, generación y pieza/cliente activos. Oculta el asset, incrementa revisión y registra historial una vez; no cambia estado de producción. Timestamp protege de listados de carpeta iniciados antes del borrado.
- Se solicita drive.file + drive; el alcance amplio permite operar sobre archivos externos. Las conexiones antiguas conservan lectura/carga; papelera externa requiere renovar. UI explica alcance global del permiso frente al límite del código.
- Los permisos propios de Google sobre cada archivo siguen aplicando. No se elimina definitivamente ni se vacía la papelera. Restauración se hace en Drive; importados externos reaparecen en sincronización, originales subidos desde app permanecen ocultos en su registro actual.

## Pruebas y publicación
- Suite completa: 436 tests pasan. 14 recorridos Playwright compartidos pasan, incluyendo cancelar, error, reintento, persistencia de eliminación. Tras sustituir confirmación nativa por modal del gestor, se repitió el recorrido específico y pasó; build final pasa.
- Build Pages pasa. Migración 202609160001_drive_trash.sql instalada en Supabase: Success. No rows returned. NO repetir.
- Publicación final ab348cf1.gestor-aramis.pages.dev, alias habitual actualizado; smoke público pasa el 2026-09-17.
- Consentimiento drive confirmado explícitamente por Miguel y concedido el 2026-09-16. No requiere nueva renovación por esta entrega.
- Prueba real: creado archivo sintético prueba_papelera_20260916.png de 68 bytes en Hugo / Reel 02 y registrado como externo. Verificación final el 2026-09-17: Google responde trashed:true, listado privado contiene los cinco archivos anteriores y excluye el sintético. Historial visible tiene una sola entrada “Material enviado a la papelera de Drive.” del 16/9 18:21, actor Miguel. Pieza permanece en Planificación. No se eliminan definitivamente archivos ni se tocan videos del equipo.
- Google sigue en Testing; la caducidad semanal de OAuth permanece como tarea separada. Configuración declarativa de scopes del proyecto Google no fue editada en esta entrega; el consentimiento y token efectivos sí incluyen drive.
