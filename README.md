# Gestor Aramis

Gestión de contenido para el equipo y calendario, aprobaciones y pedidos de material para clientes desde enlaces enviados por WhatsApp.

**Estado: demostración local integrada.** Se puede recorrer el flujo completo con datos ficticios. Todavía no es un servicio compartido para clientes reales. No necesita cuentas para ejecutarse.

## Iniciar

Probado en Windows con Node.js 24 y npm 11. Desde esta carpeta:

```powershell
npm ci
npm run dev
```

Abrir [el panel local](http://127.0.0.1:5173/). El puerto 5173 debe estar libre. Si las dependencias ya están instaladas, basta `npm run dev`. Detener con Ctrl+C en esa terminal.

El modo predeterminado es `demo`. Los cambios se guardan en este navegador, incluido al recargar. En Configuración se pueden exportar los datos de ejemplo o restablecer la demostración; restablecer elimina sus cambios locales. Los enlaces no comparten datos entre dispositivos.

## Recorrido sugerido

1. Crear contenido con cliente y responsable. En Detalles, elegir fecha y visibilidad en calendario; usar «Empezar producción».
2. En Material, preparar instrucciones, generar enlace y «Abrir como cliente». Elegir un archivo ficticio y registrar su nombre/tamaño. El equipo recibe el aviso y confirma si está completo.
3. En Revisión, preparar texto e imagen de muestra. Generar enlace y responder desde la pantalla del cliente. Un comentario no aprueba; pedir cambios devuelve el trabajo a producción.
4. Preparar otra versión, aprobarla, marcarla programada y publicada. La aprobación pertenece al texto y archivos de esa versión. Una pieza publicada no admite cambios de contenido; una adaptación requiere otra pieza.
5. Desde Clientes, abrir el calendario de cada marca. El enlace de calendario es de lectura y no entrega enlaces de escritura. Las solicitudes se abren desde sus mensajes independientes.

Enlaces iniciales de muestra: [calendario](http://127.0.0.1:5173/calendar/demo-calendar), [revisión](http://127.0.0.1:5173/request/demo-review) y [material](http://127.0.0.1:5173/request/demo-material). Pueden dejar de estar vigentes después de modificar o revocar una revisión: usar el enlace actual que genera el panel.

Copiar o abrir un mensaje no lo marca enviado. El registro del envío es manual. Esta demo no abre WhatsApp ni envía mensajes. Las cargas de la pantalla de material guardan solamente metadatos; no se transfieren ni conservan los archivos seleccionados.

## Verificación

```powershell
npm test
npm run typecheck
npm run build
npm run worker:check
npx playwright install chromium
npm run test:e2e
```

`npm test` ejecuta dominio, persistencia, PostgreSQL/RLS mediante PGlite y módulos Google con respuestas simuladas. E2E inicia el servidor local automáticamente si hace falta, usa datos ficticios aislados e incluye escritorio, móvil y cambios concurrentes entre pestañas. `worker:check` empaqueta el Worker sin desplegarlo. Evidencia fechada en [PROJECT_STATE.md](PROJECT_STATE.md).

## Arquitectura y límites

- React/TypeScript/Vite, componentes Radix y estilos de marca. Calendarios propios funcionales en demo; integración FullCalendar pendiente para la versión definitiva.
- El dominio y adaptador local están en `src/domain` y `src/lib/api.ts`. El navegador no es una barrera de seguridad; no usar esta persistencia para datos reales.
- PostgreSQL separa borradores y notas internas; RLS restringe agencia/cliente. La API real deberá proyectar los campos públicos: las tablas base no son el contrato de las pantallas cliente.
- El Worker real permanece cerrado: salud indica `scaffold`, rutas de negocio devuelven 503/501. `VITE_APP_MODE=production` muestra acceso no disponible; nunca vuelve a demo por falta de configuración.
- Hay módulos OAuth, carga reanudable y streaming por revisión Drive fijada, probados en aislamiento. Falta persistir sesiones y revisión del proveedor, conectar handlers/autorización y verificar contra Google real.
- No hay login, correo, publicación social, backup remoto ni sincronización entre dispositivos implementados. Crear cuentas y agregar claves no completa esas integraciones.

## Retomar desarrollo

Leer [PROJECT_STATE.md](PROJECT_STATE.md), [ROADMAP.md](ROADMAP.md), [DECISIONS.md](DECISIONS.md) y la entrega correspondiente de `handoffs/`. El próximo bloque de backend puede desarrollarse y probarse localmente; las cuentas se necesitan al conectar y validar servicios externos. La [guía de configuración](docs/SETUP.md) registra los pasos para ese momento.

No poner secretos en el repositorio ni en el chat. `.env.local` y `.dev.vars` están ignorados; `.env.example` contiene sólo nombres públicos de configuración.
