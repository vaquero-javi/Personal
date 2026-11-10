/** Destinos de los botones. De momento todos llevan a la app; se configurarán más adelante. */
export const TRIAL_HREF = '/app';
export const BUY_HREF = '/app';
export const ENTER_HREF = '/app';
/** Agendar una reunión con el equipo. Pendiente: enlace de calendario o email de contacto. */
export const CONTACT_HREF = '/app';

/** Los dos anillos del logo de Omnia, en vectorial y del color del texto. */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="34 65 187 126" className={className} fill="none" stroke="currentColor" strokeWidth={12}>
      <circle cx={97} cy={128} r={57} />
      <circle cx={158} cy={128} r={57} />
    </svg>
  );
}
