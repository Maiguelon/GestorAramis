# Icono A con pluma — 2026-10-16

## Alcance y resultado

Miguel pide sustituir la pluma sola por la marca combinada A+pluma. Se reutilizan los contornos vectoriales originales de la A y la pluma, con la superposición y proporciones de los PNG locales inspeccionados en el bloque anterior. Se extraen las rutas de sus clips originales, evitando definiciones redundantes; no se traza ni se genera una marca distinta. `public/brand/a-feather.svg` tiene fondo transparente, lienzo cuadrado de origen cero y relleno azul institucional/claro según el tema del navegador.

Se actualizan favicon de root/About/Privacy, manifest e icono de compatibilidad. La nueva ruta permite que el navegador detecte el cambio. Los wordmarks y el resto de la interfaz conservan su aspecto. No se accede nuevamente a Drive ni se cambian archivos originales, datos, permisos, OAuth o correo.

## Verificación y publicación

- `npm.cmd run pages:prepare`: TypeScript, Vite, compilación Pages y control del paquete sin secretos aprobados.
- Render real con Chromium a 128/32/16 px en ambos temas; inspección de `work/brand-a-feather-light.png` y `work/brand-a-feather-dark.png` aprobada. No se afirma inspección del chrome nativo de pestañas.
- Publicado **b97333ec.gestor-aramis.pages.dev** y alias propio actualizado.
- `npm.cmd run pages:smoke -- https://gestor.aramis.agency`: aprobado, con SVG/manifest/referencias HTML nuevos, páginas públicas y rutas privadas protegidas. Sin operaciones autenticadas ni tests nuevos para un cambio cosmético.

Próxima acción: Miguel puede recargar https://gestor.aramis.agency/ para comparar el icono. Si una pestaña antigua conserva el anterior, cerrarla y volver a abrir el gestor. No hay configuración adicional pendiente por este cambio.

# SVG de marca e icono de pluma — 2026-10-15

## Alcance

Miguel solicita reutilizar el SVG del logo en los lugares restantes, quitar el bloque azul del ingreso/carga y sustituir la A genérica de la pestaña por la pluma. Proporciona la carpeta Drive Apluma, inspeccionada sólo en lectura mediante el conector Google Drive. Contiene dos PNG de 3000×3000 con la marca A+pluma en colores inversos; se descargaron a `work/feather-source-1.png` y `work/feather-source-2.png` para inspección. No se modificaron archivos ni permisos de Drive.

El logo usado previamente ya era el SVG entregado por Miguel. El recuadro se originaba en CSS. Se conserva el SVG claro original para fondos oscuros; `public/brand/aramis-ink.svg` conserva su geometría y cambia sólo el relleno al azul institucional para fondos claros. Se usa en StaffAccess (ingreso, carga y error de acceso), fallback de error general y cabecera/pie de las vistas demo de clientes. Se quitan los fondos/padding que formaban placas en ingreso y cabecera de cliente. Sidebar y cabeceras públicas ya usaban el SVG original sobre el fondo oscuro.

La misma pluma observada en los PNG está en los dos primeros grupos del SVG original. Se extrajeron esos grupos y sólo sus diez definiciones de clipping referenciadas a `public/brand/feather.svg`, con lienzo cuadrado y color según tema claro/oscuro. No se trazó una figura nueva ni se modificaron imágenes raster. La versión inicial con viewBox de origen desplazado se veía en documento pero no dentro de una imagen; antes de publicar se corrigió usando viewBox de origen cero y un grupo trasladado, y se verificó el render real a 16, 32 y 128 px en ambos temas.

Root HTML, About, Privacy y manifest apuntan a la ruta nueva, evitando reutilizar la ruta anterior en la caché de favicon. `public/icon.svg` también contiene la pluma por compatibilidad. No se genera icono Apple específico ni se cambian instalaciones existentes del sitio.

## Verificación y publicación

- TypeScript/Vite/Pages y control del paquete sin secretos aprobados.
- Smoke local Pages aprobado; smoke permanente comprueba también recurso SVG, referencias de favicon y manifest. Se conservan comprobaciones de información pública, login/texto protegidos y API anónima/de otro origen.
- QA visual: ingreso sin fondo azul y SVG legible; pluma en tamaños 16/32/128 y temas claro/oscuro. Capturas ignoradas `work/brand-login-local.png`, `work/brand-feather-light.png`, `work/brand-feather-dark.png`.
- Publicado **71058e28.gestor-aramis.pages.dev**, alias propio actualizado. Smoke remoto aprobado sin overrides de DNS. Navegador anónimo contra el dominio propio confirmó `/brand/feather.svg`, logo `/brand/aramis-ink.svg` cargado y fondo del contenedor rgba(0,0,0,0). Captura `work/brand-login-hosted.png`.
- Cambio visual: sin tests nuevos de implementación ni repetición de suites de negocio. No hubo login con credenciales reales, guardados, cambios de SQL/cuentas, OAuth ni correos. Se cerró el preview local al terminar.

Para verlo, recargar https://gestor.aramis.agency/. Si una pestaña existente conserva el favicon anterior, cerrarla y abrir nuevamente el sitio. Google Branding/producción permanece como pendiente separado del bloque anterior.
