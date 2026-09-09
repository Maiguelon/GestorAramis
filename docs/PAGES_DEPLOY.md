# Publicación en Cloudflare Pages

Proyecto `gestor-aramis`, publicación directa desde esta computadora. Dirección estable: https://gestor-aramis.pages.dev. No está conectado a despliegues automáticos de GitHub. Un commit o push por sí solo no publica esta app.

## Preparar y verificar

Las configuraciones locales de `SHARED_SETUP.md` deben existir. El empaquetado comprueba modo producción, API del mismo origen y coincidencia de URL/clave pública entre navegador y servidor. Sólo copia las tres variables permitidas del núcleo compartido. No incorpora credenciales de Google, contraseñas, tokens de Wrangler ni claves administrativas.

```powershell
npm.cmd run pages:prepare
npm.cmd run pages:preview
```

En otra terminal:

```powershell
npm.cmd run pages:smoke
```

La preparación compila TypeScript y Vite sin mapas de fuentes, empaqueta Pages Functions como `_worker.js` y genera configuración dentro de `work/pages-deploy` (ignorado por Git). La API se ejecuta sólo en `/api/*`; los demás recursos usan Pages. `dist` queda reservado para builds locales y nunca se usa para esta publicación, evitando subir por accidente la demo.

Pages sirve las rutas de React mediante su [comportamiento SPA predeterminado](https://developers.cloudflare.com/pages/configuration/serving-pages/#single-page-application-spa-rendering). No agregar un `404.html` raíz sin revisar las rutas. Se eliminó el antiguo `_redirects` porque Wrangler detectaba un bucle.

## Publicar una actualización

Wrangler ya fue autorizado por el titular en esta computadora con lectura de usuario/cuenta y escritura de Pages. Si la sesión expira, repetir `npx.cmd wrangler login --browser=false --scopes account:read user:read pages:write` y completar la autorización en el navegador. No copiar tokens a archivos del repositorio.

```powershell
npm.cmd run pages:deploy
npm.cmd run pages:smoke -- https://gestor-aramis.pages.dev
```

`pages:deploy` reconstruye antes de publicar en la rama de producción `main`. Mantener el proyecto y la cuenta correctos; si esta computadora accede a varias cuentas, fijar `CLOUDFLARE_ACCOUNT_ID` de la cuenta Aramis para ese comando. No cambiar `wrangler.toml`: corresponde al Worker de desarrollo; la configuración de Pages se genera separadamente.

El smoke comprueba el sitio en un navegador nuevo, ruta ampliada de texto protegida, API configurada, denegación sin sesión y rechazo de otro origen. No usa credenciales ni cambia datos. Ingresar manualmente desde el navegador habitual y comprobar clientes/guardado en Supabase es una prueba adicional; la sesión de localhost no se traslada al dominio publicado.

## Primera publicación y límites

Publicación del 2026-09-09: https://53d35498.gestor-aramis.pages.dev. Dominio estable: https://gestor-aramis.pages.dev. Compilación y smoke locales y alojados pasan. Miguel ingresó y se verificaron lectura, guardado del guion de Posteo 02 y persistencia en una carga nueva de la vista de texto. No se cambió DNS, dominio propio ni plan de pago. Login por contraseña no utiliza redirecciones de correo; configurar URL de Auth y retornos al incorporar recuperación/OTP.

El núcleo compartido permite clientes, planes, piezas, guiones y producción. Drive, medios compartidos, calendario/aprobaciones de clientes y correo siguen pendientes. Sólo Miguel tiene usuario habilitado.

Para retirar una actualización futura se puede volver a un despliegue previo desde Cloudflare Pages → proyecto → Deployments. Esta primera publicación todavía no tiene una versión anterior estable. El rollback del sitio no revierte datos ni migraciones de Supabase; conservar compatibilidad antes de publicar cambios de esquema.
