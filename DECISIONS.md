# Decisiones

## D01 — Producto y V1
WhatsApp es la entrada del cliente, envío humano con mensaje preparado. Calendario incluido V1: enlace secreto revocable read-only y acceso habitual autenticado. Aprobación/material por link restringido. No bot ni autopublicación ni métricas.

## D02 — Stack
React + TypeScript + Vite; Tailwind/shadcn; FullCalendar Standard cuando se integre el calendario completo; Cloudflare Pages y Worker; Supabase PostgreSQL/Auth; Drive API; Resend SMTP. El usuario eligió un repositorio propio: no crear una aplicación Sites alternativa.

## D03 — Datos demo y producción
La demostración persistirá únicamente datos ficticios en el navegador, con indicador constante y mecanismo de reinicio. No hay login falso, correo ficticio ni entrega Drive simulada como real. En producción, configuración ausente bloquea con error; no cae a demo. La integración real conserva políticas RLS y tokens hash en servidor.

## D04 — Permisos y versiones
Visibilidad cliente opt-in por pieza; no mostrar notas internas. Las revisiones capturan texto y archivos. Mutar copy o crear versión nueva invalida aprobación anterior. Estado aprobado solo por respuesta de revisión vigente. Material recibido y completo son estados distintos. Un comentario no autoriza publicación. Reintentos idempotentes y actualización con revision esperada.

## D05 — Drive
Se mantiene estructura existente; la integración creará su carpeta propia cuando exista autorización funcional. OAuth de cuenta Aramís con drive.file y offline access. Elegir explícitamente archivos anteriores mediante Picker; compartir una carpeta no implica permiso a todos sus descendientes. Sin credenciales Google en frontend. Carga reanudable con permiso por envío; comprobar tamaño/existencia antes de registrar recibido. Revisiones conservadas con archivo y checksum verificables. No sincronización automática del disco físico en V1.

## D06 — Marca
Azul institucional #1b2a41, rojo #8b2634, fondo #e9ecf1, amarillo #f4b943 y azul #5c9cd9 como acentos. DM Serif Display para títulos y Lato para lectura/UI. Español rioplatense, profesional y cercano.

## D07 — Continuidad y audiencia
Hasta tres subagentes + coordinador, sin ediciones superpuestas. Cada módulo entrega evidencia y pendientes. No publicar, usar datos reales ni contactar clientes durante la demostración; preparar configuración y pruebas controladas. Si faltan accesos externos, continuar trabajo aislado y pedir al usuario lo necesario para la siguiente integración.
