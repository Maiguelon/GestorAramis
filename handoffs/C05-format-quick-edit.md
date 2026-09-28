# Cambio rápido de formato — 2026-09-28

La etiqueta de tipo en el encabezado del detalle se convirtió en un selector visible y accesible. Reel, Post, Carrusel e Historia se pueden intercambiar ahí; la opción elegida se guarda de inmediato mediante `update-piece` con revisión esperada. El detalle bloquea el atajo mientras haya otros cambios sin guardar, de modo que un guardado rápido no pise el borrador. Se conserva el selector del formulario para editar el tipo junto a otros datos. No cambia automáticamente el título ni elimina texto o material; al elegir Historia aparece su campo único de contenido. No hacen falta migraciones: el comando compartido ya admitía `format`.

Se fijó la fecha de una prueba de snapshots antiguos que fallaba al acercarse a octubre por los contenidos relativos de la semilla. No cambió lógica de negocio.

Validación: TypeScript/Vite en demo y compartido; 467 unitarias, 24 recorridos de interfaz compartida y recorrido principal de demo. Prueba directa en navegador: crear Reel, cambiar a Post y luego Historia desde el encabezado, recargar y confirmar persistencia y campo de Historia. Capturas de escritorio y móvil revisadas. Publicado en `https://2a82abc2.gestor-aramis.pages.dev` y alias estable; smoke remoto anónimo aprobado y bundle del alias comprobado. No se modificaron piezas reales ni se probó un guardado autenticado de formato en producción.

Próxima acción: Miguel puede abrir una pieza existente en el alias estable y probar el selector; si el título genérico queda como “Reel 02” tras cambiar de formato, puede editarlo en Detalles. La decisión de renombrar automáticamente títulos genéricos queda para feedback de uso.
