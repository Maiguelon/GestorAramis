# C03 — alta de Eliana y Eric

2026-09-12. Miguel confirmó la creación manual de ambas cuentas en Supabase Auth. Se comprobó que los correos acordados correspondieran a una única cuenta confirmada y que no hubiera membresías incompatibles en Aramis. Se crearon perfiles Eliana/Eric y membresías staff activas en el workspace existente usando la configuración privada local, sin imprimirla. Inserciones idempotentes; lectura posterior verificó una membresía por persona, rol staff, active=true y nombre correcto.

No se leyeron contraseñas, no se restableció ninguna, no se enviaron mensajes y no se modificó Google OAuth. Script operativo en work/provision-team.mjs, ignorado por Git. No se requiere despliegue: son datos del equipo alojado, sin cambios al código.

Para ingresar: https://gestor-aramis.pages.dev con correo y contraseña asignados por Miguel. Eliana elige Vista de trabajo → Diseño una vez en su navegador; Eric conserva Gestión. Ambos trabajan en el mismo espacio y con los archivos del Drive conectado. La vista no restringe permisos.

Pendiente: que cada persona pruebe su login y luego un recorrido compartido. No se afirmó autenticación real de estas identidades ni se generaron sesiones para suplantarlas. Miguel informó que la subida desde su propio celular funciona; no equivale a probar cortes, otros teléfonos o la colaboración con Eric.

Decisión del usuario: conservar la carpeta propia Gestor Aramis actual. La adopción de carpetas anteriores de Drive no es requisito para comenzar el ensayo interno.
