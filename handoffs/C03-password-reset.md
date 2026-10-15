# Restablecimiento de contraseña — 2026-10-14

## Alcance autorizado y estado

Miguel no recuerda la contraseña de su usuario y pidió restablecerla. Conservar exactamente su cuenta, email, membresía y datos. ID observado en Supabase Users: 78cb5a36-f10f-4a3b-84f6-05a94687f6f9, email miguel_carretero@outlook.com. La identidad fue verificada también por getUserById antes de abrir el formulario.

**En curso:** formulario abierto para el titular. Al preparar esta nota no se cambió contraseña ni se verificó nuevo ingreso. Esperar el resultado seguro del proceso y la confirmación del usuario.

## Procedimiento preparado

La UI de Supabase sólo muestra Send password recovery; la app sólo tiene ingreso por contraseña, sin pantalla PASSWORD_RECOVERY/updateUser. No se envió un enlace que no tendría un recorrido completo. No se recreó el usuario ni se escribió una contraseña en SQL, historial, shell o conversación.

Helper temporal ignorado: work/reset-miguel-password.mjs. Se ejecuta desde el repo con Node y deja un servidor en 127.0.0.1:8978 por 15 minutos, ruta aleatoria de 256 bits. Usa la configuración privada existente; no incluye secretos en el HTML. Origen/Host/ruta/MIME verificados, CSP sin scripts/frames, no-store, límite de cuerpo y guardia de concurrencia. Dos campos password con confirmación; al menos 12 caracteres, hasta 72 bytes UTF-8. El usuario debe completar ambos campos y pulsar Restablecer contraseña personalmente.

Sólo ese POST válido llama auth.admin.updateUserById para el ID fijo con payload password. Nunca acepta un usuario destino desde el formulario. Contraseña sólo en memoria y petición HTTPS a Supabase; no se imprime, refleja ni persiste localmente. Respuestas/logs estáticos, sin errores crudos de proveedor. Éxito verifica ID/email preservados, muestra Contraseña actualizada y cierra el servidor. La pantalla ofrece ingresar al dominio propio. No se completó automáticamente el login ni se crearon sesiones de prueba.

Validación previa: node --check del helper; GET con dos campos password, no-store y CSP; POST de origen ajeno 403, POST vacío del origen local 400 y ruta ajena 404. Ninguno llama a updateUserById. La preparación no constituye un cambio de contraseña.

## Continuación

1. Leer sólo la salida segura del proceso, no el contenido de los campos. El mensaje de éxito es Password reset confirmed for the existing account. Account ID and email preserved; password not logged or saved locally.
2. Pedir al usuario que pruebe personalmente su cuenta en https://gestor.aramis.agency/. No pedir la contraseña ni leerla desde el navegador. La confirmación del ingreso y el éxito de la API son evidencias distintas.
3. Si el formulario venció, iniciar de nuevo el mismo helper y abrir la nueva ruta. No reutilizar ni guardar rutas temporales en Git. No repetir el cambio si ya tuvo éxito.
4. Cerrar esta nota y PROJECT_STATE según la evidencia; no cambiar permisos, Drive ni otras cuentas. El retorno OAuth del dominio nuevo sigue siendo un pendiente independiente.

Se aclara la evidencia de la entrega de dominio: el mensaje previo de Miguel de poder entrar era ambiguo; después pidió restablecer la contraseña, así que no se cuenta como login autenticado. IAB estaba anónimo y el smoke remoto también era anónimo.

Referencia primaria: https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid
