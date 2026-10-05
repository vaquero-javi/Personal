---
name: ¡Feliz cumpleaños!
description: A birthday gift built as an arcade cabinet starring her; every screen is a screen of the game.
colors:
  ink: "#170b14"
  ink-2: "#2b1226"
  pink: "#ff3d8b"
  pink-deep: "#a3104f"
  gold: "#ffc53d"
  gold-deep: "#b9780c"
  paper: "#fff4ea"
  paper-dim: "#f0d9e4"
typography:
  display:
    fontFamily: "'Jersey 10', 'Pixelify Sans', monospace"
    fontSize: "clamp(3.4rem, 8.4vw, 6rem)"
    fontWeight: 400
    lineHeight: 0.82
    letterSpacing: "0.01em"
  headline:
    fontFamily: "'Jersey 10', 'Pixelify Sans', monospace"
    fontSize: "clamp(2.6rem, 4vw, 3.2rem)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.04em"
  body:
    fontFamily: "'Pixelify Sans', monospace"
    fontSize: "clamp(1.06rem, 1.5vw, 1.3rem)"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "'Press Start 2P', monospace"
    fontSize: "clamp(9px, 1.1vw, 12px)"
    fontWeight: 400
    lineHeight: 1
spacing:
  px: "4px"
  gutter: "clamp(16px, 3.2vw, 48px)"
  dialog-pad: "24px"
components:
  button-play:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.ink}"
    typography: "{typography.headline}"
    padding: "6px 28px 10px 22px"
  button-play-focus:
    backgroundColor: "{colors.pink}"
    textColor: "{colors.paper}"
  button-back:
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    padding: "12px 18px"
  button-back-hover:
    textColor: "{colors.gold}"
  button-back-focus:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.ink}"
  dialog-box:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.body}"
    padding: "{spacing.dialog-pad}"
    width: "min(100%, 64ch)"
  hud:
    textColor: "{colors.paper}"
    typography: "{typography.label}"
---

# Design System: ¡Feliz cumpleaños!

## Overview

**Creative North Star: "The Attract-Mode Cabinet"**

Every screen is a screen of an arcade machine that stars her. Her photographs are the cabinet's attract-mode plate, seen through fine scanlines and a dark CRT vignette; on top sit the things a game owns: a HUD strip, an extruded title, an RPG dialogue box, a big physical-feeling START button. The world is built from one unit, the 4px pixel, and everything (borders, corner steps, text extrusion, button travel, icon cells) is a multiple of it.

The palette is pulled from the night-party photo: wristband hot pink, leopard and fairy-light gold, deep plum-black ink, warm paper white. The type is pixel faces only, three of them with strict jobs. Depth is solid and stepped (stacked hard layers of colour), never blurred. Motion is stepped too: things blink, drop, pop and wipe in discrete frames.

The world refuses the birthday-card default: no confetti, balloons, script fonts, or a soft centred message over a faded photo. It also refuses glows, glass and gradient text.

**Key Characteristics:**
- One 4px pixel unit governs borders, corner steps, extrusion layers, button travel and focus rings.
- Photo full-bleed under scanlines and a vignette; ink scrims only where text must read.
- Three pixel faces with fixed roles: display marquee, readable dialogue text, HUD/control micro-type.
- Solid stepped depth: hard 4px colour layers, no blur.
- Stepped motion (`steps()`), with a single smooth exception for the CRT power-on.

## Colors

A night-party palette: two hot accents (pink and gold) each with a deep "shadow" partner, over plum-black ink and warm paper.

### Primary
- **Wristband Pink** (`pink`): the frame colour of the dialogue box, the first extrusion layer under titles, HUD hearts, focus fill of the START button, text selection, and the dominant block colour of the pixel wipe.
- **Bruised Magenta** (`pink-deep`): pink's shadow. Second extrusion layer under titles, the START cursor arrow, the pressed edge of the focused START button.

