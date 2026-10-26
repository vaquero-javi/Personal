---
name: Omnia Business
description: ERP/CRM multisociedad para pymes españolas; cada sociedad es un archivador AZ en la estantería.
colors:
  carton: "#e8eaed"
  shelf: "#d5d8dc"
  shelf-edge: "#bfc3c8"
  sheet: "#ffffff"
  sheet-head: "#f4f5f7"
  line: "#dadde1"
  line-soft: "#eef0f2"
  ink: "#16181d"
  ink-2: "#4a5058"
  ink-3: "#5b6168"
  spine-red: "#d23b2e"
  spine-blue: "#1f6fb2"
  spine-yellow: "#f1c232"
  spine-green: "#3a8c4a"
  danger: "#b8291d"
  danger-soft: "#fbe9e7"
  warning: "#8a6100"
  warning-soft: "#fdf6dd"
  warning-line: "#e3b21f"
  ok: "#2f7a3e"
typography:
  headline:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.4
  figure:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.25
    fontFeature: "tnum"
  title:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.43
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
    fontFeature: "tnum"
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.33
  spine-label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.04em"
rounded:
  hairline: "2px"
  spine-top: "4px"
  control: "6px"
  tab: "8px"
  pill: "9999px"
spacing:
  rule: "1px"
  cell-y: "14px"
  cell-x: "16px"
  cell-x-md: "20px"
  control-height: "34px"
  tab-height: "36px"
  rail-width: "132px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.control}"
    height: "{spacing.control-height}"
    padding: "0 16px"
    typography: "{typography.title}"
  button-primary-hover:
    backgroundColor: "#2c3038"
  button-secondary:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "{spacing.control-height}"
    padding: "0 16px"
  button-secondary-hover:
    backgroundColor: "{colors.sheet-head}"
  input-search:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "{spacing.control-height}"
    padding: "0 12px"
  divider-tab:
    backgroundColor: "{colors.shelf}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.tab}"
    height: "{spacing.tab-height}"
    padding: "0 18px"
  divider-tab-active:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
  sheet-cell:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    padding: "14px 20px"
  empty-note:
    backgroundColor: "{colors.sheet-head}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.spine-top}"
    padding: "12px"
  limit-bar:
    backgroundColor: "{colors.carton}"
    rounded: "{rounded.pill}"
    height: "6px"
  spine-label:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.spine-label}"
---

# Design System: Omnia Business

## Overview

**Creative North Star: "El Archivador AZ"**

Cada sociedad es un archivador de palanca con lomo de color en una estantería de cartón gris; cambiar de empresa es sacar otro archivador. La pantalla se lee como un objeto de oficina: a la izquierda la balda con los lomos, arriba los separadores de módulo, y en el centro una única hoja blanca pautada donde se trabaja. Rechaza la barra lateral gris genérica con el selector de empresa escondido en un desplegable: la sociedad activa se ve antes que nada.

La densidad es de herramienta de trabajo (modo Operate): sans del sistema, escala fija en rem, cifras tabulares y alineadas a la derecha, filetes de 1px en lugar de tarjetas. El color es escaso y con una sola función por familia: los lomos identifican sociedades, los tonos de estado señalan problemas y todo lo demás es tinta y gris. El único gesto de movimiento es el lomo que sale hacia delante al cambiar de sociedad.

**Key Characteristics:**
- Raíl de lomos (132px) como navegación entre sociedades; el lomo activo es más ancho, más alto y adelantado.
- Pestañas de separador para los módulos; la activa toma arriba el color del lomo activo.
- Una hoja blanca pautada: casillas separadas por filetes (`gap-px` sobre el color de línea), sin tarjetas anidadas.
- Cifras tabulares, a la derecha, siempre junto a su referencia o límite.
- Sans del sistema, escala fija; sin fuentes de display.
- Movimiento mínimo: 200ms ease-out-expo en el lomo; respeta reduced-motion.

## Colors

Cartón frío y tinta casi negra como base, cuatro lomos saturados reservados a la identidad de cada sociedad y una familia de estado aparte.

### Primary
- **Tinta de archivo** (ink): texto principal, botón primario, avatar, anillo de foco, caret y selección (16% de mezcla). Es el acento de interfaz: los enlaces y los controles son tinta, no color.

### Secondary
- **Lomos de sociedad** (spine-red, spine-blue, spine-yellow, spine-green): uno por sociedad. Aparecen solo en tres sitios: el lomo del raíl, el borde superior de 3px de la pestaña activa y el cuadradito junto al nombre de la sociedad en la cabecera.

### Tertiary
- **Peligro** (danger) con su fondo **danger-soft**: vencidos, rechazos, faltas de fichaje, stock por debajo del mínimo.
- **Aviso** (warning para texto, warning-soft para la franja «Siguiente» y chips, warning-line para trazos y puntos de prioridad alta).
- **Correcto** (ok): cobrado sobre emitido, cobros previstos, iconos de vacío resuelto.

