# Historial y clientes retirados — 2026-10-13

## Problema y solución

Archivados producía `Cannot read properties of undefined (reading 'name')`, confirmado en el sitio real. `aramis_workspace` excluye clientes con archived_at pero devuelve sus piezas antiguas. WorkspaceHistory asumía una relación presente para todas las filas. No era un fallo por lista vacía.

La pantalla ahora relaciona cada pieza con un cliente del catálogo disponible antes de renderizar, buscar o contar. Completados y Archivados omiten piezas cuyo cliente ya no se ofrece en ese catálogo; el nombre y avatar usan la misma relación comprobada. Los registros siguen en la base. No se habilita recuperación de clientes retirados, que los comandos existentes rechazan. Consultar/restaurar piezas de clientes vigentes conserva su comportamiento.

## Pruebas

- Nuevo test compartido `historial vacío y piezas de clientes retirados no interrumpen la navegación`: reprodujo el TypeError antes de la corrección. Después pasa con catálogo vacío, registros mixtos, búsqueda sin resultados y sin modificaciones del estado o comandos remotos. Tiempo fijado para clasificar las aprobadas de manera reproducible.
- `npm.cmd run test:e2e:shared -- tests/shared-ui/shared.spec.ts --grep "historial vacío|archivada consulta"`: dos recorridos aprobados, incluyendo consulta de archivos archivados y recuperación idempotente. Auth/API/Drive simulados.
- `npm.cmd run test:e2e -- tests/e2e/pending-history.spec.ts --reporter=list`: cinco recorridos demo aprobados: orden, filtros, cortes de fecha, historial y recuperación.
- `npm.cmd run pages:prepare`: TypeScript/Vite compartido y Worker aprobados. Sin dependencias nuevas.
- Publicación `https://9a119ba7.gestor-aramis.pages.dev`, alias `https://gestor-aramis.pages.dev/` actualizado. `npm.cmd run pages:smoke -- https://gestor-aramis.pages.dev`: aprobado.
- Comprobación alojada con la sesión existente: Completados mostró siete piezas y Archivados quince; sin nuevos errores de consola. Sólo navegación/lectura, sin restaurar, archivar, editar o crear registros reales.

## Alcance y continuidad

Bloque cerrado. Recargar → Gestión → Historial → Archivados. No se cambian SQL, permisos, archivos Drive ni correo. Un futuro archivo integral de clientes retirados requeriría una proyección y acciones explícitas; no se amplía ese alcance para corregir este fallo. Las vistas reales de clientes siguen pendientes del siguiente pedido.
