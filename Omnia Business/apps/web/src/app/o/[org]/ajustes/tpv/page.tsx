import { Badge, Cell, PageHeader, Ruled } from '@/components/ui/layout';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { ActionForm, CheckboxField, Notice, SelectField, TextField } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { NewTerminalForm, PairingCodeButton } from '@/features/pos/terminal-pairing';
import { formatDateTime, formatTime } from '@/lib/format';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import {
  clearStaffPin,
  createPosTerminal,
  newPosPairingCode,
  removePosCategory,
  removePosTable,
  restorePosTable,
  savePosCategory,
  savePosTable,
  setNegativeStock,
  setPosTicketsVerifactu,
  setStaffPin,
  revokePosTerminal,
} from '../actions';

export const metadata = { title: 'TPV · Ajustes · Omnia' };

const TICKET_MODES = [
  { value: 'on', label: 'Con VeriFactu (QR y envío a Hacienda)' },
  { value: 'off', label: 'Sin VeriFactu (solo factura simplificada)' },
];

const ICONS = [
  { value: 'beer', label: 'Cerveza' },
  { value: 'wine', label: 'Vino' },
  { value: 'martini', label: 'Cóctel' },
  { value: 'cup-soda', label: 'Refresco' },
  { value: 'coffee', label: 'Café' },
  { value: 'utensils', label: 'Cubiertos' },
  { value: 'salad', label: 'Ensalada' },
  { value: 'beef', label: 'Carne' },
  { value: 'fish', label: 'Pescado' },
  { value: 'sandwich', label: 'Bocadillo' },
  { value: 'pizza', label: 'Pizza' },
  { value: 'ice-cream', label: 'Postre' },
];