### Secondary
- **Fairy-Light Gold** (`gold`): the START button face, the accent title line, HUD labels, the typing caret and blinking skip marker, the lock icon, and every focus ring.
- **Leopard Amber** (`gold-deep`): gold's shadow. The thick bottom edge ("cabinet lip") of the START button.

### Neutral
- **Plum Ink** (`ink`): page ground, dialogue box fill, the last extrusion layer and HUD text shadow, START button text, photo scrims (at 70% and 85%).
- **Velvet Plum** (`ink-2`): the lit centre of the radial ground on non-photo screens.
- **Paper** (`paper`): primary text on ink; title face colour.
- **Dusty Rose Paper** (`paper-dim`): the inner hairline of the dialogue frame, secondary text, the idle border of outline buttons, the skip control.

### Named Rules
**The Paired Shadow Rule.** Each accent has exactly one deep partner (pink/pink-deep, gold/gold-deep), and depth under an accent is always drawn with its partner, then ink. Never darken an accent with opacity or black.

**The Gold Means Act Rule.** Gold marks what she can act on or where attention sits: the START face, the caret, the skip marker, every focus ring. Pink frames and decorates.

## Typography

**Display Font:** Jersey 10 (with Pixelify Sans, monospace)
**Body Font:** Pixelify Sans (with monospace)
**Label/Mono Font:** Press Start 2P (with monospace)

**Character:** A tall, condensed arcade marquee face for anything shouted, a soft rounded pixel face for anything read, and the classic 8-bit system font for the machine's own voice. All three are self-hosted via Fontsource; font smoothing is off so pixels stay crisp.

### Hierarchy
- **Display** (400, clamp(3.4rem, 8.4vw, 6rem), 0.82): screen titles, uppercase, with the three-layer extrusion. An accent line may run at 1.32em in gold. On phones it steps to clamp(2.6rem, 13.5vw, 3.6rem); on short landscape screens to clamp(2.2rem, 11vh, 3.4rem).
- **Headline** (400, clamp(2.6rem, 4vw, 3.2rem), 1, 0.04em): the START button label, uppercase.
- **Body** (400, clamp(1.06rem, 1.5vw, 1.3rem), 1.45): dialogue text, `text-wrap: pretty`, box capped at 64ch. Never smaller than about 0.95rem.
- **Label** (400, clamp(9px, 1.1vw, 12px), 1, uppercase): HUD readouts. Secondary controls (skip, back) use the same face at 10 to 11px with line-height 1.3 to 1.4.

### Named Rules
**The Three Voices Rule.** Jersey 10 shouts (titles, START), Pixelify Sans speaks (anything she reads as a sentence), Press Start 2P is the machine (HUD, small controls). Never set a sentence in Press Start 2P, and never use a non-pixel face.

## Layout

Each screen is a fixed full-viewport stage: a three-row grid (HUD / content / bottom) with a fluid gutter (`gutter`) that respects safe-area insets. The HUD runs edge to edge as a single spaced-between strip: player, level number (zero-padded), lives. On the photo screen the title anchors top-left over the darkest part of the image and the dialogue box anchors bottom-left; the subject's face stays visible between them at every aspect ratio (`object-position: 52% 30%`). Non-photo screens centre a single column of icon, title, note and action with an 18px gap.

Breakpoints: below 600px the dialogue padding tightens to 18px and the START button goes full width; on landscape screens shorter than 560px, type and padding compress so everything fits in one view; at 900px+ landscape the accent title line stays on one line.

**The Pixel Grid Rule.** Structural dimensions (borders, steps, offsets, press travel, icon cells) are multiples of `px` (4px). Pixel icons render at integer cell sizes (4px or 8px per cell).

## Elevation & Depth

Depth is solid, stepped colour, never blur. Three devices carry it: stacked hard text-shadows that extrude titles downward like a painted arcade marquee; a thick darker bottom border that gives the START button a physical lip; and the dialogue box's layered frame (pink border, ink gap, paper-dim hairline drawn as inset spreads). The atmosphere layer (scanlines plus vignette) sits above the photo and below all controls.

