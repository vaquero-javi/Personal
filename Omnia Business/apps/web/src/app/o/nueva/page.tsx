import { ActionForm, TextField } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { createOrganization } from '@/server/session-actions';

export const metadata = { title: 'Nueva sociedad · Omnia' };

export default function NewOrganizationPage() {
  return (
    <main className="flex min-w-0 flex-1 flex-col px-3 pt-3 md:px-6 md:pt-4">
      <h1 className="text-lg font-bold md:text-xl">Nueva sociedad</h1>
      <div className="mt-3.5 max-w-xl rounded-tr-lg border border-shelf-edge bg-sheet p-5">
        <p className="mb-4 text-sm text-ink-2">
          Cada sociedad es un archivador independiente: sus datos están aislados de las demás y tendrás el rol de propietario.
        </p>
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
    </main>
  );
}
