import { ActionForm, TextField } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { createOrganization } from '@/server/session-actions';
import { Window } from '@/components/shell/window';

export const metadata = { title: 'Nueva sociedad · Omnia' };

export default function NewOrganizationPage() {
  return (
    <Window>
      <header className="pt-4 md:pt-10">
        <h1 className="text-[28px] leading-[1.15] font-bold tracking-[-0.022em] md:text-[34px]">Nueva sociedad</h1>
        <p className="mt-1 max-w-xl text-[15px] text-ink-3">Sus datos quedan aislados de las demás sociedades y tendrás el rol de propietario.</p>
      </header>
      <div className="max-w-xl rounded-[var(--radius-card)] bg-sheet p-5 shadow-[var(--shadow-card)]">
        <ActionForm action={createOrganization} className="flex flex-col gap-4">
          <TextField label="Razón social" name="legalName" required placeholder="Distribuciones Ejemplo S.L." />
          <TextField label="NIF" name="taxId" required placeholder="B12345678" />
          <TextField
            label="Identificador en la dirección"
            name="slug"
            required
            placeholder="distribuciones-ejemplo"
            hint="Aparecerá en la URL: /o/distribuciones-ejemplo"
          />
          <div>
            <SubmitButton pendingLabel="Creando…">Crear sociedad</SubmitButton>
          </div>
        </ActionForm>
      </div>
    </Window>
  );
}
