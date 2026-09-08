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

1. Entrar a **Clientes → Trabajar mes**. En **Editar datos y plan**, definir contacto y cantidades de posteos/reels. Un cliente nuevo puede crearse desde esa pantalla.
2. Elegir mes y **Generar base del mes**. Completa las cantidades faltantes respetando piezas existentes, una sola vez por mes. No asigna fechas automáticamente. Editar título, formato, fecha y área en cada fila y guardar; se pueden agregar extras o quitar piezas (archivarlas).
3. Abrir una pieza, escribir **Guion e instrucciones de producción**, guardar y marcar **Listo para producción**. Pasa a Diseño. En Producción, filtrar cliente/área y etapa; grabación pasa a Marketing y edición/diseño a Diseño.
4. En **Material → Material del equipo**, adjuntar un archivo de prueba de hasta 100 MB. Se guarda en IndexedDB de ese navegador, permite previsualizar videos/imágenes y descargar después de recargar. No se sube a Drive. El apartado plegado **Pedidos al cliente** mantiene el flujo excepcional anterior, sólo con metadatos ficticios.
5. En **Calendario**, cada día muestra dos piezas y **+N más** abre el día completo. Las piezas sin fecha se agrupan según el mes del plan. Cambiar la fecha de publicación no cambia automáticamente el mes del plan; éste puede editarse desde Detalles.
6. La revisión/aprobación anterior sigue disponible, sin ampliaciones de la vista cliente en este bloque. La aprobación continúa vinculada a una versión exacta.

Enlaces iniciales de muestra: [calendario](http://127.0.0.1:5173/calendar/demo-calendar), [revisión](http://127.0.0.1:5173/request/demo-review) y [material](http://127.0.0.1:5173/request/demo-material). Pueden dejar de estar vigentes después de modificar o revocar una revisión: usar el enlace actual que genera el panel.

Copiar o abrir un mensaje no lo marca enviado. El registro del envío es manual. Esta demo no abre WhatsApp ni envía mensajes. Los pedidos al cliente guardan solamente metadatos. El material del equipo conserva archivos en el navegador; la exportación JSON no incluye esos archivos. Para borrar todos los archivos locales, eliminar los datos del sitio desde el navegador.

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