### Neutral
- **Cartón gris** (carton): fondo de la página y pista vacía de las barras de límite.
- **Balda** (shelf): fondo del raíl y de las pestañas inactivas.
- **Canto de balda** (shelf-edge): bordes de controles, pestañas y hoja; scrollbar.
- **Hoja** (sheet): superficie de trabajo.
- **Cabecera de hoja** (sheet-head): cabeceras de tabla, hover de fila, notas vacías, esqueletos de carga.
- **Filete** (line) y **filete suave** (line-soft): la pauta entre casillas y los separadores entre filas.
- **Tinta 2 / Tinta 3** (ink-2, ink-3): texto secundario y etiquetas o metadatos.

### Named Rules
**The Lomo Es Identidad Rule.** Los colores de lomo identifican sociedades y nada más: raíl, borde superior de la pestaña activa y marca de cabecera. Nunca se usan como color de estado, de gráfico, de enlace o de botón; el estado siempre usa danger, warning u ok.

**The Acento Tinta Rule.** Enlaces, anillo de foco, caret, selección, avatar y botón primario son tinta o neutros. Con cuatro lomos en pantalla, cualquier acento de color en la UI competiría con la identidad de la sociedad.

## Typography

**Display Font:** ninguna
**Body Font:** sans del sistema (system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial)

**Character:** Tipografía de oficina, neutra y legible a primera hora; la personalidad la ponen los lomos, no la letra. Todo el cuerpo lleva `tabular-nums`.

### Hierarchy
- **Headline** (700, 1.25rem; 1.125rem en móvil): nombre de la sociedad en la cabecera y título de pantalla de módulo.
- **Figure** (700, 26px, 1.25, tabular): la cifra de cada indicador, alineada a la derecha.
- **Title** (700, 0.875rem): título de cada casilla de la hoja; pestaña activa en negrita, inactiva en 500.
- **Body** (400, 0.875rem): filas, tablas, detalle de indicadores y texto de notas.
- **Label** (600, 0.75rem, ink-3): rótulo de indicador y cabeceras de tabla, en caja normal.
- **Spine label** (600, 11px, 0.04em, mayúsculas): solo el nombre corto en la etiqueta blanca del lomo.

### Named Rules
**The Cifra Tabular Rule.** Todas las cifras son tabulares y se alinean a la derecha (columnas de importe y días, valores de indicador, importes de filas), para que se comparen en vertical.

**The Etiqueta de Lomo Rule.** La etiqueta del lomo mide siempre 11px en escritorio, nunca se escala para caber: si un lomo bajo no da para el nombre, puntos suspensivos y el nombre completo en `title`. El lomo activo mide al menos 236px de alto para que el suyo quepa siempre entero.

## Layout

Escritorio (md y superior): raíl fijo de 132px a la izquierda a pantalla completa (`h-dvh`), con scroll propio si hay muchas sociedades; el alto de cada lomo se reparte entre el número de sociedades (inactivos entre 160px y 262px, activo entre 236px y 262px). A la derecha, cabecera de 40px, pestañas de separador de 36px y la hoja, que ocupa el resto y hace scroll por dentro.

La hoja es una rejilla con `gap-px` sobre el color de línea: 1 columna en móvil, 2 en md, 4 en xl. La franja «Siguiente» ocupa todo el ancho; los cuatro indicadores van en una fila (xl); las tablas largas ocupan 2 columnas. La última fila absorbe el alto sobrante para que la pauta llegue al pie de la hoja. Casillas con 14px de alto y 16px (20px en md) de lado.

Móvil: el raíl se tumba en una balda horizontal con scroll, lomos de 44px de alto; la cabecera se reordena (nombre y avatar arriba, buscador a todo el ancho) y las tablas pasan a listas de dos columnas.

### Named Rules
**The Hoja Única Rule.** El área de trabajo es una sola hoja blanca pautada. Las regiones son casillas separadas por filetes de 1px, no tarjetas con borde, sombra o radio propios dentro de la hoja.

## Elevation & Depth

La hoja y sus controles son planos: la profundidad dentro del área de trabajo la dan los filetes y el cambio de tono (sheet frente a sheet-head), nunca sombras. La única sombra del sistema pertenece al objeto físico del mundo: el lomo del archivador.

### Shadow Vocabulary
- **Lomo en reposo** (`box-shadow: inset -6px 0 0 rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.2)`): el canto lateral del archivador y su apoyo en la balda.
- **Lomo activo** (`box-shadow: inset -8px 0 0 rgba(0,0,0,0.14), 4px 3px 10px rgba(0,0,0,0.25)`): el archivador sacado hacia delante.
- **Agujero de anilla** (`box-shadow: inset 0 0 0 4px rgba(255,255,255,0.35)` sobre ink al 55%): el ojal del lomo.

### Named Rules
**The Sombra Solo en el Lomo Rule.** Solo los lomos proyectan sombra, porque son el único objeto que sale de la estantería. Nada dentro de la hoja la lleva.

## Shapes