### Shadow Vocabulary
- **Marquee extrusion** (`text-shadow: 0 4px 0 pink, 0 8px 0 pink-deep, 0 12px 0 ink`): display titles over a photo. Non-photo screens may drop the ink layer.
- **HUD drop** (`text-shadow: 0 4px 0 ink`; icons use `drop-shadow(0 4px 0 ink)`): keeps HUD readable over any photo.
- **Dialogue frame** (`box-shadow: inset 0 0 0 4px ink, inset 0 0 0 8px paper-dim` inside a 4px pink border): the RPG box.
- **Cabinet lip** (`border-bottom: 8px solid gold-deep`, collapsing to 4px with a 4px translate on press): START.

### Named Rules
**The No-Blur Rule.** Every shadow has zero blur and a 4px-multiple vertical offset. No glows, no soft drop shadows, no glass.

## Shapes

Square pixels throughout; there is no border-radius anywhere. Framed elements (dialogue box, START, outline buttons) get stepped corners: a clip-path that bites one 4px pixel out of each corner, the way sprite boxes read on old hardware. Borders are a solid 4px. Icons are drawn cell by cell as SVG rects with `crispEdges`, filled with `currentColor`.

## Components

### Buttons
- **Shape:** square with stepped 4px corners; no radius.
- **START (primary):** gold face, ink headline label, 8px gold-deep bottom lip, a blinking pink-deep pixel cursor arrow nudging 4px in two steps. Pops in with `steps(4)` when it appears.
- **Hover / Focus:** hover lightens the gold face. Focus fills the button pink with paper text and a pink-deep lip, cursor turns gold (the corner clip would cut a ring, so focus is drawn inside). Active presses the button down 4px and halves the lip.
- **Outline (secondary):** transparent, 4px paper-dim border, Press Start 2P 10px uppercase. Hover turns border and text gold; focus fills it gold with ink text.
- **Skip (tertiary):** borderless Press Start 2P 11px in paper-dim with a blinking gold pixel down-arrow; it stands in for START while text is still typing.

### Dialogue Box
The RPG text box: ink fill, layered pink/ink/paper-dim stepped frame, 24px padding (18px on phones), body type at 1.45 line-height, max 64ch. Text types in character by character with longer pauses on punctuation; a gold block caret blinks at the end; the full text is reserved invisibly so the box never reflows, and screen readers get the whole message at once. Tapping the box or pressing Enter/Space completes the text. Opens with a 4-step vertical scale.

### HUD
A top strip in Press Start 2P: gold labels ("Jugadora", "Nivel") with paper values, level zero-padded, three pink pixel hearts for lives, all with the 4px ink drop. Present on every screen.

### Pixel Icons
A small set of hand-drawn pixel shapes (heart, arrow, down, lock) defined as character grids and rendered as SVG cells in `currentColor`. New icons follow the same method; no icon fonts, no emoji, no vector icon libraries.

### Scanlines (CRT overlay)
A non-interactive layer on every screen: 1px dark lines every 3px plus a radial vignette to plum-black at the edges. Sits above imagery, below HUD and controls.

### Pixel Wipe (screen transition)
Screen changes are covered and then revealed by a grid of square blocks (about 8 per short side) switching on in random order in 45ms steps: mostly pink, with ink and gold blocks scattered through. Skipped under reduced motion. Paired with a chiptune coin/blip sound.

### Arcade Cabinet (level select)
The level picker is drawn as the front of an arcade machine: a pink marquee with the extruded title between gold pixel hearts, an ink-2 body with pink-deep side panels, an inner ink screen with its own scanlines, and a control deck under a pink lip. The screen holds one card per level (photo 4:3 in a 4px frame, gold when selected with a blinking gold down-cursor above it, unselected photos desaturated; number tag bottom-left; "Nivel" in pink plus the name in display type; a full-width START button). The deck carries a pixel joystick that tilts on input, left/right pad buttons (pink-deep when disabled) and a large gold A button that plays the selected level. Arrow keys move the selection. On phones the screen becomes a one-card scroll-snap carousel with square pagination pixels.

