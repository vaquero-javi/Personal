'use client';

import Link from 'next/link';
import { useContext, type ComponentProps, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { LoaderCircle } from 'lucide-react';
import { FormPending } from './form';
import { buttonClass, type ButtonVariant } from './button-styles';

export { buttonClass, type ButtonVariant };

export function Button({ variant = 'secondary', className = '', ...props }: ComponentProps<'button'> & { variant?: ButtonVariant }) {
  return <button type="button" className={buttonClass(variant, className)} {...props} />;
}

/** Botón de envío con estado de carga del formulario que lo contiene. */
export function SubmitButton({
  variant = 'primary',
  children,
  pendingLabel,
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant; pendingLabel?: string }) {
  const status = useFormStatus();
  const manualPending = useContext(FormPending);
  const pending = status.pending || manualPending;
  return (
    <button type="submit" disabled={pending || props.disabled} aria-busy={pending} className={buttonClass(variant, className)} {...props}>
      {pending && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

export function LinkButton({ href, variant = 'secondary', children, className = '' }: { href: string; variant?: ButtonVariant; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={buttonClass(variant, className)}>
      {children}
    </Link>
  );
}
