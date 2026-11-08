---
name: Omnia Business
description: ERP/CRM multisociedad con el lenguaje de una app de Apple (macOS / iPadOS).
colors:
  window: "#f2f2f7 / #000000"        # --color-carton (systemGroupedBackground)
  sidebar: "material translúcido"   # --color-shelf + backdrop-filter
  card: "#ffffff / #1c1c1e"          # --color-sheet
  fill: "rgb(118 118 128 / .12 | .24)"  # --color-fill (campos, segmentados, chips)
  separator: "rgb(60 60 67 / .18) / rgb(84 84 88 / .65)"  # --color-line, line-soft
  label: "#1d1d1f / #f5f5f7"         # --color-ink
  secondary-label: "#48484a / #d1d1d6"  # --color-ink-2
  tertiary-label: "#6e6e73 / #98989d"   # --color-ink-3 (AA sobre blanco)
  tint: "#007aff / #0a84ff"          # --color-tint (acento del sistema)
  danger: "#d70015 / #ff6961"
  warning: "#b25000 / #ffb340"
  ok: "#248a3d / #30d158"
  system: "blue indigo purple pink red orange yellow green teal gray (--color-sys-*)"
typography:
  family: "-apple-system / SF Pro (Text y Display), system-ui como respaldo"
  large-title: "28px móvil, 32–34px escritorio, 700, -0.022em, 1.15"
  title: "17px, 600, -0.01em (título de tarjeta)"
  body: "14–15px, 400, tabular-nums"
  caption: "12–13px, 500, ink-3"
rounded:
  card: "14px"
  field: "10px"
  segment: "10px (pista) / 8px (segmento)"
  sidebar-row: "9px"
  icon-tile: "7px"
  button: "9999px (cápsula)"
---

# Design System: Omnia Business

## Overview

**North Star: «Una app de Apple».** Omnia se ve y se comporta como una app nativa de macOS / iPadOS: barra lateral translúcida con iconos de color al estilo de Ajustes, títulos grandes, contenido en tarjetas agrupadas sobre un fondo gris, un único color de acento (azul del sistema) y modo oscuro automático. Los tokens viven en `apps/web/src/app/globals.css`; los nombres antiguos (`carton`, `sheet`, `ink`…) se conservan como alias para que todas las pantallas hereden el sistema.

## Colores

- **Fondo de ventana** (`carton`): gris agrupado en claro, negro en oscuro.
- **Tarjeta** (`sheet`): blanco / gris elevado `#1c1c1e`.
- **Relleno** (`fill`, `fill-strong`): campos de texto, pistas de segmentados, chips, hover de filas. Sustituye a los bordes.
- **Separadores** (`line`, `line-soft`): finos y translúcidos; nunca para delimitar regiones (para eso están las tarjetas).
- **Etiquetas** (`ink`, `ink-2`, `ink-3`): jerarquía de texto. `ink-3` está oscurecido respecto al de Apple para cumplir AA.
- **Tint** (`tint`, `tint-hover`, `tint-soft`, `on-tint`): botón primario, enlaces de acción, selección de la barra lateral, foco, caret, checkboxes, segmento seleccionado de filtros.
- **Estado** (`danger`, `warning`, `ok` y sus `-soft`): siempre como texto sobre fondo suave (chip), nunca bloques saturados.
- **Sistema** (`sys-*`): solo para las baldosas de iconos de la barra lateral, barras de progreso y gráficos.
- **Colores de sociedad** (`spine-*`, o un hex elegido): el círculo con la inicial de cada sociedad en la barra lateral y el punto junto a su nombre en la barra de herramientas.

Modo oscuro: todos los tokens se redefinen en `@media (prefers-color-scheme: dark)`. No escribas hex sueltos en componentes: usa tokens o `var(--color-…)` (los gráficos incluidos).

## Tipografía

Fuente del sistema (SF Pro en Apple). Tracking por tamaño: títulos grandes negativos (`-0.022em`), cuerpo casi neutro. Jerarquía con peso + tamaño: título grande de pantalla (`PageHeader`), título de tarjeta de 16–17px semibold, cuerpo de 14–15px, rótulos de 12–13px en `ink-3`. Cifras siempre `tabular-nums`; los importes de tabla, a la derecha.

## Estructura

