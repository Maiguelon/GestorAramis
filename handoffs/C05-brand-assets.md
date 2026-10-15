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
