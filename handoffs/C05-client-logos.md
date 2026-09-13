# C05 — logos de clientes

2026-09-12. Base 543ee46. Usuario autorizó botón de logo en edición. Entregado en https://gestor-aramis.pages.dev; deployment 83c632a1.

## Uso
Clientes → Datos y plan mensual (o Editar datos y plan dentro del cliente) → Subir logo → seleccionar PNG/JPG/WebP → Guardar datos y plan. También permite cambiar/quitar y cargar durante alta. No basta con seleccionar: se confirma con el formulario. Se muestra en todas las superficies internas que usan ClientAvatar; iniciales si no hay logo.

## Persistencia
Campo opcional Client.logo y ClientInput.logo. Miniatura PNG embebida, máximo 48.000 caracteres; entrada hasta 5 MiB, redimensionada a 192/128/96 px conservando aspecto y transparencia. No guarda originales, no necesita bucket ni Drive. Validación de contrato/dominio/demo/SQL; render sin URLs externas. Actualización parcial sin logo preserva, null elimina. Revisión esperada y recibos idempotentes existentes protegen cambios concurrentes.

Migración 202609120001_client_logo.sql aplicada una vez en proyecto alojado desde SQL Editor, confirmada Success. Usa definiciones existentes de aramis_workspace/aramis_command, con anclas verificadas antes de reemplazar dentro de una transacción: conserva seguridad y grants sin duplicar toda la implementación. No volver a aplicar. Para instalaciones nuevas, aplicar después de shared_workspace; compatible con Drive ya instalado.

## Verificación
406 unitarias pasan; 43 son shared-sql con migración nueva: guardar, preservar, eliminar, idempotencia, conflicto y entradas inválidas. 22 E2E demo y 7 shared.spec con Auth/API simuladas pasan. El recorrido nuevo verifica formato rechazado, conversión, guardado, otra pestaña y eliminación. Captura work/client-logo-editor.png revisada. Build compartido, Pages/Worker y smoke real aprobados.

Prueba alojada con sesión existente: imagen sintética work/logo-prueba.png subida en Prueba de conexión, guardada y confirmada visible tras recargar en Posteo 01; eliminada desde Quitar logo y guardada después. No se modificó material de Drive ni se usaron logos reales de otros clientes. El nombre/contacto/plan permanecen iguales; la revisión del cliente avanza por ambos guardados.

No se reejecutaron suites Drive sin cambios ni se afirmó prueba desde teléfono físico del nuevo selector. Pendiente feedback habitual del equipo. El acceso de clientes sigue fuera de este bloque.
