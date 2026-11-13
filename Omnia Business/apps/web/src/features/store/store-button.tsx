import { ActionForm } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { installFeature, uninstallFeature } from '@/app/o/[org]/store/actions';

/** Comprar o desinstalar un módulo Pro desde la Store. Desinstalar pide confirmación. */
export function StoreButton({ org, code, name, installed, disabled }: { org: string; code: string; name: string; installed: boolean; disabled: boolean }) {
  return installed ? (
    <ActionForm
      action={uninstallFeature.bind(null, org, code)}
      confirm={`¿Desinstalar «${name}»? Se bloqueará al momento para toda la sociedad. Los datos se conservan y vuelven si lo compras otra vez.`}
    >
      <SubmitButton variant="secondary" className="h-8 px-3.5" pendingLabel="Desinstalando…">
        Desinstalar
      </SubmitButton>
    </ActionForm>
  ) : (
    <ActionForm action={installFeature.bind(null, org, code)}>
      <SubmitButton variant="primary" className="h-8 px-3.5" pendingLabel="Comprando…" {...(disabled ? { disabled: true } : {})}>
        Comprar
      </SubmitButton>
    </ActionForm>
  );
}
