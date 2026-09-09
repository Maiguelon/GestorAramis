# C04 — notas y preparación de Google (2026-09-09)

Estado: preparación; integración pendiente. Sólo notas, sin cambios ejecutables ni despliegue.

Miguel solicita guardar observaciones para revisar si ya existen o implementarlas luego. Diseño debe entrar a pendientes de producción con fechas y acciones prioritarias; demás información secundaria. Eric sube varias tomas desde celular: probar selección, progreso y cortes en dispositivo real. Prefiere carpetas por cliente/mes previsto; mes del plan y subcarpetas por pieza son una propuesta a validar, sin reorganización ni movimientos automáticos de archivos existentes.

No priorizar alta de Eliana ni prueba con dos personas antes de integrar material real. El siguiente paso autorizado es un instructivo para que Miguel cree el proyecto de Google Cloud, habilite Drive API y configure Google Auth Platform/OAuth web con drive.file. Callback propuesto por docs/SETUP.md: https://gestor-aramis.pages.dev/api/google/callback; todavía no implementado. No probar conexión hasta implementar handler y almacenamiento seguro de tokens.

Solicitar enlace/ID del proyecto y correo Google que conectará el Drive. Secretos OAuth fuera del chat y de Git; instalar luego como secretos del servidor. Testing es sólo temporal; revisar publicación OAuth y duración del refresh token antes de uso habitual. Picker/permisos sobre carpetas existentes se validan durante integración.

Verificación: documentación solamente, git diff --check. Sin pruebas de Google ni cambios al producto.
