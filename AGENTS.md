# Gestor Aramis — instrucciones de ejecución

Leé ROADMAP.md, PROJECT_STATE.md y DECISIONS.md antes de trabajar. El repositorio autorizado es este; no edites Aramis-Web ni otros proyectos vecinos.

## Producto
- WhatsApp manual con enlaces privados; calendario del cliente incluido en V1.
- Marca: #1b2a41, #8b2634, #e9ecf1; acentos #f4b943 y #5c9cd9. DM Serif Display y Lato.
- La demostración debe decir claramente que usa datos ficticios locales. Nunca simular correos, cargas a Drive ni autenticación real como exitosos.
- Nunca exponer notas internas en vistas de cliente. Aprobar una versión exacta; comentarios no aprueban; material recibido no implica completo.
- No enviar mensajes externos ni modificar el Drive existente sin alcance explícito para esa operación. Su inspección fue autorizada, su reorganización no.

## Arquitectura y coordinación
- Stack elegido por el usuario: React/TypeScript/Vite, Cloudflare Pages + Worker, Supabase, Drive y Resend. No sustituirlo ni crear un proyecto Sites paralelo.
- El coordinador mantiene contracts/, package.json, configuración y archivos compartidos. Los subagentes trabajan en archivos asignados y no hacen commits ni cambios de dependencias sin coordinación.
- Preferir bloques pequeños con pruebas de comportamiento. Sin secretos en Git, logs ni entregas.
- Estados: pendiente, en curso, probado en aislamiento, integrado, bloqueado. Integrado localmente no significa validado contra servicios reales.
- Toda entrega registra alcance, pruebas, limitaciones y próxima acción en handoffs/Cxx.md.
- Antes de terminar una sesión, actualizar PROJECT_STATE.md con pasos reproducibles y dejar un commit coherente si los checks pasan.

## Verificación
Ejecutar los comandos disponibles en package.json; documentar qué verifican. No declarar completadas pruebas contra Supabase, Google, correo o Cloudflare sin evidencia real. El coordinador revisa los permisos y las aprobaciones, incluso si las pruebas pasan.
