# Páginas públicas para Google OAuth — 2026-10-15

## Alcance autorizado y decisiones

Miguel solicita crear Homepage y Privacy en inglés y aporta un SVG del logo. Confirma explícitamente el uso público de miguelcarreteroangel@gmail.com como correo de soporte/privacidad. Decisión D31. No se necesitan más definiciones de producto para estas dos páginas. Publicar las páginas dentro del gestor es parte de este bloque; cambiar la audiencia OAuth o tramitar la verificación no lo es.

## Implementación

- `public/acerca/index.html`: presentación breve del gestor, trabajo interno de marketing/diseño, funciones Drive, acceso por cuenta de equipo y contacto. URL canónica https://gestor.aramis.agency/acerca/.
- `public/privacidad/index.html`: política de la versión interna actual, efectiva 15/10/2026. Explica datos, propósitos, Google OAuth drive.file + drive, material/revisiones, proveedores, seguridad/sesiones, retención, papelera, eliminación manual, revocación y contacto. URL canónica https://gestor.aramis.agency/privacidad/.
- HTML estático sin scripts ni importación de la app. No necesita login ni configuración Supabase para renderizar y no consulta datos privados. `public/info/site.css` usa Lato servido localmente; licencia copiada junto a las dos fuentes desde la dependencia ya existente. Sin dependencias nuevas.
- Se reutiliza `/brand/aramis.svg`: SHA-256 del SVG de Descargas y del existente coincide exactamente. No se modifica el original ni otro proyecto.
- Enlaces desde la pantalla de acceso y desde el texto previo a la conexión de Drive. Raíz, flujo de Auth, callback, cookies y API conservados.
- Cabeceras CSP sólo para las dos rutas públicas: sin scripts/conexiones externas, formularios ni framing; fuentes e imágenes del mismo origen. Se mantiene noindex, que no impide la lectura pública. El servidor de API sigue requiriendo sesión.

La política se redactó contra el funcionamiento actual, no como promesa de funciones nuevas. No se inventa un plazo de eliminación, no se declara que el OAuth esté limitado técnicamente a una sola carpeta, ni que archivar o revocar borre archivos/datos. No se afirma que Google ya verificó la app o que salir de Testing está completado.

## Verificación local

- `npm.cmd run pages:prepare`: TypeScript, Vite y Pages Worker aprobados; paquete comprobado sin secretos.
- Preview Pages local en 127.0.0.1:8790; `npm.cmd run pages:smoke -- http://127.0.0.1:8790` aprobado. El smoke ahora abre las páginas con JavaScript desactivado, verifica URL directa sin redirección/login, idioma inglés, logo, enlaces, CSP, ausencia de consultas API/terceros y ajuste móvil. Conserva las comprobaciones anónimas y de otro origen de la API y de las rutas privadas.
- Tres recorridos compartidos existentes aprobados: ingreso y edición normal, reintento pendiente/cierre de sesión que protege la vista de texto, y rutas de clientes aún cerradas. Servicios simulados: no se presentan como prueba de guardado real.
- Revisión visual local escritorio en IAB y móvil 390 px; capturas ignoradas `work/public-about-mobile.png` y `work/public-privacy-mobile.png`. Sin desborde observado. No se agregan tests de estilos ni se repite la suite de negocio completa por este cambio de información pública.

## Publicación y siguiente paso

Publicado en **65b3fd0d.gestor-aramis.pages.dev**, con ambas rutas activas en el dominio propio. `npm.cmd run pages:smoke -- https://gestor.aramis.agency` aprobado sin overrides de DNS; URLs canónicas responden directamente, CSP y recursos cargan, lectura pública sin JavaScript y protección de las rutas privadas conservadas. IAB confirmó ambos textos alojados; capturas ignoradas `work/public-about-hosted.png` y `work/public-privacy-hosted.png`. Se dejaron ambas páginas abiertas para Miguel. No se repitieron operaciones de consentimiento, material, datos ni correos.

En Google Auth Platform → Branding completar App name, User support email y los dos enlaces anteriores. Si Google pide propiedad del dominio, comprobar aramis.agency en Search Console con la cuenta del proyecto. Después se podrá comprobar Publish app en Audience y renovar Drive una vez bajo el nuevo estado; no realizar esos cambios por inferencia de la creación de páginas. El recordatorio del 22/10 sigue siendo pertinente mientras no se confirme salida de Testing y nueva autorización.

Fuentes consultadas: [Branding](https://support.google.com/cloud/answer/15549049?hl=en), [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), [Google Workspace user data and developer policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy).
