import type { SVGProps } from 'react'

// Iconos propios en un solo trazo (24×24, stroke 1.6) para no depender de emojis.
const PATHS = {
  home: 'M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z',
  calendar: 'M4.5 7.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2zM4.5 10h15M8.5 3.5v3M15.5 3.5v3',
  timeline: 'M6 4v16M6 7h.01M6 12h.01M6 17h.01M10 7h9M10 12h6M10 17h8',
  notes: 'M6.5 3.5h8l4 4v12a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1zM14 3.5V8h4.5M8.5 12.5h7M8.5 16h5',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13.5l1.3 1-2 3.4-1.5-.6a7 7 0 0 1-1.9 1.1L15 20h-4l-.3-1.6a7 7 0 0 1-1.9-1.1l-1.5.6-2-3.4 1.3-1a7 7 0 0 1 0-2.2l-1.3-1 2-3.4 1.5.6a7 7 0 0 1 1.9-1.1L11 4h4l.3 1.6a7 7 0 0 1 1.9 1.1l1.5-.6 2 3.4-1.3 1a7 7 0 0 1 0 2.2z',
  bell: 'M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14zM10 20.5a2 2 0 0 0 4 0',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5 10 17.5 19 7',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2',
  snooze: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 1.5M4 4.5 6.5 2.5M20 4.5l-2.5-2',
  pin: 'M9 3.5h6M10 3.5v6L7 13h10l-3-3.5v-6M12 13v7.5',
  trash: 'M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1l1-13M10 10.5v6M14 10.5v6',
  back: 'M14.5 5.5 8 12l6.5 6.5',
  chevronDown: 'M6.5 9.5 12 15l5.5-5.5',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z',
  monitor: 'M3.5 5.5a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1zM9 20.5h6M12 16.5v4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  logout: 'M14 4.5h4.5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H14M10 16l4-4-4-4M14 12H4',
  device: 'M7.5 3.5h9a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1zM11 17.5h2',
  folder: 'M3.5 7a1.5 1.5 0 0 1 1.5-1.5h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 18, ...props }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

/** Marca de CHRONON: el logo de public/logo.png teñido con el color de texto actual. */
const LOGO_RATIO = 620 / 672

export function Logo({ size = 28, className = '' }: { size?: number; className?: string }) {
  const mask = {
    maskImage: 'url(/logo.png)',
    WebkitMaskImage: 'url(/logo.png)',
    maskSize: 'contain',
    WebkitMaskSize: 'contain',
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
    maskPosition: 'center',
    WebkitMaskPosition: 'center',
  } as const

  return (
    <span
      role="img"
      aria-label="Chronon"
      className={`inline-block shrink-0 bg-current ${className}`}
      style={{ width: Math.round(size * LOGO_RATIO), height: size, ...mask }}
    />
  )
}
