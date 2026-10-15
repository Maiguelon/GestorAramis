# Restablecimiento de contraseña — 2026-10-14

## Alcance autorizado y estado

Miguel no recuerda la contraseña de su usuario y pidió restablecerla. Conservar exactamente su cuenta, email, membresía y datos. ID observado en Supabase Users: 78cb5a36-f10f-4a3b-84f6-05a94687f6f9, email miguel_carretero@outlook.com. La identidad fue verificada también por getUserById antes de abrir el formulario.

**Confirmado y cerrado:** Miguel completó personalmente el formulario nuevo. Salida segura de la sesión 68935 confirmó éxito de updateUserById, ID/email preservados y ausencia de contraseña en logs/archivos; GET de comprobación devolvió HTTP 200/status complete. El usuario confirmó «Contraseña actualizada» y luego «Sí, pude ingresar» ante la pregunta explícita de poder ver los contenidos. La sesión IAB inspeccionada siguió anónima: no se atribuye a herramientas la observación de su workspace. Se cerró únicamente el servidor de recuperación, con PID/comando verificados, después del éxito y la prueba del titular. No ejecutar de nuevo el helper salvo nuevo pedido explícito de restablecimiento.

## Procedimiento preparado

La UI de Supabase sólo muestra Send password recovery; la app sólo tiene ingreso por contraseña, sin pantalla PASSWORD_RECOVERY/updateUser. No se envió un enlace que no tendría un recorrido completo. No se recreó el usuario ni se escribió una contraseña en SQL, historial, shell o conversación.

Helper temporal ignorado: work/reset-miguel-password.mjs. Se ejecuta desde el repo con Node y deja un servidor en 127.0.0.1:8978 por 15 minutos, ruta aleatoria de 256 bits. Usa la configuración privada existente; no incluye secretos en el HTML. Origen/Host/ruta/MIME verificados, CSP con nonce de script y connect-src self, frames prohibidos, no-store, límite de cuerpo y guardia de concurrencia. Dos campos password con confirmación, sin restricciones locales de longitud. El usuario completa ambos campos y pulsa Restablecer contraseña personalmente; Supabase conserva su propia política.

Sólo ese POST válido llama auth.admin.updateUserById para el ID fijo con payload password. Nunca acepta un usuario destino desde el formulario. Contraseña sólo en memoria y petición HTTPS a Supabase; no se imprime, refleja ni persiste localmente. Respuestas/logs estáticos, sin errores crudos de proveedor. Éxito verifica ID/email preservados y muestra Contraseña actualizada. Conserva una comprobación de resultado hasta cierre/expiración para que una respuesta perdida no obligue a repetir el POST. La pantalla ofrece ingresar al dominio propio. No se completó automáticamente el login ni se crearon sesiones de prueba.

Validación previa: node --check del helper; GET con dos campos password, no-store y CSP; POST de origen ajeno 403, POST vacío del origen local 400 y ruta ajena 404. Ninguno llama a updateUserById. La preparación no constituye un cambio de contraseña.

Miguel informó que no podía pulsar el botón y pidió quitar el mínimo de 12. Se retiró ese requisito extra y el máximo local (HTML y servidor); no se cambió la política del proyecto. Antes de reemplazar la página, sólo se consultaron flags de validación y disabled del botón, nunca valores de los campos: botón habilitado y ambos campos válidos en ese instante, sin errores de consola ni POST registrado. Por eso no se afirma que el mínimo explique definitivamente el clic fallido. Se reinició únicamente el proceso temporal, con identidad/comando verificados; GET confirmó ausencia de minlength/maxlength y botón habilitado. El intento de la sesión 9553 terminó luego en una pantalla de error del navegador y no registró una operación válida de cambio.

## Corrección del transporte y prueba real

El servidor 9553 seguía escuchando y no había registrado un POST válido; por tanto no se repitió un cambio incierto. La herramienta de navegador rechazó inspeccionar la pantalla de error por su protocolo interno no permitido. No se intentó leerla mediante otro canal ni eludir esa restricción. Se dejó esa pantalla y se preparó una página HTTP normal que usa el patrón habitual de una app: evento submit del titular, fetch POST del mismo origen y resultado dentro de la página, sin navegación tradicional. Se conservan las validaciones de origen y ruta; no se aceptan Origin nulos/ajenos. La causa exacta de la pantalla interna no se afirma como diagnosticada: el fallo estaba antes de registrar la operación, y el transporte nuevo se validó por separado.

El script se validó sintácticamente y se probó en un servidor aislado en 8979, sin credenciales ni acceso a Supabase, con datos claramente ficticios. El mismo script de cliente emitió un POST con Sec-Fetch-Dest empty y Sec-Fetch-Mode same-origin; IAB mostró la respuesta de prueba sin navegación. El servidor de prueba y su pestaña se cerraron. El formulario real conservó estado pending y rechazo 403 de origen ajeno antes de abrirse al titular. Luego recibió un único envío válido de Miguel y confirmó éxito real. El estado complete y las respuestas de éxito no disparan otra actualización. El servidor de recuperación se cerró tras la confirmación de ingreso.

## Evidencia y límites de cierre

1. Mensaje seguro recibido: Password reset confirmed for the existing account. Account ID and email preserved; password not logged or saved locally.
2. Comprobación local de estado: HTTP 200/status complete. El servidor fue cerrado después; no mantenerlo activo ni repetir la actualización.
3. Miguel confirmó su ingreso y lectura de contenidos en https://gestor.aramis.agency/. No se pidió ni leyó la contraseña ni se inspeccionaron valores durante su entrada.
4. Sin cambios publicados, nuevas cuentas, SQL, roles, membresías ni otras contraseñas. El retorno OAuth del dominio nuevo sigue siendo un pendiente independiente.

Se aclara la evidencia de la entrega de dominio: el mensaje previo de Miguel de poder entrar era ambiguo; después pidió restablecer la contraseña, así que no se cuenta como login autenticado. IAB estaba anónimo y el smoke remoto también era anónimo.

Referencia primaria: https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid
