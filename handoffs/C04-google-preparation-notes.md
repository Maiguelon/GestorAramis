# C04 — notas y preparación de Google (2026-09-09)

Estado: preparación; integración pendiente. Sólo notas, sin cambios ejecutables ni despliegue.

Miguel solicita guardar observaciones para revisar si ya existen o implementarlas luego. Diseño debe entrar a pendientes de producción con fechas y acciones prioritarias; demás información secundaria. Eric sube varias tomas desde celular: probar selección, progreso y cortes en dispositivo real. Prefiere carpetas por cliente/mes previsto; mes del plan y subcarpetas por pieza son una propuesta a validar, sin reorganización ni movimientos automáticos de archivos existentes.

No priorizar alta de Eliana ni prueba con dos personas antes de integrar material real. El siguiente paso autorizado es un instructivo para que Miguel cree el proyecto de Google Cloud, habilite Drive API y configure Google Auth Platform/OAuth web con drive.file. Callback propuesto por docs/SETUP.md: https://gestor-aramis.pages.dev/api/google/callback; todavía no implementado. No probar conexión hasta implementar handler y almacenamiento seguro de tokens.

Solicitar enlace/ID del proyecto y correo Google que conectará el Drive. Secretos OAuth fuera del chat y de Git; instalar luego como secretos del servidor. Testing es sólo temporal; revisar publicación OAuth y duración del refresh token antes de uso habitual. Picker/permisos sobre carpetas existentes se validan durante integración.

Verificación: documentación solamente, git diff --check. Sin pruebas de Google ni cambios al producto.

## Revisión posterior de consola

Proyecto `gestor-aramis`, cuenta indicada `miguelcarreteroangel@gmail.com`. Google Drive API ya habilitada. Cliente OAuth Gestor Aramis Web existe con callback exacto previsto; no se creó ni rotó una credencial. External/Testing. Miguel confirmó completar ambos ajustes: drive.file guardado con notificación de éxito y cuenta agregada como único usuario de prueba, verificada en tabla. JSON descargado localizado en `C:/Users/Usuario/Downloads/client_secret_304004103653-imq6f2svvd04tnkjfbbm566ln303bh9c.apps.googleusercontent.com.json`; validación sólo emite booleanos de proyecto/cliente/callback coincidentes y presencia de secreto. No copiar contenido a Git/chat/logs. Aún no instalado en Cloudflare.

Audience advierte Branding incompleto: datos de nombre/correos/dominio presentes, enlaces de web/privacidad/términos vacíos. Revisar antes de publicar, sin inventar páginas ni asumir validación. Ningún acceso a archivos Drive ni prueba de integración todavía. Próximo bloque técnico: persistencia segura de conexión/estado OAuth, handler de retorno, configuración servidor y consentimiento real; después carpeta/carga/lectura. No ampliar alcance a toda la unidad ni implementar UX pendiente por inferencia.
