---
version: 1
slug: "apps-web-src-app-o-org-page-tsx"
primary_target: "apps/web/src/app/o/[org]/page.tsx"
related_targets: ["apps/web/src/app/o/[org]/layout.tsx"]
---

# Inicio (armazón + panel del día)

Modo: Operate. Ruta: `apps/web/src/app/o/[org]/` (layout = armazón común; page = Inicio).

Usuarios y tarea: dueño/gerente de pyme o responsable de grupo, a primera hora en la oficina, con luz de día. Quiere saber en segundos qué requiere su atención hoy en la sociedad activa y cambiar de sociedad sin dudar dónde está.

Contenido: cobros pendientes y vencidos, cobrado vs emitido, estado VeriFactu, fichajes del día, stock bajo mínimos, albaranes por contabilizar, incidencias. Datos de ejemplo marcados como tales hasta que existan los endpoints.

## Direction contract

THESIS: Cada sociedad es un archivador de palanca con lomo de color en la estantería; cambiar de empresa es sacar otro archivador. Rechaza la barra lateral gris genérica con un selector desplegable de empresa escondido.

OWN-WORLD: Fondo gris cartón frío (#E8EAED), raíl de estantería (#D5D8DC), tinta #16181D, hoja de trabajo blanca. Lomos rojo #D23B2E, azul #1F6FB2, amarillo #F1C232, verde #3A8C4A: uno por sociedad, con etiqueta blanca vertical y agujero de anilla. Pestañas de separador para los módulos; la activa lleva arriba el color del lomo activo. Sans de sistema, cifras tabulares.

STORY: El usuario ve qué sociedad tiene abierta antes que nada, lee la siguiente acción, revisa cobros, VeriFactu, fichajes y stock, y salta al módulo o a otra sociedad.

FIRST VIEWPORT: Raíl izquierdo de 132px con lomos (activo más ancho y adelantado). Cabecera: nombre de la sociedad, fecha, buscador, etiqueta de datos de ejemplo, avatar. Pestañas de separador. Hoja blanca: franja «Siguiente» con la acción principal a la derecha, cuatro indicadores, tabla de facturas vencidas (2 columnas), stock bajo mínimos e incidencias.

FORM: Archivador AZ, candidata nº1 de mi lista ordenada (elegida como IMPECCABLE'S PICK). seed:cbc8d9104f71bad7. Gesto propio: el raíl de lomos; al cambiar de sociedad el lomo nuevo sale hacia delante (transform 200ms) y la pestaña activa toma su color.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