export default async function PosSettingsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx, can } = await requireOrg(org);
  if (!can('pos.manage')) {
    return (
      <>
        <PageHeader title="TPV" />
        <Cell>
          <Notice tone="warning">Configurar el TPV requiere el permiso de encargado de TPV.</Notice>
        </Cell>
      </>
    );
  }
  const [terminals, pins, floor, categories, warehouses, settings] = await Promise.all([
    container().pos.terminals(ctx),
    container().pos.pinStatus(ctx),
    container().pos.floor(ctx, { includeInactive: true }),
    container().pos.categories(ctx),
    container().warehouse.warehouses(ctx),
    container().pos.settings(ctx),
  ]);
  const tpvUrl = process.env.TPV_URL ?? 'http://localhost:3200';
  const staff = pins.filter((p) => p.canUsePos);

  return (
    <>
      <PageHeader
        title="TPV"
        description="Terminales de sala, PIN del personal, mesas y carta. El TPV es una app aparte que usa los mismos datos: el stock, los tickets y la caja se ven aquí."
        actions={
          <a href={tpvUrl} target="_blank" rel="noreferrer" className="inline-flex h-[34px] items-center rounded-md bg-ink px-4 text-sm font-bold text-white hover:bg-[#2c3038]">
            Abrir el TPV
          </a>
        }
      />
      <Ruled cols="xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Cell title="Terminales">
          {terminals.length === 0 ? (
            <p className="text-sm text-ink-2">Aún no hay terminales. Crea uno y vincula la tablet con el código.</p>
          ) : (
            <Table minWidth={640}>
              <thead>
                <tr>
                  <Th>Terminal</Th>
                  <Th>Estado</Th>
                  <Th>Caja</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {terminals.map((t) => (
                  <Tr key={t.id}>
                    <Td>
                      <span className="font-medium">{t.name}</span>
                      <span className="block text-xs text-ink-3">Descuenta de {t.warehouseName}</span>
                    </Td>
                    <Td>
                      {t.revokedAt ? (
                        <Badge tone="muted">Desvinculado</Badge>
                      ) : t.pairedAt ? (
                        <>
                          <Badge tone="ok">Vinculado</Badge>
                          <span className="block text-xs text-ink-3">Último uso {formatDateTime(t.lastSeenAt)}</span>
                        </>
                      ) : (
                        <Badge tone="warning">Pendiente</Badge>
                      )}
                      {t.pairingExpiresAt && new Date(t.pairingExpiresAt) > new Date() && (
                        <span className="block text-xs text-ink-3">Código vigente hasta las {formatTime(t.pairingExpiresAt)}</span>
                      )}
                    </Td>
                    <Td>{t.cashOpen ? <Badge tone="ok">Abierta</Badge> : <span className="text-sm text-ink-3">Cerrada</span>}</Td>
                    <Td>
                      <div className="flex flex-col items-end gap-2">
                        <PairingCodeButton generate={newPosPairingCode.bind(null, org, t.id)} label={t.pairedAt && !t.revokedAt ? 'Vincular otra tablet' : 'Nuevo código'} />
                        {!t.revokedAt && t.pairedAt && (
                          <ActionForm action={revokePosTerminal.bind(null, org, t.id)}>
                            <SubmitButton variant="secondary" className="h-8 px-3 text-danger">Desvincular</SubmitButton>
                          </ActionForm>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Cell>
        <Cell title="Nuevo terminal">
          {warehouses.length === 0 ? (
            <Notice tone="warning">Crea antes un almacén en Almacén: el terminal descuenta de él lo que se vende.</Notice>
          ) : (
            <NewTerminalForm warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))} create={createPosTerminal.bind(null, org)} />
          )}
        </Cell>

        <Cell title="PIN del personal" className="xl:col-span-2">
          <p className="mb-3 text-sm text-ink-2">
            Aparecen las personas cuyo rol puede usar el TPV (Camarero, Encargado, Administración y Propietario). Cada una entra en la tablet con su PIN de 4 a 6 cifras; cinco fallos seguidos lo bloquean cinco minutos.
          </p>
          <Table minWidth={720}>
            <thead>
              <tr>
                <Th>Persona</Th>
                <Th>Rol</Th>
                <Th>PIN</Th>
                <Th>Asignar PIN</Th>
              </tr>
            </thead>
            <tbody>
              {staff.map((p) => (
                <Tr key={p.userId}>
                  <Td className="font-medium">{p.fullName}</Td>
                  <Td className="text-ink-2">{p.roleName}</Td>
                  <Td>
                    {p.hasPin ? <Badge tone="ok">Asignado</Badge> : <Badge tone="warning">Sin PIN</Badge>}
                    {p.lockedUntil && new Date(p.lockedUntil) > new Date() && <span className="block text-xs font-medium text-danger">Bloqueado hasta las {formatTime(p.lockedUntil)}</span>}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-2">
                      <ActionForm action={setStaffPin.bind(null, org, p.userId)} className="flex items-center gap-2" resetOnSuccess>
                        <input
                          name="pin"
                          type="password"
                          inputMode="numeric"
                          pattern="\d{4,6}"
                          minLength={4}
                          maxLength={6}
                          required
                          autoComplete="new-password"
                          aria-label={`Nuevo PIN de ${p.fullName}`}
                          placeholder="4–6 cifras"
                          className="h-8 w-28 rounded-md border border-shelf-edge bg-sheet px-2 text-sm"
                        />
                        <SubmitButton variant="secondary" className="h-8 px-3">Guardar</SubmitButton>
                      </ActionForm>
                      {p.hasPin && (
                        <ActionForm action={clearStaffPin.bind(null, org, p.userId)}>
                          <SubmitButton variant="secondary" className="h-8 px-3">Quitar</SubmitButton>
                        </ActionForm>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {pins.length > staff.length && (
            <p className="mt-3 text-sm text-ink-3">
              {pins.length - staff.length} personas más no pueden usar el TPV con su rol. Cámbialo en Miembros o da el permiso «Usar el TPV» en Roles y permisos.
            </p>
          )}
        </Cell>

        <Cell title="Mesas">
          {floor.tables.length === 0 ? (
            <p className="text-sm text-ink-2">Sin mesas. Las cuentas de barra funcionan sin mesa.</p>
          ) : (
            <Table minWidth={560}>
              <thead>
                <tr>
                  <Th>Zona</Th>
                  <Th>Mesa</Th>
                  <Th align="right">Plazas</Th>
                  <Th align="right">Orden</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {floor.tables.map((t) => (
                  <Tr key={t.id}>
                    <Td className="text-ink-2">{t.area}</Td>
                    <Td className={t.isActive ? 'font-medium' : 'text-ink-3 line-through'}>{t.name}</Td>
                    <Td align="right">{t.seats}</Td>
                    <Td align="right">{t.sortOrder}</Td>
                    <Td align="right">
                      {t.isActive ? (
                        <ActionForm action={removePosTable.bind(null, org, t.id)}>
                          <SubmitButton variant="secondary" className="h-8 px-3" disabled={t.tab !== null}>Quitar</SubmitButton>
                        </ActionForm>
                      ) : (
                        <ActionForm action={restorePosTable.bind(null, org, t.id)}>
                          <SubmitButton variant="secondary" className="h-8 px-3">Reactivar</SubmitButton>
                        </ActionForm>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Cell>
        <Cell title="Añadir mesa">
          <ActionForm action={savePosTable.bind(null, org)} className="flex flex-col gap-3" resetOnSuccess>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Nombre" name="name" required maxLength={30} placeholder="12, T3, Barra 1…" />
              <TextField label="Zona" name="area" required maxLength={30} defaultValue="Sala" list="pos-areas" />
              <datalist id="pos-areas">
                {[...new Set(floor.tables.map((t) => t.area))].map((a) => <option key={a} value={a} />)}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Plazas" name="seats" type="number" min={1} max={99} defaultValue={4} />
              <TextField label="Orden" name="sortOrder" type="number" min={0} max={9999} defaultValue={floor.tables.length + 1} />
            </div>
            <div>
              <SubmitButton>Añadir mesa</SubmitButton>
            </div>
          </ActionForm>
        </Cell>

        <Cell title="Categorías de la carta">
          {categories.length === 0 ? (
            <p className="text-sm text-ink-2">Sin categorías: la carta del TPV está vacía.</p>
          ) : (
            <Table minWidth={480}>
              <thead>
                <tr>
                  <Th>Categoría</Th>
                  <Th>Icono</Th>
                  <Th align="right">Orden</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <Tr key={c.id}>
                    <Td className="font-medium">{c.name}</Td>
                    <Td className="text-ink-2">{ICONS.find((i) => i.value === c.icon)?.label ?? c.icon}</Td>
                    <Td align="right">{c.sortOrder}</Td>
                    <Td align="right">
                      <ActionForm action={removePosCategory.bind(null, org, c.id)}>
                        <SubmitButton variant="secondary" className="h-8 px-3">Quitar</SubmitButton>
                      </ActionForm>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
          <p className="mt-3 text-sm text-ink-3">Los productos, precios y escandallos se colocan en la carta desde el propio TPV (Carta), entrando como encargado.</p>
        </Cell>
        <Cell title="Añadir categoría">
          <ActionForm action={savePosCategory.bind(null, org)} className="flex flex-col gap-3" resetOnSuccess>
            <TextField label="Nombre" name="name" required maxLength={30} placeholder="Cócteles, Tapas…" />
            <div className="grid grid-cols-2 gap-3">
              <SelectField label="Icono" name="icon" options={ICONS} defaultValue="utensils" />
              <TextField label="Orden" name="sortOrder" type="number" min={0} max={9999} defaultValue={categories.length + 1} />
            </div>
            <div>
              <SubmitButton>Añadir categoría</SubmitButton>
            </div>
          </ActionForm>
        </Cell>

        <Cell title="Stock al vender" className="xl:col-span-2">
          <ActionForm action={setNegativeStock.bind(null, org)} className="flex flex-col gap-3">
            <fieldset disabled={!can('org.manage')} className="flex flex-col gap-3">
              <CheckboxField
                label="Permitir stock negativo"
                name="allowNegativeStock"
                defaultChecked={settings.allowNegativeStock}
                hint="Recomendado en hostelería: se cobra aunque el inventario diga que no queda (un albarán sin registrar, una botella mal contada). El stock queda en negativo hasta el siguiente recuento o entrada."
              />
              <div>
                <SubmitButton variant="secondary">Guardar</SubmitButton>
              </div>
            </fieldset>
            {!can('org.manage') && <p className="text-sm text-ink-3">Cambiarlo requiere el permiso de gestión de la sociedad.</p>}
          </ActionForm>
        </Cell>

        <Cell title="Tickets y VeriFactu" className="xl:col-span-2">
          <ActionForm action={setPosTicketsVerifactu.bind(null, org)} className="flex flex-col gap-3">
            <fieldset disabled={!can('org.manage')} className="flex max-w-xl flex-col gap-3">
              <SelectField
                label="Ticket al cobrar en el TPV"
                name="ticketsVerifactu"
                options={TICKET_MODES}
                defaultValue={settings.ticketsVerifactu ? 'on' : 'off'}
                hint="Solo afecta a los tickets que se cobran en la tablet. Las facturas del backoffice siguen el sistema de facturación de Ajustes › Datos de la sociedad."
              />
              <div>
                <SubmitButton variant="secondary">Guardar</SubmitButton>
              </div>
            </fieldset>
            {!settings.ticketsVerifactu && (
              <Notice tone="warning">
                Los tickets sin VeriFactu no llevan QR ni se envían a la AEAT. Cuando VeriFactu sea obligatorio también lo será para las facturas simplificadas del TPV: vuelve a activarlo antes de esa fecha.
              </Notice>
            )}
            {!can('org.manage') && <p className="text-sm text-ink-3">Cambiarlo requiere el permiso de gestión de la sociedad.</p>}
          </ActionForm>
        </Cell>
      </Ruled>
    </>
  );
}
