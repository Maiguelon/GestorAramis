# Dominio propio y recuperación de acceso — 2026-10-14

## Resultado y autorización

Miguel informó que el gestor no abría y que también le fallaba a un colega. Se reprodujo ERR_NAME_NOT_RESOLVED en IAB y NXDOMAIN en el DNS habitual para gestor-aramis.pages.dev y su despliegue. Los resolvers 1.1.1.1 / 8.8.8.8 y DoH público devolvían las direcciones correctas; acceder con esa resolución manteniendo hostname/TLS devolvía HTML, JS, CSS y health HTTP 200. Esto identifica el fallo local antes de cargar la aplicación; no demuestra el mensaje exacto que veía el colega.

No se cambió el DNS de la PC: Miguel condicionó ese cambio a que sirviera para todos. Autorizó expresamente usar gestor.aramis.agency en Namecheap y Cloudflare, ajustar retorno de Drive y enlaces de avisos. Ingresó a Namecheap personalmente cuando se detectó sesión vencida. Más tarde informó que pudo abrir el gestor nuevo. Aclaración posterior: no se cuenta ese mensaje como evidencia de login autenticado, ya que pidió restablecer su contraseña; ver C03-password-reset.md.

## Configuración aplicada

- Cloudflare Pages, proyecto gestor-aramis existente: dominio gestor.aramis.agency activo, verificación y certificado activos. ID del dominio 808db97e-a2ea-4774-b708-3dd1d42eff99. Se usó la credencial Wrangler existente por API, sin imprimirla ni crear tokens.
- Namecheap Advanced DNS: sólo host gestor. Primero CNAME hacia gestor-aramis.pages.dev, suficiente para verificar dominio/certificado, pero el router aún devolvía NXDOMAIN al resolver su destino. Se cambió ese registro a ALIAS hacia el mismo destino, TTL 5 min. Los dos nameservers autoritativos devolvieron A y no CNAME para la consulta correspondiente; el resolver IPv4 del router y ambos resolvers públicos devolvieron direcciones válidas. No hay IPs fijas en configuración.
- Durante propagación Windows todavía recibió una respuesta negativa; después el health y smoke normal resolvieron sin cambios de red. No se editaron hosts ni DNS del sistema; sólo se vació la caché local durante diagnóstico.
- Root/web (@ y www), otros subdominios, tres MX de Zoho, SPF/DKIM/Resend y nameservers conservados. No se migró la zona ni se compró dominio/plan.
- NOTIFICATION_APP_URL actualizado en configuración local ignorada, Pages producción y Worker de avisos. Mismo envío habilitado, cron, proveedor, remitente y secretos. Worker f302675e-f71c-4104-abd1-413a7cbc00c0. No se dispararon correos de prueba.
- Pages publicado en dabfa01b.gestor-aramis.pages.dev y dominio propio. Fuente funcional igual; cambian enlaces/configuración y documentación. Helpers de empaquetado usan la URL nueva como fallback. Reimportar un JSON OAuth conserva el retorno configurado y lo valida contra los dos orígenes propios conocidos; ya no lo pisa silenciosamente con pages.dev.

## Verificación

- node --check scripts/configure-drive.mjs y pages:prepare (TypeScript, Vite, Worker y paquete sin secretos) aprobados.
- Smoke remoto normal final: npm.cmd run pages:smoke -- https://gestor.aramis.agency, aprobado. Login y texto ampliado, API configurada, rechazo sin sesión / otro origen y ausencia de errores JS. Sin operaciones autenticadas ni cambios de registros.
- El smoke previo a propagación falló por DNS. Dos helpers ignorados en work (smoke-dns-router.mjs y smoke-custom-domain.mjs) permitieron verificar de forma aislada, con TLS normal y direcciones consultadas al router. No modifican el DNS del sistema. Después se repitió el smoke oficial sin overrides y pasó; esa es la evidencia final.
- IAB mostró Ingresar al equipo en el dominio propio y continuó anónimo. Miguel confirmó la apertura de la dirección; tras su aclaración posterior de contraseña olvidada, el ingreso autenticado permanece pendiente. No afirmar inspección de piezas mediante su sesión en esta entrega.
- node work/verify-drive-renewal.mjs: refreshSucceeded=true, driveMetadataStatus=200, rootFolderReadable=true, readWriteScopePreserved=true. Lee la conexión existente, descifra sólo en memoria y consulta metadatos; no guarda access tokens ni modifica material. Esto confirma operatividad actual, no una nueva fecha de consentimiento.
- No cambios de SQL, datos, permisos ni formato de archivos. No se repitieron suites de negocio por cambios de URL/configuración. Evidencia visual anónima en work/custom-domain-login.jpg.

