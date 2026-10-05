// Iconos pixel-art dibujados celda a celda: cada '#' es un píxel en currentColor;
// las letras usan colores fijos de la paleta.
const INKS = { p: 'var(--pink)', w: 'var(--paper)', k: 'var(--ink)', g: 'var(--gold-deep)' }
const SHAPES = {
  heart: [
    '.##.##.',
    '#######',
    '#######',
    '.#####.',
    '..###..',
    '...#...',
  ],
  arrow: [
    '#...',
    '##..',
    '###.',
    '####',
    '###.',
    '##..',
    '#...',
  ],
  down: [
    '#####',
    '.###.',
    '..#..',
  ],
  joystick: [
    '...pppp...',
    '..pppppp..',
    '..ppwppp..',
    '..pppppp..',
    '...pppp...',
    '....kk....',
    '....kk....',
    '....kk....',
    '..gggggg..',
    '.gggggggg.',
  ],
  lock: [
    '..###..',
    '.#...#.',
    '.#...#.',
    '#######',
    '###.###',
    '###.###',
    '#######',
  ],
}

export default function PixelIcon({ name, className, size = 4 }) {
  const rows = SHAPES[name]
  const w = rows[0].length
  const h = rows.length
  return (
    <svg
      className={className}
      viewBox={`0 0 ${w} ${h}`}
      width={w * size}
      height={h * size}
      shapeRendering="crispEdges"
      aria-hidden="true"
      fill="currentColor"
    >
      {rows.flatMap((row, y) =>
        [...row].map((c, x) =>
          c === '.' ? null : (
            <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={INKS[c]} />
          ),
        ),
      )}
    </svg>
  )
}