- **Barra lateral** (`components/shell/sidebar.tsx`, 264px, material translúcido): logo, búsqueda en cápsula gris, sección con el nombre de la sociedad y sus módulos (baldosa de color 26px + nombre; el activo con relleno `tint`), sección «Sociedades» (+ para crear, «Vista de grupo», una fila por sociedad con círculo de color; la abierta con relleno gris), y el usuario con «Salir» al pie. Al cambiar de sociedad se conserva el módulo abierto.
- **Móvil**: barra de navegación translúcida de 52px con botón de barra lateral (tint) y título centrado; la barra lateral se abre como hoja desde la izquierda (`<dialog>`, se cierra al navegar, con Escape o tocando fuera).
- **Ventana** (`components/shell/window.tsx`): columna con scroll propio, barra de herramientas translúcida (nombre de la sociedad) cuyo filete solo aparece cuando hay contenido debajo, y contenido centrado (máx. 1320px) con huecos de 16–20px.
- **Pantalla**: segmentado de secciones (`SubNav`) → título grande con descripción y acciones (`PageHeader`, «‹ Atrás» en tint) → tarjetas (`Cell`, en rejilla con `Ruled`).

## Componentes

- **Botones** (`button-styles.ts`): cápsula de 36px. Primario relleno `tint`; secundario relleno `fill` con texto `tint`; `danger` relleno rojo suave; `ghost` solo texto tint. Todos con `.pressable` (escala 0.97 al pulsar, respuesta inmediata en pointer-down).
- **Campos** (`inputClass`): 36px, radio 10px, relleno `fill` sin borde; al enfocar, fondo de tarjeta y anillo `tint` de 3px. Etiqueta encima en 13px `ink-2`.
- **Segmentados** (`SubNav`, tipo de factura, forma de pago, modo de albarán): pista `fill` con 2px de margen; el segmento activo es una píldora blanca (gris en oscuro) con `--shadow-raised`.
- **Chips de filtro**: cápsulas `fill`; la activa en `tint`.
- **Badges**: cápsula de 12px semibold, texto de estado sobre su `-soft`.
- **Tarjeta** (`Cell`, `Panel`, `Gauge`): radio 14px, `--shadow-card` (en oscuro solo un filo de 0,5px). Las tablas van a sangre dentro de la tarjeta con cabecera discreta (12px, `ink-3`, sin fondo) y filas separadas por `line-soft`.
- **Listas de datos** (`Facts`): filas con separador, etiqueta a la izquierda en `ink-3`, valor a la derecha.
- **Vacíos** (`EmptyState`): centrados, icono grande tenue, título de 17px y una frase que explica qué aparecerá.
- **Avisos** (`Notice`): bloque redondeado (12px) en el tono suave del estado. **Toast** (`FlashHost`): cápsula de material translúcido centrada abajo, entra con escala + desenfoque.
- **Indicadores** (`Gauge`): rótulo 13px, cifra de 30px bold con tracking negativo, detalle debajo y barra de progreso (`LimitBar`) en color del sistema.

## Profundidad y materiales

- Material translúcido (`.material`, `.material-bar`: `backdrop-filter: saturate(180%) blur(20–24px)`) solo para cromo flotante: barra lateral, barras de herramientas, toast, barra de acciones fija del editor de facturas, tooltips.
- Sombras por token: `--shadow-card` (tarjetas), `--shadow-raised` (segmento activo, logo), `--shadow-float` (popovers, hojas, toast).
- No apiles un material claro sobre otro.

## Movimiento y accesibilidad

- Respuesta al pulsar inmediata (`.pressable`), transiciones cortas con `--ease-spring` (`cubic-bezier(0.32, 0.72, 0, 1)`). Hoja móvil: entra desde la izquierda en 320ms; el scrim se funde.
- `prefers-reduced-motion`: sin escalas ni desplazamientos. `prefers-reduced-transparency`: los materiales pasan a sólidos.
- Foco visible con anillo `tint` de 3px. Contraste AA en todos los textos de `ink-3` y estados.

## Excepciones

**Tarjeta de empleado** (`features/staff-cards/staff-card.tsx` y `staff-card-dialog.tsx` del TPV): mantiene su escenario oscuro propio con cristal, chip y QR sobre baldosa blanca opaca; es un objeto físico, no parte del cromo de la app.

**PDF de factura** (`invoice-pdf.tsx`): documento impreso, no sigue el tema de la app.

## Do / Don't

- **Do** usar tokens (`bg-sheet`, `bg-fill`, `text-tint`…) y dejar que el modo oscuro salga solo.
- **Do** agrupar en tarjetas y separar regiones con espacio, no con filetes.
- **Do** un solo botón primario (tint) por grupo de acciones.
- **Don't** escribir hex en componentes (salvo la tarjeta de empleado).
- **Don't** usar `bg-ink` como relleno: en oscuro `ink` es casi blanco.
- **Don't** usar los colores `sys-*` para estado; el estado es `danger` / `warning` / `ok`.
