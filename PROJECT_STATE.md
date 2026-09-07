# Estado del proyecto

Fecha: 2026-09-07. Último checkpoint previo: 6d3a194. No reiniciar lo completado.

## Estado actual
- Demo integrada en localStorage con datos ficticios; un navegador, sin login ni usuarios reales. Los integrantes son ejemplos.
- Panel, calendario, solicitudes, historial y mensajes manuales funcionan localmente. Worker de negocio cerrado con 503/501; no basta agregar claves.
- Dominio/API protege versión exacta, concurrencia, publicación, notas y borradores. Calendario secreto sólo de lectura, sin tokens de escritura.
- SQL/RLS y primitivas OAuth, carga reanudable y reproducción de revisión fija están probadas en aislamiento. Sin conexión a servicios externos.
- Limpieza UI solicitada: logo original copiado de Aramis-Web/public/img/stock/logoAramis.svg a public/brand/aramis.svg; nombre sin acento, sin slogans, filtros compactos y textos directos. Proyecto vecino sin modificar.

## Verificación
- npm test: 177 pruebas, 5 archivos, todas pasan.
- npm run build: pasa (incluye compilación TypeScript).
- npx playwright test --reporter=list: 13 recorridos pasan, incluidas vistas móviles.
- Worker dry-run pasó en el checkpoint técnico anterior. No hubo despliegue.

## Para probar
npm run dev; abrir http://127.0.0.1:5173/. Calendario: /calendar/demo-calendar. Datos sólo de este navegador; ninguna carga real a Drive.

## Próximo paso
El usuario prueba la UI y devuelve ajustes. No ampliar funciones antes de esa devolución. Luego continuar repositorios y transacciones de negocio, handlers autorizados y adaptador remoto; consultar ROADMAP y docs/SETUP. Cuentas pendientes de Supabase, Cloudflare, Google y correo; el usuario pidió posponerlas. No publicar ni contactar clientes.
