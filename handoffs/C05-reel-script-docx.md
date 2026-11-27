# C05 — Guion de reel en Word

Fecha 2026-11-27. Integrado en el gestor del equipo y publicado en `af89ea50.gestor-aramis.pages.dev` desde `feature/internal-statistics`.

La caja **Texto de la pieza** muestra **Descargar guion** junto a **Abrir texto completo** cuando el formato guardado es Reel y tiene guion. Guardar o descartar las modificaciones del formulario habilita la descarga de la versión guardada. Un Word editable en A4 contiene el título, los clientes y el campo de guion e instrucciones. El texto conserva párrafos, tabulaciones y Unicode. Las líneas iniciales de bloques se mantienen junto a su texto al imprimir. El archivo es una copia local que se puede editar para la grabación. Se genera a partir del estado ya disponible en el detalle del equipo, sin petición adicional a la API.

- Verificación automática. Pasaron `npm.cmd test` (598), el recorrido focalizado de Word después del ajuste de paginación, la repetición de `tests/zip.test.ts`, 20 recorridos compartidos de Drive y texto, y 6 recorridos del demo de texto, multicliente y ZIP.
- Documento. La descarga con datos ficticios a 390 px contiene el texto guardado y deja fuera caption, notas y borrador. Se abrió y se volvió a guardar un cambio. Se renderizó e inspeccionó el ejemplo largo de tres páginas en A4, con los inicios de escena junto a su texto. La prueba no incluyó impresión física.
- Producción. `npm.cmd run pages:prepare` completó TypeScript, el empaquetado y la comprobación de secretos. `npm.cmd run pages:smoke -- https://gestor.aramis.agency` pasó. El archivo publicado `/assets/index-CyTHCMXx.js` coincide byte a byte con el local (SHA-256 `f795b6a6765bd43ee49aafa35b264ae443f05d18d3d0dd864822f50887b4c478`). La descarga se verificó con datos ficticios y el dominio se comprobó sin iniciar sesión.

Para revisar, recargar el gestor del equipo, abrir un reel con guion y pulsar **Descargar guion**.