Esquinas pequeñas y funcionales. Lomos con 4px arriba y 2px abajo; pestañas de separador y esquina superior derecha de la hoja con 8px (la izquierda queda recta bajo las pestañas); botones y buscador con 6px; notas vacías con 4px; etiqueta «Datos de ejemplo» con 3px; marca de sociedad cuadrada con 2px. Las píldoras (radio completo) se reservan a chips de estado, barras de límite y puntos de prioridad. Los bordes son de 1px en shelf-edge; la pestaña activa añade 3px superiores del color del lomo.

## Components

### Buttons
- **Shape:** esquinas suaves (6px), 34px de alto, 16px de lado, 0.875rem en 600.
- **Primary:** fondo tinta, texto blanco; hover a un gris tinta más claro (#2c3038). Uno por franja de acción.
- **Secondary:** fondo hoja, borde shelf-edge, texto tinta; hover a sheet-head.
- **Focus:** anillo global de 2px en tinta con 2px de separación.

### Chips
- **Style:** píldora, 0.75rem, 2px por 8px. En reposo cartón con texto ink-2; con aviso, warning-soft, texto warning en 600 y anillo de 1px warning-line; con peligro, fondo danger y texto blanco; «en curso» (enviado, confirmado, pendiente de cobro), hoja blanca con anillo de 1px shelf-edge y texto ink: nunca azul, que es color de lomo.

### Cards / Containers
- **Casilla de hoja:** fondo hoja, sin radio, sin sombra, sin borde propio; la separación es el filete de 1px de la rejilla. Título 0.875rem en negrita con acción secundaria a la derecha (enlace 0.75rem ink-2 con flecha, subrayado en hover).
- **Indicador (Gauge):** rótulo arriba a la izquierda, cifra de 26px y detalle a la derecha; la cifra nunca va sola, lleva su contexto («de 46.300,00 € emitido · 69 %») o su barra de límite.
- **Nota vacía:** sheet-head, 4px de radio, icono ok y una frase que explica qué aparecería aquí y cómo llegaría.

### Inputs / Fields
- **Style:** buscador de 34px, fondo hoja, borde shelf-edge, 6px de radio, icono de lupa ink-3 y placeholder ink-3.
- **Focus:** el borde pasa a tinta y aparece un anillo de 2px en tinta al 15%.

### Navigation
- **Raíl de lomos:** ver componente propio.
- **Pestañas de separador:** 36px, 18px de lado, esquinas superiores de 8px. Inactiva: fondo balda, texto ink-2 en 500, hover a tinta. Activa: fondo hoja, texto tinta en negrita, borde superior de 3px del color del lomo activo, solapa 1px sobre la hoja para fundirse con ella. Scroll horizontal en móvil.

### Barra de límite (LimitBar)
Pista de 6px en cartón con relleno en píldora; tono ok, ink-2 (neutral) o danger según el significado, nunca un color de lomo. Expone `role="meter"` con su etiqueta. Toda cantidad con un máximo o mínimo se muestra contra él («40 / 200 ud» más la barra).

### Raíl de lomos (componente propio)
Cada sociedad es un lomo de color (64px de ancho inactivo, 104px activo) con etiqueta blanca vertical (texto girado 180°, ink, 11px en mayúsculas) y agujero de anilla al pie. El activo sale 6px hacia delante, crece y gana sombra; los inactivos se desplazan 4px al pasar el ratón. La transición de transform, ancho y sombra dura 200ms con ease-out-expo (`cubic-bezier(0.16, 1, 0.3, 1)`) y queda anulada con `prefers-reduced-motion`. Al cambiar de sociedad se conserva el módulo abierto. Nombre legal completo en `aria-label` y `title`.

## Do's and Don'ts

### Do:
- **Do** usar los colores de lomo solo en el raíl, el borde superior de la pestaña activa y la marca de cabecera de la sociedad.
- **Do** expresar el estado con danger, warning y ok (y sus variantes soft y line).
- **Do** mantener enlaces, foco, caret, selección y avatar en tinta o neutros.
- **Do** separar las regiones de la hoja con filetes de 1px (`gap-px` sobre line) y las filas con line-soft.
- **Do** alinear las cifras a la derecha con `tabular-nums` y mostrar cada cantidad contra su límite con la barra de límite.
- **Do** escribir los vacíos explicando qué aparecería y cómo llegaría, nunca un «sin datos».
- **Do** limitar el movimiento a la salida del lomo (200ms, ease-out-expo) y respetar reduced-motion.
- **Do** mantener la etiqueta del lomo en 11px fijos con puntos suspensivos y `title`, y el lomo activo con al menos 236px de alto.

### Don't:
- **Don't** usar un color de lomo como color de estado, de gráfico, de enlace o de botón.
- **Don't** anidar tarjetas con borde, radio o sombra dentro de la hoja.
- **Don't** poner sombras en nada que no sea un lomo.
- **Don't** introducir fuentes de display ni tamaños fluidos; la escala es fija en rem.
- **Don't** escalar la etiqueta del lomo para que quepa el nombre.
- **Don't** esconder el cambio de sociedad en un desplegable.
