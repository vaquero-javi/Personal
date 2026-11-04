import { Badge, Cell, EmptyState, PageHeader, Ruled } from '@/components/ui/layout';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { ActionForm, CheckboxField, SelectField, TextField } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { StaffCard } from '@/features/staff-cards/staff-card';
import { WalletButtons } from '@/features/staff-cards/wallet-buttons';
import { formatDate } from '@/lib/format';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { googleWalletLink, issueStaffCard, myCardQr, revokeStaffCard, saveStaffPolicy } from '../actions';

export const metadata = { title: 'Tarjetas de empleado · Ajustes · Omnia' };

const WALLETS = [
  { value: 'apple', label: 'Apple Wallet (iPhone)' },
  { value: 'google', label: 'Google Wallet (Android)' },
];

const pct = (v: string | null) => (v ? `${Number(v).toLocaleString('es-ES')} %` : '—');

export default async function StaffCardsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx, can } = await requireOrg(org);
  const manage = can('staff_cards.manage');
  const service = container().staffCards;
  const wallets = service.walletsAvailable();
  const [mine, policies, team, roles] = await Promise.all([
    service.myCards(ctx),
    manage ? service.policies(ctx) : Promise.resolve([]),
    manage ? service.team(ctx) : Promise.resolve([]),
    manage ? service.roles(ctx) : Promise.resolve([]),
  ]);
  const general = policies.find((p) => p.roleId === null);
  const byRole = new Map(policies.filter((p) => p.roleId).map((p) => [p.roleId!, p]));

  return (
    <>
      <PageHeader
        title="Tarjetas de empleado"
        description="Un QR personal para el descuento de empleado en el TPV. Se guarda en Apple o Google Wallet, o se enseña desde esta pantalla en el móvil."
      />
      <Ruled cols="xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Cell title="Tu tarjeta" className="xl:col-span-2">
          {mine.length === 0 ? (
            <EmptyState title="Todavía no tienes tarjeta de empleado">
              La emite un responsable desde esta misma pantalla. Cuando la tengas aparecerá aquí, lista para enseñarla en el TPV o guardarla en tu wallet.
            </EmptyState>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {mine.map((card) => (
                <div key={card.id} className="flex flex-col gap-3">
                  <StaffCard card={card} loadQr={myCardQr.bind(null, org, card.id)} />
                  <WalletButtons
                    wallet={card.wallet}
                    appleHref={`/o/${org}/ajustes/tarjetas/${card.id}/apple`}
                    appleReady={wallets.apple}
                    googleReady={wallets.google}
                    googleLink={googleWalletLink.bind(null, org, card.id)}
                  />
                  <p className="text-xs text-ink-3">
                    En el TPV te pedirán tu PIN de Omnia. No compartas capturas: cada uso queda registrado con tu nombre.
                  </p>
                </div>
              ))}
            </div>
          )}
        </Cell>

        {manage && (
          <>
            <Cell title="Descuento de empleado" className="xl:col-span-2">
              <p className="mb-3 text-sm text-ink-2">
                Cada persona recibe el descuento de su rol o, si su rol no tiene uno propio, el general. El porcentaje lo aplica siempre el servidor: el TPV no puede cambiarlo.
              </p>
              <ul className="divide-y divide-line border-y border-line">
                {[{ id: null as string | null, name: 'General (resto de roles)' }, ...roles].map((role) => {
                  const p = role.id ? byRole.get(role.id) : general;
                  return (
                    <li key={role.id ?? 'general'} className="grid gap-3 py-3 lg:grid-cols-[12rem_minmax(0,1fr)] lg:items-start">
                      <div className="pt-1">
                        <p className="font-medium">{role.name}</p>
                        {!p && <p className="text-xs text-ink-3">{role.id ? (general ? `Usa la general (${pct(general.discountPct)})` : 'Sin descuento') : 'Sin descuento general'}</p>}
                        {p && !p.isActive && <Badge tone="muted">Desactivado</Badge>}
                      </div>
                      <ActionForm action={saveStaffPolicy.bind(null, org, role.id)} className="grid grid-cols-2 items-start gap-3 sm:grid-cols-[6rem_6rem_7rem_minmax(0,1fr)_auto]">
                        <TextField label="Descuento %" name="discountPct" type="number" min={0.01} max={100} step={0.01} required defaultValue={p?.discountPct ?? ''} placeholder="—" />
                        <TextField label="Usos al día" name="maxUsesPerDay" type="number" min={1} max={50} defaultValue={p?.maxUsesPerDay ?? ''} placeholder="Sin límite" />
                        <TextField label="Tope €/mes" name="monthlyDiscountCap" type="number" min={1} step={0.01} defaultValue={p?.monthlyDiscountCap ?? ''} placeholder="Sin límite" />
                        <div className="col-span-2 flex flex-col gap-1 sm:col-span-1 sm:pt-5">
                          <CheckboxField label="Pedir el PIN del titular" name="requirePin" defaultChecked={p?.requirePin ?? true} />
                          <CheckboxField label="Puede aplicársela él mismo en el TPV" name="allowSelfService" defaultChecked={p?.allowSelfService ?? false} />
                          {p && <CheckboxField label="Desactivar" name="disabled" defaultChecked={!p.isActive} />}
                        </div>
                        <div className="sm:pt-5">
                          <SubmitButton variant="secondary">{p ? 'Guardar' : 'Crear'}</SubmitButton>
                        </div>
                      </ActionForm>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-sm text-ink-3">
                Con Apple Wallet el QR no cambia, así que una captura de pantalla funcionaría: deja «Pedir el PIN» activado. En Google Wallet el QR cambia cada 30 segundos y Android bloquea las capturas.
              </p>
            </Cell>

            <Cell title="Equipo" className="xl:col-span-2">
              <Table minWidth={900}>
                <thead>
                  <tr>
                    <Th>Persona</Th>
                    <Th>Rol</Th>
                    <Th>Le corresponde</Th>
                    <Th>Tarjetas activas</Th>
                    <Th>Emitir</Th>
                  </tr>
                </thead>
                <tbody>
                  {team.map((m) => (
                    <Tr key={m.userId}>
                      <Td className="font-medium">{m.name}</Td>
                      <Td className="text-ink-2">{m.roleName}</Td>
                      <Td>{m.discountPct ? <span className="font-semibold tabular-nums">−{pct(m.discountPct)}</span> : <span className="text-sm text-ink-3">Sin descuento</span>}</Td>
                      <Td>
                        {m.cards.length === 0 ? (
                          <span className="text-sm text-ink-3">Ninguna</span>
                        ) : (
                          <ul className="flex flex-col gap-2">
                            {m.cards.map((c) => (
                              <li key={c.id} className="flex flex-wrap items-center gap-2">
                                <Badge tone="ok">{c.wallet === 'apple' ? 'Apple' : 'Google'}</Badge>
                                <span className="text-xs text-ink-3">desde {formatDate(c.issuedAt.slice(0, 10))}</span>
                                <ActionForm action={revokeStaffCard.bind(null, org, c.id)} confirm={`¿Revocar la tarjeta ${c.wallet === 'apple' ? 'de Apple' : 'de Google'} de ${m.name}? Deja de valer en el TPV al momento y su pase queda anulado.`}>
                                  <SubmitButton variant="caution" className="h-7 px-2 text-xs">Revocar</SubmitButton>
                                </ActionForm>
                              </li>
                            ))}
                          </ul>
                        )}
                      </Td>
                      <Td>
                        <ActionForm action={issueStaffCard.bind(null, org, m.userId)} className="flex items-end gap-2">
                          <SelectField label="Wallet" name="wallet" options={WALLETS} defaultValue="apple" className="w-48" />
                          <SubmitButton variant="secondary" className="h-[34px]">
                            {m.cards.length > 0 ? 'Emitir otra' : 'Emitir'}
                          </SubmitButton>
                        </ActionForm>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
              <p className="mt-3 text-sm text-ink-3">
                Emitir otra en el mismo wallet revoca la anterior. Al dar de baja a alguien en Miembros, sus tarjetas se revocan solas.
              </p>
            </Cell>
          </>
        )}
      </Ruled>
    </>
  );
}
