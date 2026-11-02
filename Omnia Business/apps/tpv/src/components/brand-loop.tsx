/**
 * Animación de marca (pantalla de carga y fondo de la vinculación), redibujada
 * en vectorial a partir de public/brand/loading.mp4 para que se vea nítida a
 * cualquier tamaño: los aros se separan hasta tocarse, «Omnia» se desvanece y
 * todo vuelve. Medidas tomadas del vídeo; los tiempos, en globals.css (.brand-loop-*).
 */
export function BrandLoop({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 200" aria-hidden className={className}>
      <g fill="none" stroke="#111" strokeWidth={10}>
        <circle className="brand-loop-left" cx={129} cy={76.5} r={58} />
        <circle className="brand-loop-right" cx={191} cy={76.5} r={58} />
      </g>
      <text className="brand-loop-text" x={160} y={185} textAnchor="middle" fontSize={29} fontWeight={700} fill="#111">
        Omnia
      </text>
    </svg>
  );
}