### Word Search (sopa de letras)
Level game board: a 10x10 grid of display-face letters inside the dialogue frame (pink 4px border, inner paper-dim line), over the level photo dimmed to 45% brightness. Cells are square (up to 52px). The live selection fills gold with ink letters; found words stay filled pink with paper letters; a first tapped letter blinks gold (tap-tap selection for phones, drag for pointer, arrow keys plus Enter for keyboard). A wrong line shakes the board in 6 steps. The word list sits beside the board on desktop and under it on phones; found words turn gold with a 4px pink-deep strike. Completion opens a centred "¡Nivel superado!" box with a blinking pink heart and the START button, and the level card in the cabinet gets a gold "Superado" tag.

### Block Blast
An 8x8 board in the dialogue frame; empty cells are ink-2 with a 2px ink joint. Blocks are bevelled pixel tiles in four token pairs (pink/pink-deep, gold/gold-deep, paper-dim/gold-deep, pink-deep/ink), each with a light top edge and a dark bottom edge. Three pieces wait in a tray of ink-bordered slots at half scale (gold border when selected, faded when they no longer fit). Dragging lifts the piece to full size (above the finger on touch); the landing spot previews at 55% opacity and any row or column it would complete gets a gold inset outline. Cleared lines flash paper three times. The score uses the display face with a floating gold "+N" and a 12-segment gold progress bar toward the target. Running out of room opens the end box in pink ("¡Sin hueco!") with Reintentar and Volver.

### Screw Out 3D
A toy house rendered in three.js at half resolution and scaled up with `image-rendering: pixelated`, cel-shaded with a three-step toon ramp, on an ink ground inside the dialogue frame. Materials come from the tokens: gold-deep walls, pink-deep roof and gift, ink-2 base, door and chimney, gold-lit window glass, paper-dim furniture. Screws are short pixel cylinders in pink, gold or paper with an ink rim and an ink cross slot, set on the part's surface. Drag orbits the camera (no pan, clamped above ground); a tap without movement unscrews the screw under the finger (it spins out along its axis), a covered screw wiggles. A part with no screws left drops and tumbles out of view. Above the scene sit two colour boxes (always different colours when possible) and a six-slot waiting tray in the same box and slot language as before; the panel counts screws removed out of the total ("Tornillos 12 / 45") on the same 12-segment bar, and the level ends when the last screw is out.

## Do's and Don'ts

### Do:
- **Do** size every border, step, offset and press travel in multiples of 4px.
- **Do** extrude display titles with the pink, pink-deep, ink stack, and draw depth under an accent with its own deep partner.
- **Do** animate UI with `steps()` timing (blink 0.6 to 0.8s, drop steps(5), pop-in steps(4), wipe 45ms steps). Reserve the smooth `ease-out` curve for the CRT power-on.
- **Do** keep her face visible in every crop of a photo screen, with ink scrims only behind the title and dialogue.
- **Do** honour reduced motion: skip the boot, show the full text and START at once, and cut instead of wiping.
- **Do** draw new icons as pixel grids in `currentColor`.

### Don't:
- **Don't** use border-radius; frames get stepped pixel corners instead.
- **Don't** use blurred shadows, glows, glassmorphism or gradient-filled text. (Gradients are allowed only for the scanline, vignette and photo-scrim atmosphere.)
- **Don't** use non-pixel typefaces, script fonts, or Press Start 2P for running sentences.
- **Don't** reach for birthday-card props: confetti, balloons, cake clip-art, or a soft centred message over a faded photo.
- **Don't** introduce colours outside the eight tokens; tints come from the token pairs, not new hues.