## Historial: retorno OAuth inicialmente pendiente

GOOGLE_REDIRECT_URI sigue apuntando al origen pages.dev. No cambiarlo a un retorno que todavía no esté registrado en Google. El Drive actual funciona por refresh; renovar desde gestor.aramis.agency aún falla la comprobación de mismo origen de drive-service.ts.

Google Auth Platform mostró Failed to load en Overview, Clients y el detalle. El menú APIs & Services → Credentials sí cargó y mostró Gestor Aramis Web; abrirlo redirigió al detalle nuevo que vuelve a fallar. Reintento y recarga no recuperaron ese formulario. No se modificó la configuración Google ni sus scopes. Pregunta pendiente a Miguel sobre si el formulario carga desde su navegador.

Para cerrar, cuando el panel vuelva a cargar:

1. En el cliente OAuth existente Gestor Aramis Web agregar a Authorized redirect URIs: https://gestor.aramis.agency/api/google/callback. Conservar el retorno antiguo; no rotar el client secret. No hace falta origen JavaScript para este flujo de servidor.
2. Cambiar únicamente GOOGLE_REDIRECT_URI de .dev.vars al retorno nuevo, conservando todos los secretos, en especial DRIVE_ENCRYPTION_KEY. Instalar con node scripts/configure-drive.mjs --install y volver a publicar Pages.
3. Comprobar que Renovar conexión inicia el flujo desde el dominio nuevo y regresa al mismo origen, con sesión normal de Miguel y los mismos scopes. No atribuir a un refresh automático una renovación del consentimiento de Testing.
4. Actualizar PROJECT_STATE y este handoff con el resultado. No repetir migraciones ni recrear carpetas o cuentas. Los usuarios deben iniciar sesión una vez en el nuevo origen y Eliana puede necesitar volver a elegir Diseño.

Fuentes: [dominios en Pages](https://developers.cloudflare.com/pages/configuration/custom-domains/), [ALIAS en Namecheap](https://www.namecheap.com/support/knowledgebase/article.aspx/10128/2237/how-to-create-an-alias-record/), [subdominios en Namecheap](https://www.namecheap.com/support/knowledgebase/article.aspx/9776/2237/how-to-create-a-subdomain-for-my-domain/).

## Cierre del retorno OAuth — 2026-10-15

Miguel autorizó avanzar con el ajuste. El formulario de Google volvió a cargar. Se añadió el retorno nuevo al cliente Gestor Aramis Web y se guardó; otra apertura del detalle confirmó ambos retornos persistidos, sin nuevo cliente, secreto ni origen JavaScript. Captura ignorada: `work/google-custom-domain-oauth.png`.

Se sustituyó sólo GOOGLE_REDIRECT_URI en .dev.vars mediante comprobación de que las demás variables permanecían iguales. `node scripts/configure-drive.mjs --install` instaló las cinco variables existentes sin rotarlas. `npm.cmd run pages:deploy` pasó TypeScript, Vite, Worker y control de secretos; publicación **a574eb6c.gestor-aramis.pages.dev**. `npm.cmd run pages:smoke -- https://gestor.aramis.agency` aprobó login/ruta de texto, API configurada y denegación anónima/de otro origen. No hubo cambios de código funcional ni motivos para repetir las suites de negocio.

Desde la sesión real de Miguel en el origen nuevo se pulsó Configuración → Renovar conexión, se eligió miguelcarreteroangel@gmail.com y se completó el consentimiento. Google mostró que drive.file y drive ya estaban concedidos: renovación con la misma cuenta y los mismos permisos, sin ampliación. El callback volvió al dominio nuevo y la UI confirmó «Google Drive quedó conectado. Ya podés subir material desde una pieza.» Captura ignorada: `work/drive-renewal-custom-domain.png`. Se volvió al gestor, donde se cargaron los pendientes.

`node work/verify-drive-renewal.mjs` posterior confirmó refreshSucceeded=true, driveMetadataStatus=200, rootFolderReadable=true, readWriteScopePreserved=true. No se guardaron tokens en logs ni se modificó material; tampoco se crearon carpetas ni se enviaron mensajes/correos. Se conservaron generación de conexión, raíz y clave AES; no se repitieron migraciones.

Estado: retorno y botón operativos. Google sigue External/Testing y conserva el límite de siete días; renovar antes del 22/10 si no se resuelve la publicación OAuth. No se creó un nuevo recordatorio. Para renovar, usar siempre https://gestor.aramis.agency → Configuración → Google Drive → Renovar conexión; el origen viejo ya no coincide con el retorno activo del servidor. Mantener por ahora el callback anterior autorizado en Google no hace que ese origen vuelva a ser el principal.
