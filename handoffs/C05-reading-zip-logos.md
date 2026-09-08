# Lectura de producción, ZIP y logos

## Entrega
ClientAvatar reutilizable con tres logos originales copiados de public/img/clientes del proyecto vecino. Mapeo explícito como muestras: client-oliva Aura, client-norte Beecomex, client-bruma Musas. No cambia la data ni requiere reset. Fallback iniciales para clientes nuevos/error de imagen.
PieceText: ruta interna /text/:pieceId, lectura grande de script/caption/internalNote. Suscripción al workspace local actualiza desde otras pestañas. Abrir requiere detalles guardados. No publicada como página de cliente; production mode permanece bloqueado.
TeamMaterials: ZIP completo, CRC32 por bloques de 1 MB, conserva blobs, sin compresión ni nuevas dependencias. Límite 2 GB/65534 entradas, nombres UTF8 únicos/seguros. Fuentes sólo IndexedDB y SVGs demo allowlist. Missing/read error aborta paquete y conserva vista/descarga individual.

## Evidencia
190 unitarias y20 E2E pasan; build pasa. ZIP reader independiente valida offsets, directorio, CRC (Node) y bytes; E2E descarga dos nombres iguales y falla sin ZIP parcial al borrar un archivo del navegador. Text E2E comprueba popup, borrador sin guardar, actualización, archivo de pieza y móvil. Logos se cargan manteniendo nombres. QA visual revisado en work/qa.

## Límites
ZIP almacenado no reduce tamaño de videos. No upload de logos; referencias visuales fijas en clientes ficticios, no asignación real. Datos locales solamente; la ruta interna necesita auth en futuro backend. No se alteró entrada predeterminada de Eliana ni se impusieron reglas nuevas de material completo para reels; esas decisiones quedaron anotadas para después.
