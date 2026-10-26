'use client';

import { createContext, useActionState, useContext, useEffect, useId, useTransition, type ComponentProps, type ReactNode } from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';
import type { ActionState } from '@/server/actions';

const FieldErrors = createContext<Record<string, string>>({});
/** Estado de envío del ActionForm (useFormStatus no lo ve porque el envío es manual). */
export const FormPending = createContext(false);
const FormErrorText = createContext<string | undefined>(undefined);

/** Errores por campo del último envío (p. ej. para listar errores de líneas). */
export const useFieldErrors = () => useContext(FieldErrors);

/** Error general del formulario donde lo pinte la pantalla (con `errorPlacement="manual"`). */
export function FormError() {
  const error = useContext(FormErrorText);
  return error ? <Notice tone="danger">{error}</Notice> : null;
}

export type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

export const FLASH_EVENT = 'omnia:flash';
export const flash = (message: string) => window.dispatchEvent(new CustomEvent(FLASH_EVENT, { detail: message }));

/**
 * Formulario ligado a una Server Action con estado: muestra el error general y
 * los errores por campo; el éxito se anuncia como aviso flotante (sobrevive
 * aunque el bloque desaparezca, p. ej. al emitir una factura).
 *
 * Sin JavaScript se envía de forma normal (progresivo). Con JavaScript el envío
 * es manual para que React no vacíe el formulario: si hay un error, lo escrito
 * se conserva. `resetOnSuccess` lo vacía solo cuando todo ha ido bien.
 */
export function ActionForm({
  action,
  children,
  className = '',
  successMessage,
  onSuccess,
  resetOnSuccess = false,
  errorPlacement = 'top',
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  successMessage?: string;
  onSuccess?: () => void;
  resetOnSuccess?: boolean;
  /** `manual`: el error lo pinta <FormError/> (p. ej. junto a los botones). */
  errorPlacement?: 'top' | 'manual';
}) {
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.ok && (result.message ?? successMessage)) flash((result.message ?? successMessage)!);
    return result;
  }, {});
  const [, startTransition] = useTransition();
  useEffect(() => {
    if (state.ok) onSuccess?.();
  }, [state, onSuccess]);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
        startTransition(() => formAction(formData));
      }}
      className={className}
      key={resetOnSuccess ? state.nonce : undefined}
    >
      <FieldErrors.Provider value={state.fieldErrors ?? {}}>
        <FormPending.Provider value={pending}>
          <FormErrorText.Provider value={state.error}>
            {errorPlacement === 'top' && state.error && <Notice tone="danger">{state.error}</Notice>}
            {children}
          </FormErrorText.Provider>
        </FormPending.Provider>
      </FieldErrors.Provider>
    </form>
  );
}

export function Notice({ tone, children }: { tone: 'danger' | 'ok' | 'warning'; children: ReactNode }) {
  const styles = {
    danger: 'border-danger/30 bg-danger-soft text-danger',
    ok: 'border-ok/30 bg-[#e9f4ec] text-ok',
    warning: 'border-warning-line bg-warning-soft text-warning',
  }[tone];
  const Icon = tone === 'ok' ? CircleCheck : CircleAlert;
  return (
    <p role={tone === 'danger' ? 'alert' : 'status'} className={`mb-4 flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm ${styles}`}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export const inputClass =
  'h-[34px] w-full rounded-md border border-shelf-edge bg-sheet px-3 text-sm text-ink placeholder:text-ink-3 focus:border-ink focus:ring-2 focus:ring-ink/15 focus:outline-none aria-[invalid=true]:border-danger disabled:bg-sheet-head disabled:text-ink-3';

/** Etiqueta + control + ayuda + error. El control recibe id y aria-* automáticamente. */
export function Field({
  label,
  name,
  hint,
  className = '',
  children,
}: {
  label: string;
  name: string;
  hint?: string;
  className?: string;
  children: (props: { id: string; name: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode;
}) {
  const id = useId();
  const errors = useContext(FieldErrors);
  const error = errors[name];
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-xs font-semibold text-ink-3">
        {label}
      </label>
      {children({ id, name, ...(error ? { 'aria-invalid': true } : {}), ...(describedBy ? { 'aria-describedby': describedBy } : {}) })}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-ink-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({ label, name, hint, className, ...props }: { label: string; name: string; hint?: string; className?: string } & ComponentProps<'input'>) {
  return (
    <Field label={label} name={name} {...(hint ? { hint } : {})} {...(className ? { className } : {})}>
      {(p) => <input {...p} {...props} className={inputClass} />}
    </Field>
  );
}

export function SelectField({
  label,
  name,
  hint,
  className,
  options,
  placeholder,
  ...props
}: {
  label: string;
  name: string;
  hint?: string;
  className?: string;
  options: readonly { value: string; label: string }[];
  placeholder?: string;
} & ComponentProps<'select'>) {
  return (
    <Field label={label} name={name} {...(hint ? { hint } : {})} {...(className ? { className } : {})}>
      {(p) => (
        <select {...p} {...props} className={inputClass}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function TextAreaField({ label, name, hint, className, ...props }: { label: string; name: string; hint?: string; className?: string } & ComponentProps<'textarea'>) {
  return (
    <Field label={label} name={name} {...(hint ? { hint } : {})} {...(className ? { className } : {})}>
      {(p) => <textarea {...p} {...props} className={`${inputClass} h-auto min-h-24 py-2`} />}
    </Field>
  );
}

export function CheckboxField({ label, name, hint, ...props }: { label: string; name: string; hint?: string } & ComponentProps<'input'>) {
  const id = useId();
  const errors = useContext(FieldErrors);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex items-center gap-2 text-sm">
        <input id={id} name={name} type="checkbox" className="size-4 accent-ink" {...props} />
        {label}
      </label>
      {hint && <p className="pl-6 text-xs text-ink-3">{hint}</p>}
      {errors[name] && <p className="pl-6 text-xs font-medium text-danger">{errors[name]}</p>}
    </div>
  );
}
