// DATOS DE EJEMPLO para desarrollo local. Todo es ficticio: personas, NIF,
// clientes, proveedores e importes. Se siembra a través de las mismas funciones
// y triggers que usa la aplicación (create_organization, issue_invoice, libro
// de stock…), así que los datos cumplen las reglas del esquema.
//
// Las fechas son relativas al día de la siembra; `npm run db:reset` las renueva.

import { createHash, randomBytes, randomUUID, scryptSync } from 'node:crypto';
// Mismo cálculo de tickets que el TPV (Node ejecuta TypeScript sin compilar).
import { buildTicketLines, sumAmounts } from '../packages/pos/src/pricing.ts';

/** Código para vincular la tablet de ejemplo (Ajustes › TPV genera otros). */
export const DEMO_PAIRING_CODE = 'TAPA-2026';
/** PIN de cada persona en el bar de ejemplo. */
export const DEMO_PINS = { lucia: '1111', carmen: '2222', marta: '3333', ivan: '4444' };

const sha256 = (v) => createHash('sha256').update(v).digest('hex');
const pinHash = (pin) => {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${scryptSync(pin, salt, 32).toString('base64')}`;
};

export const DEMO_USERS = {
  lucia: { id: '0a000000-0000-4000-8000-000000000001', email: 'lucia@albar.es', name: 'Lucía Ferrer' },
  carmen: { id: '0a000000-0000-4000-8000-000000000002', email: 'carmen@albar.es', name: 'Carmen Vidal' },
  marta: { id: '0a000000-0000-4000-8000-000000000003', email: 'marta@albar.es', name: 'Marta Ortega' },
  ivan: { id: '0a000000-0000-4000-8000-000000000004', email: 'ivan@albar.es', name: 'Iván Serrano' },
  ruben: { id: '0a000000-0000-4000-8000-000000000005', email: 'ruben@albar.es', name: 'Rubén Lago' },
};

const pad = (n) => String(n).padStart(2, '0');
const isoDay = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
/** Hoy a las hh:mm (hora local del servidor) más `dayOffset` días. */
const at = (dayOffset, hhmm) => new Date(`${isoDay(dayOffset)}T${hhmm}:00`).toISOString();

/** PDF mínimo de una página con unas líneas de texto (para las nóminas de ejemplo). */
function textPdf(lines) {
  const esc = (t) => t.replace(/[\\()]/g, (c) => `\\${c}`);
  const stream = `BT /F1 11 Tf 56 780 Td 15 TL ${lines.map((l) => `(${esc(l)}) '`).join(' ')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = objects.map((o, i) => {
    const at = Buffer.byteLength(body, 'latin1');
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

/** Primer día del mes de hace `monthsAgo` meses (AAAA-MM-01). */
const monthStart = (monthsAgo) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsAgo);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
};

export async function seed(db) {
  const q = async (sql, params = []) => (await db.query(sql, params)).rows;
  const one = async (sql, params) => (await q(sql, params))[0];
  const as = (userId, orgIds = []) =>
    q(`select set_config('app.user_id', $1, false), set_config('app.org_ids', $2, false)`, [userId, `{${orgIds.join(',')}}`]);
  const { lucia, carmen, marta, ivan, ruben } = DEMO_USERS;

  for (const u of Object.values(DEMO_USERS)) {
    await q('insert into users (id, email, full_name) values ($1, $2, $3)', [u.id, u.email, u.name]);
  }

  await as(lucia.id);
  const createOrg = async (slug, name, taxId) =>
    (await one('select app.create_organization($1, $2, $3) as id', [slug, name, taxId])).id;
  const dist = await createOrg('distribuciones-albar', 'Distribuciones Albar S.L.', 'B28461930');
  const logi = await createOrg('albar-logistica', 'Albar Logística S.L.', 'B28461948');
  const tall = await createOrg('talleres-albar', 'Talleres Albar S.A.', 'A28461955');
  await q(`update organizations set trade_name = split_part(legal_name, ' S.', 1)`);
  for (const [id, line, iban] of [
    [dist, 'Polígono San Cristóbal, C/ Plata 14', 'ES9121000418450200051332'],
    [logi, 'Polígono San Cristóbal, C/ Plata 16', 'ES7620770024003102575766'],
    [tall, 'Avda. de Burgos 112', 'ES1000492352082414205416'],
  ]) {
    await q('update organizations set fiscal_address = $2, iban = $3 where id = $1', [
      id, { line, postalCode: id === tall ? '47009' : '47012', city: 'Valladolid', province: 'Valladolid' }, iban,
    ]);
  }

  // ------------------------------------------------------------------ helpers por sociedad
  async function context(org) {
    await as(lucia.id, [org]);
    const role = async (key) => (await one('select id from roles where organization_id = $1 and key = $2', [org, key])).id;
    return {
      org,
      role,
      async member(user, roleKey, code) {
        await q('insert into user_organizations (user_id, organization_id, role_id, employee_code) values ($1, $2, $3, $4)', [
          user.id, org, await role(roleKey), code,
        ]);
      },
      async warehouse(code, name) {
        return (await one('insert into warehouses (organization_id, code, name) values ($1,$2,$3) returning id', [org, code, name])).id;
      },
      async item(sku, name, unit = 'ud', tax = 21, type = 'stockable') {
        return (await one(
          'insert into inventory_items (organization_id, sku, name, unit_of_measure, default_tax_rate, item_type) values ($1,$2,$3,$4,$5,$6) returning id',
          [org, sku, name, unit, tax, type],
        )).id;
      },
      async party(name, { customer = false, supplier = false, taxId = null, email = null, terms = 30, priceList = null, address = {} } = {}) {
        return (await one(
          `insert into parties (organization_id, is_customer, is_supplier, legal_name, tax_id, email, payment_terms_days, price_list_id, billing_address)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
          [org, customer, supplier, name, taxId, email, terms, priceList, address],
        )).id;
      },
      async series(code, kind, description) {
        const year = Number(isoDay(0).slice(0, 4));
        const ids = {};
        for (const y of [year - 1, year]) {
          ids[y] = (await one(
            'insert into invoice_series (organization_id, code, invoice_kind, fiscal_year, description) values ($1,$2,$3,$4,$5) returning id',
            [org, code, kind, y, description],
          )).id;
        }
        return (date) => ids[Number(date.slice(0, 4))];
      },
      async receipt(warehouseId, supplierId, note, lines, { post = false, daysAgo = 0 } = {}) {
        const r = await one(
          `insert into goods_receipts (organization_id, warehouse_id, supplier_id, supplier_delivery_note, received_at)
           values ($1,$2,$3,$4,$5) returning id`,
          [org, warehouseId, supplierId, note, at(-daysAgo, '09:30')],
        );
        let n = 1;
        for (const [itemId, qty, cost] of lines) {
          // Cantidad y coste en formato de compra (packs); el trigger congela las unidades por pack.
          const line = await one(
            'insert into goods_receipt_lines (organization_id, receipt_id, line_no, item_id, quantity, unit_cost) values ($1,$2,$3,$4,$5,$6) returning id, pack_size::float8 as pack',
            [org, r.id, n++, itemId, qty, cost],
          );
          if (post) {
            await q(
              `insert into stock_movements (organization_id, warehouse_id, item_id, movement_type, quantity, unit_cost, source_type, source_id, source_line_id, occurred_at)
               values ($1,$2,$3,'receipt',$4::numeric * $9::numeric,round($5::numeric / $9::numeric, 6),'goods_receipt',$6,$7,$8)`,
              [org, warehouseId, itemId, qty, cost, r.id, line.id, at(-daysAgo, '09:30'), line.pack],
            );
          }
        }
        if (post) await q(`update goods_receipts set status = 'posted', posted_at = $2, posted_by = $3 where id = $1`, [r.id, at(-daysAgo, '10:00'), lucia.id]);
        return r.id;
      },
      async sale(warehouseId, itemId, qty, daysAgo) {
        await q(
          `insert into stock_movements (organization_id, warehouse_id, item_id, movement_type, quantity, occurred_at, note)
           values ($1,$2,$3,'sale',$4,$5,'Venta de mostrador')`,
          [org, warehouseId, itemId, -qty, at(-daysAgo, '12:00')],
        );
      },
      async minimum(warehouseId, itemId, min) {
        await q('update stock_levels set min_quantity = $4 where organization_id = $1 and warehouse_id = $2 and item_id = $3', [org, warehouseId, itemId, min]);
      },
      /** Factura emitida: borrador + líneas + emisión con huella; opcionalmente cobros y estado fiscal. */
      async invoice(seriesFor, partyId, issuedDaysAgo, lines, { termsDays = 30, paid = 0, fiscal = 'accepted', response = null, type = 'F1' } = {}) {
        const date = isoDay(-issuedDaysAgo);
        const inv = await one(
          `insert into invoices (organization_id, direction, party_id, due_date, invoice_type) values ($1,'issued',$2,$3,$4) returning id`,
          [org, partyId, isoDay(-issuedDaysAgo + termsDays), type],
        );
        let n = 1;
        for (const [itemId, description, qty, price, tax = 21] of lines) {
          await q(
            'insert into invoice_lines (organization_id, invoice_id, line_no, item_id, description, quantity, unit_price, tax_rate) values ($1,$2,$3,$4,$5,$6,$7,$8)',
            [org, inv.id, n++, itemId, description, qty, price, tax],
          );
        }
        const issued = await one('select * from app.issue_invoice($1, $2, $3)', [inv.id, seriesFor(date), date]);
        await q('update invoices set fiscal_status = $2, fiscal_response = $3 where id = $1', [inv.id, fiscal, response]);
        const total = Number(issued.total);
        const amount = paid === 'all' ? total : paid;
        if (amount > 0) {
          await q(`insert into invoice_payments (organization_id, invoice_id, amount, paid_at, method) values ($1,$2,$3,$4,'transfer')`, [
            org, inv.id, amount.toFixed(2), isoDay(-Math.max(0, issuedDaysAgo - 10)),
          ]);
        }
        return inv.id;
      },
      async receivedInvoice(supplierId, number, daysAgo, lines, { termsDays = 30, paid = false } = {}) {
        const inv = await one(
          `insert into invoices (organization_id, direction, party_id, full_number, issue_date, due_date) values ($1,'received',$2,$3,$4,$5) returning id`,
          [org, supplierId, number, isoDay(-daysAgo), isoDay(-daysAgo + termsDays)],
        );
        let n = 1;
        for (const [itemId, description, qty, price] of lines) {
          await q(
            'insert into invoice_lines (organization_id, invoice_id, line_no, item_id, description, quantity, unit_price, tax_rate) values ($1,$2,$3,$4,$5,$6,$7,21)',
            [org, inv.id, n++, itemId, description, qty, price],
          );
        }
        const registered = await one('select * from app.register_received_invoice($1)', [inv.id]);
        if (paid) {
          await q(`insert into invoice_payments (organization_id, invoice_id, amount, paid_at, method) values ($1,$2,$3,$4,'transfer')`, [
            org, inv.id, registered.total, isoDay(-daysAgo + 5),
          ]);
        }
        return inv.id;
      },
      async payslip(user, monthsAgo, net, { kind = 'monthly', viewed = true } = {}) {
        const period = monthStart(monthsAgo);
        const month = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(new Date(`${period}T12:00:00`));
        const label = { monthly: 'Nómina', bonus: 'Paga extra', settlement: 'Finiquito' }[kind];
        const pdf = textPdf([
          'DATOS DE EJEMPLO - documento ficticio', '', `${label} de ${month}`, '', `Trabajador/a: ${user.name}`, `Correo: ${user.email}`,
          '', `Liquido a percibir: ${net.toFixed(2).replace('.', ',')} EUR`,
        ]);
        await q(
          `insert into payslips (organization_id, user_id, period, kind, net_amount, content_type, file_name, byte_size, content, viewed_at, created_by)
           values ($1,$2,$3,$4,$5,'application/pdf',$6,$7,$8,$9,$10)`,
          [org, user.id, period, kind, net, `nomina-${period.slice(0, 7)}-${user.email.split('@')[0]}.pdf`, pdf.length, pdf, viewed ? new Date(new Date(`${period}T12:00:00`).getTime() + 33 * 86_400_000) : null, carmen.id],
        );
      },
      async shift(user, dayOffset, from, to, area) {
        await q('insert into shifts (organization_id, user_id, starts_at, ends_at, area) values ($1,$2,$3,$4,$5)', [org, user.id, at(dayOffset, from), at(dayOffset, to), area]);
      },
      async clock(user, dayOffset, type, hhmm, { lat = null, lng = null } = {}) {
        // Nunca un fichaje en el futuro: si se siembra antes de esa hora, hoy aún no ha fichado.
        if (new Date(at(dayOffset, hhmm)) > new Date()) return;
        await q(
          `insert into time_entries (organization_id, user_id, entry_type, occurred_at, recorded_at, source, latitude, longitude, geo_consent)
           values ($1,$2,$3,$4,$4,$5,$6,$7,$8)`,
          [org, user.id, type, at(dayOffset, hhmm), lat ? 'mobile' : 'web', lat, lng, lat !== null],
        );
      },
      async incident(title, { priority = 'normal', status = 'open', category = null, partyId = null, employee = null, assignee = null, description = null, comments = [] } = {}) {
        const inc = await one(
          `insert into incidents (organization_id, title, description, category, priority, status, party_id, employee_user_id, assignee_user_id)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
          [org, title, description, category, priority, status, partyId, employee?.id ?? null, assignee?.id ?? null],
        );
        for (const [author, body] of comments) {
          await q('insert into incident_comments (organization_id, incident_id, author_id, body) values ($1,$2,$3,$4)', [org, inc.id, author.id, body]);
        }
        return inc.id;
      },
    };
  }

  // ================================================================== Distribuciones Albar
  {
    const c = await context(dist);
    await c.member(carmen, 'admin', 'D-002');
    await c.member(marta, 'employee', 'D-014');
    await c.member(ivan, 'employee', 'D-021');

    const cen = await c.warehouse('CEN', 'Almacén central');
    const n2 = await c.warehouse('N2', 'Nave 2');

    const general = (await one(`insert into price_lists (organization_id, code, name, is_default) values ($1,'GEN','General',true) returning id`, [dist])).id;
    const pro = (await one(`insert into price_lists (organization_id, code, name) values ($1,'PRO','Profesional')  returning id`, [dist])).id;

    const items = {};
    // [sku, nombre, unidad de stock, formato de compra, unidades por formato, coste y precio por formato]
    const catalog = [
      ['CER-TER', 'Cerveza tercio 33 cl', 'ud', 'caja', 24, 9.6, 14.4],
      ['REF-COLA', 'Refresco de cola lata 33 cl', 'ud', 'caja', 24, 8.4, 12.6],
      ['AGUA-50', 'Agua mineral 50 cl', 'ud', 'pack', 24, 3.1, 5.4],
      ['GIN-70', 'Ginebra 70 cl', 'botella', null, 1, 9.8, 14.9],
      ['TON-20', 'Tónica 20 cl', 'ud', 'caja', 24, 7.2, 11.5],
      ['VIN-RIB', 'Vino tinto Ribera del Duero 75 cl', 'botella', 'caja', 6, 24, 39.6],
      ['CAFE-1K', 'Café en grano', 'kg', null, 1, 14, 21.9],
      ['ACE-5L', 'Aceite de oliva (garrafa 5 l)', 'garrafa', null, 1, 24, 34.5],
      ['SERV-3M', 'Servilletas de papel (caja 3000)', 'caja', null, 1, 11, 18.9],
      ['VASO-20', 'Vaso de caña 20 cl', 'ud', 'caja', 48, 18, 29.5],
    ];
    const packOf = (sku) => catalog.find((x) => x[0] === sku)[4];
    for (const [sku, name, unit, packUnit, pack, , price] of catalog) {
      items[sku] = await c.item(sku, name, unit);
      if (packUnit) await q('update inventory_items set purchase_unit = $2, purchase_pack_size = $3 where id = $1', [items[sku], packUnit, pack]);
      // Tarifas por unidad de stock (botella, lata): se vende por unidad aunque se compre por cajas.
      await q('insert into price_list_items (organization_id, price_list_id, item_id, unit_price) values ($1,$2,$3,$4), ($1,$5,$3,$6)', [
        dist, general, items[sku], (price / pack).toFixed(4), pro, ((price * 0.9) / pack).toFixed(4),
      ]);
    }
    items.TRANSPORTE = await c.item('SRV-PORTE', 'Portes y entrega', 'servicio', 21, 'service');
    await q('insert into price_list_items (organization_id, price_list_id, item_id, unit_price) values ($1,$2,$3,18)', [dist, general, items.TRANSPORTE]);

    const cervezas = await c.party('Cervezas del Norte S.A.', { supplier: true, taxId: 'A48112233', email: 'pedidos@cervezasdelnorte.example', terms: 60 });
    const bodegas = await c.party('Bodegas y Destilados Levante S.L.', { supplier: true, taxId: 'B46223344', terms: 30 });
    const suministros = await c.party('Suministros Hosteleros Ibéricos S.A.', { supplier: true, taxId: 'A50334455', terms: 45 });
    const ruiz = await c.party('Restaurante Ruiz S.L.', { customer: true, address: { line: 'C/ Santiago 21', postalCode: '47001', city: 'Valladolid', province: 'Valladolid' },  taxId: 'B47112200', email: 'compras@restauranteruiz.example', priceList: pro });
    const ebro = await c.party('Hoteles Ebro S.A.', { customer: true, address: { line: 'Avda. de Cataluña 88', postalCode: '50014', city: 'Zaragoza', province: 'Zaragoza' },  taxId: 'A50998877', priceList: pro });
    const gil = await c.party('Cafetería Gil', { customer: true, address: { line: 'C/ Mayor 5', postalCode: '47400', city: 'Medina del Campo', province: 'Valladolid' },  taxId: '12345678Z' });
    const duero = await c.party('Catering Duero S.L.', { customer: true, address: { line: 'Ctra. de Soria km 3', postalCode: '47193', city: 'La Cistérniga', province: 'Valladolid' },  taxId: 'B47556677' });
    const castilla = await c.party('Cervecería Castilla S.L.', { customer: true, address: { line: 'C/ Vitoria 140, bajo', postalCode: '09007', city: 'Burgos', province: 'Burgos' },  taxId: 'B09887766' });

    const seriesA = await c.series('A', 'standard', 'Facturas');
    await c.series('T', 'simplified', 'Tickets de TPV');
    await c.series('R', 'rectifying', 'Rectificativas');

    // Stock: entradas contabilizadas, ventas a bares y restaurantes, y mínimos.
    await c.receipt(cen, cervezas, 'TN-ALB-5531', [[items['CER-TER'], 300, 9.6], [items['REF-COLA'], 200, 8.4], [items['TON-20'], 600, 7.2]], { post: true, daysAgo: 40 });
    await c.receipt(cen, bodegas, 'AL-20811', [[items['GIN-70'], 48, 9.8], [items['VIN-RIB'], 120, 24]], { post: true, daysAgo: 33 });
    await c.receipt(cen, suministros, 'HI-77120', [[items['AGUA-50'], 100, 3.1], [items['CAFE-1K'], 60, 14], [items['ACE-5L'], 150, 24], [items['SERV-3M'], 50, 11], [items['VASO-20'], 30, 18]], { post: true, daysAgo: 28 });
    await c.receipt(n2, cervezas, 'TN-ALB-5602', [[items['CER-TER'], 100, 9.87], [items['REF-COLA'], 80, 8.4]], { post: true, daysAgo: 12 });
    for (const [sku, qty, d] of [['CER-TER', 260, 6], ['AGUA-50', 88, 5], ['GIN-70', 45, 4], ['TON-20', 420, 3], ['VIN-RIB', 30, 2], ['CAFE-1K', 12, 2], ['SERV-3M', 14, 1]]) {
      await c.sale(cen, items[sku], qty * packOf(sku), d);
    }
    for (const [sku, min] of [['CER-TER', 200], ['REF-COLA', 150], ['AGUA-50', 50], ['GIN-70', 24], ['TON-20', 500], ['VIN-RIB', 60], ['CAFE-1K', 40], ['ACE-5L', 80], ['SERV-3M', 30], ['VASO-20', 20]]) {
      await c.minimum(cen, items[sku], min * packOf(sku));
    }

    // Albaranes pendientes de contabilizar.
    await c.receipt(cen, cervezas, 'TN-ALB-5688', [[items['CER-TER'], 400, 9.87], [items['TON-20'], 300, 7.33]]);
    await c.receipt(cen, bodegas, 'AL-20977', [[items['GIN-70'], 48, 9.97]]);
    await c.receipt(n2, suministros, 'HI-77301', [[items['SERV-3M'], 40, 11.13], [items['ACE-5L'], 60, 24]]);
    await c.receipt(cen, suministros, 'HI-77302', [[items['CAFE-1K'], 40, 14.15]]);

    // Pedidos de compra.
    const po = await one(
      `insert into purchase_orders (organization_id, supplier_id, warehouse_id, status, order_date, expected_on) values ($1,$2,$3,'sent',$4,$5) returning id`,
      [dist, bodegas, cen, isoDay(-3), isoDay(4)],
    );
    // Las líneas se insertan con el pedido aún en borrador (el trigger protege los enviados).
    await q(`update purchase_orders set status = 'draft' where id = $1`, [po.id]);
    await q(
      'insert into purchase_order_lines (organization_id, purchase_order_id, line_no, item_id, quantity, unit_cost) values ($1,$2,1,$3,30,24), ($1,$2,2,$4,48,9.8)',
      [dist, po.id, items['VIN-RIB'], items['GIN-70']],
    );
    await q(`update purchase_orders set status = 'sent' where id = $1`, [po.id]);
    const po2 = await one(`insert into purchase_orders (organization_id, supplier_id, warehouse_id, expected_on) values ($1,$2,$3,$4) returning id`, [dist, suministros, cen, isoDay(10)]);
    await q('insert into purchase_order_lines (organization_id, purchase_order_id, line_no, item_id, quantity, unit_cost) values ($1,$2,1,$3,20,14)', [dist, po2.id, items['CAFE-1K']]);

    // Facturas emitidas (en orden cronológico: la huella se encadena).
    // Las facturas a bares van por cajas, como el papel: «Cerveza tercio 33 cl (caja 24)».
    const L = (sku, qty, price) => {
      const [, name, , packUnit, pack] = catalog.find((x) => x[0] === sku);
      return [items[sku], packUnit ? `${name} (${packUnit} ${pack})` : name, qty, price];
    };
    await c.invoice(seriesA, ruiz, 62, [L('CER-TER', 40, 13.01), L('VIN-RIB', 24, 35.6)], { paid: 'all' });
    await c.invoice(seriesA, ebro, 55, [L('CAFE-1K', 30, 19.69), L('SERV-3M', 50, 17.01)], { paid: 'all' });
    await c.invoice(seriesA, duero, 50, [L('REF-COLA', 60, 12.6), L('TON-20', 10, 11.5)], { paid: 'all' });
    await c.invoice(seriesA, ruiz, 51, [L('GIN-70', 30, 14.9), L('AGUA-50', 40, 5.4)], { termsDays: 30 }); // vencida 21 días
    await c.invoice(seriesA, castilla, 46, [L('VIN-RIB', 80, 39.6), L('CAFE-1K', 20, 21.9)], { paid: 'all' });
    await c.invoice(seriesA, ebro, 44, [L('SERV-3M', 30, 17.01), L('ACE-5L', 12, 30.96)], { termsDays: 30 }); // vencida 14 días
    await c.invoice(seriesA, gil, 37, [L('CER-TER', 50, 14.4), L('VASO-20', 20, 29.5)], { termsDays: 30, paid: 120 }); // vencida, parcial
    await c.invoice(seriesA, duero, 26, [L('TON-20', 60, 11.5), L('GIN-70', 10, 14.9)], { termsDays: 30 });
    await c.invoice(seriesA, ruiz, 20, [L('REF-COLA', 30, 11.41), L('VIN-RIB', 40, 35.6)], { termsDays: 30, paid: 'all' });
    await c.invoice(seriesA, castilla, 15, [L('CAFE-1K', 60, 21.9), L('SERV-3M', 80, 18.9)], { termsDays: 30 });
    await c.invoice(seriesA, ebro, 9, [L('AGUA-50', 100, 4.92), L('CER-TER', 20, 13.01)], { termsDays: 30, fiscal: 'pending' });
    await c.invoice(seriesA, gil, 4, [L('VIN-RIB', 30, 39.6)], { termsDays: 15, fiscal: 'pending' });
    await c.invoice(seriesA, duero, 2, [L('VASO-20', 15, 29.5), L('ACE-5L', 50, 34.5)], {
      termsDays: 30,
      fiscal: 'rejected',
      response: { code: '4102', message: 'El NIF del destinatario no está identificado en la AEAT' },
    });

    // Facturas de proveedor.
    await c.receivedInvoice(cervezas, 'TN-F-2026-1188', 38, [L('CER-TER', 300, 9.6), L('REF-COLA', 200, 8.4)], { termsDays: 60 });
    await c.receivedInvoice(bodegas, 'AL-F-9921', 32, [L('GIN-70', 48, 9.8), L('VIN-RIB', 120, 24)], { paid: true });
    await c.receivedInvoice(suministros, 'HI-2026-0412', 27, [L('CAFE-1K', 60, 14), L('SERV-3M', 50, 11)], { termsDays: 45 });

    // Pedido de venta B2B confirmado y otro en borrador.
    const so = await one(`insert into sales_orders (organization_id, customer_id, warehouse_id, price_list_id) values ($1,$2,$3,$4) returning id`, [dist, castilla, cen, pro]);
    await q(
      `insert into sales_order_lines (organization_id, sales_order_id, line_no, item_id, description, quantity, unit_price, tax_rate)
       values ($1,$2,1,$3,'Refresco de cola lata 33 cl',960,0.475,21), ($1,$2,2,$4,'Vino tinto Ribera del Duero 75 cl',72,5.9333,21)`,
      [dist, so.id, items['REF-COLA'], items['VIN-RIB']],
    );
    await q(`update sales_orders set status = 'confirmed' where id = $1`, [so.id]);
    const so2 = await one(`insert into sales_orders (organization_id, customer_id, warehouse_id, price_list_id) values ($1,$2,$3,$4) returning id`, [dist, ruiz, cen, pro]);
    await q(
      `insert into sales_order_lines (organization_id, sales_order_id, line_no, item_id, description, quantity, unit_price, tax_rate)
       values ($1,$2,1,$3,'Café en grano',10,19.7,21)`,
      [dist, so2.id, items['CAFE-1K']],
    );

    // Nóminas de los últimos meses (la última de Marta, sin abrir; a Iván le falta la del último mes).
    for (const [months, viewed] of [[1, false], [2, true], [3, true], [4, true]]) {
      await c.payslip(marta, months, 1342.18 + (months === 4 ? 0 : 18.4), { viewed });
      if (months > 1) await c.payslip(ivan, months, 1418.55, { viewed: months > 2 });
      await c.payslip(carmen, months, 1986.3);
    }
    await c.payslip(marta, 4, 1180, { kind: 'bonus' });

    // Personal: turnos de hoy, fichajes y ausencias.
    await c.shift(marta, 0, '07:00', '15:00', 'Almacén');
    await c.shift(ivan, 0, '08:00', '16:00', 'Reparto');
    await c.shift(carmen, 0, '09:00', '17:00', 'Administración');
    for (let d = 1; d <= 4; d++) {
      await c.shift(marta, d, '07:00', '15:00', 'Almacén');
      await c.shift(ivan, d, '08:00', '16:00', 'Reparto');
    }
    await c.clock(carmen, 0, 'clock_in', '08:56');
    for (const d of [-1, -2, -3]) {
      await c.clock(marta, d, 'clock_in', '06:58', { lat: 41.6523, lng: -4.7245 });
      await c.clock(marta, d, 'break_start', '10:30');
      await c.clock(marta, d, 'break_end', '10:50');
      await c.clock(marta, d, 'clock_out', '15:04', { lat: 41.6523, lng: -4.7245 });
      await c.clock(ivan, d, 'clock_in', '07:59');
      await c.clock(ivan, d, 'clock_out', '16:10');
      await c.clock(carmen, d, 'clock_in', '08:52');
      await c.clock(carmen, d, 'clock_out', '17:05');
    }
    await q(`insert into leave_requests (organization_id, user_id, leave_type, starts_on, ends_on, reason) values ($1,$2,'vacation',$3,$4,'Puente de noviembre')`, [
      dist, carmen.id, isoDay(8), isoDay(10),
    ]);
    await q(`insert into leave_requests (organization_id, user_id, leave_type, starts_on, ends_on, half_day) values ($1,$2,'personal',$3,$3,true)`, [dist, marta.id, isoDay(3)]);

    // Incidencias.
    await c.incident('Palé dañado en recepción ALB-0412', {
      priority: 'urgent', category: 'Recepción', partyId: cervezas, assignee: marta,
      description: 'Llegó un palé con cajas de tercios rotas. Faltan unidades por contar.',
      comments: [[marta, 'He apartado el palé en la zona de devoluciones y he hecho fotos.'], [lucia, 'Avisa al proveedor y pide abono si faltan unidades.']],
    });
    await c.incident('Fichaje olvidado · M. Ortega', { priority: 'high', category: 'RRHH', employee: marta, assignee: carmen });
    await c.incident('Error de precio en tarifa Profesional', { priority: 'normal', category: 'Ventas', partyId: ruiz, assignee: carmen });
    await c.incident('Cámara frigorífica 2 no baja de 8 °C', { priority: 'normal', category: 'Mantenimiento', assignee: ivan });
    await c.incident('Cliente pide duplicado de factura', { priority: 'low', category: 'Facturación', partyId: ebro });
    await c.incident('Etiquetas de estantería ilegibles', { priority: 'low', status: 'resolved', category: 'Almacén' });
  }

  // ================================================================== Albar Logística
  {
    const c = await context(logi);
    await c.member(carmen, 'admin', 'L-002');
    await c.member(ruben, 'employee', 'L-007');
    const base = await c.warehouse('VLL', 'Base Valladolid');
    const gasoil = await c.item('GAS-A', 'Gasóleo A', 'l', 21, 'consumable');
    const palet = await c.item('BAR-30', 'Barril retornable 30 l', 'ud');
    const porte = await c.item('SRV-RUTA', 'Ruta de reparto a hostelería', 'servicio', 21, 'service');
    const centro = await c.party('Gasóleos Centro S.L.', { supplier: true, taxId: 'B47001122' });
    const distrib = await c.party('Distribuciones Albar S.L.', { customer: true, address: { line: 'Polígono San Cristóbal, C/ Plata 14', postalCode: '47012', city: 'Valladolid', province: 'Valladolid' },  taxId: 'B28461930' });
    const pisuerga = await c.party('Grupo Hostelero Pisuerga S.A.', { customer: true, address: { line: 'Avda. de Zamora 30', postalCode: '47008', city: 'Valladolid', province: 'Valladolid' },  taxId: 'A47009988' });
    const seriesL = await c.series('L', 'standard', 'Facturas');
    await c.series('T', 'simplified', 'Tickets');
    await c.receipt(base, centro, 'GC-ALB-301', [[palet, 120, 7.5]], { post: true, daysAgo: 20 });
    await c.minimum(base, palet, 40);
    await c.invoice(seriesL, distrib, 40, [[porte, 'Rutas septiembre', 16, 150]], { paid: 'all' });
    await c.invoice(seriesL, pisuerga, 30, [[porte, 'Rutas Grupo Pisuerga', 10, 180]], { paid: 'all' });
    await c.invoice(seriesL, distrib, 10, [[porte, 'Rutas octubre (1ª quincena)', 16, 150]], { paid: 1000 });
    await c.invoice(seriesL, pisuerga, 3, [[porte, 'Rutas octubre', 12, 180]]);
    await c.receivedInvoice(centro, 'GC-55102', 6, [[gasoil, 'Gasóleo A', 900, 1.31]], { termsDays: 30 });
    await c.shift(ruben, 0, '06:00', '14:00', 'Ruta Valladolid–Palencia');
    await c.clock(ruben, 0, 'clock_in', '05:57', { lat: 41.6311, lng: -4.7429 });
    await c.clock(carmen, 0, 'clock_in', '09:02');
    await c.incident('Retraso en el reparto de barriles', { category: 'Rutas', assignee: ruben });
  }

  // ================================================================== Talleres Albar
  {
    const c = await context(tall);
    await c.member(ruben, 'employee', 'T-003');
    const taller = await c.warehouse('TAL', 'Taller');
    const disco = await c.item('REP-JUNTA', 'Junta de grupo de cafetera', 'ud');
    const electrodo = await c.item('REP-RES', 'Resistencia de lavavajillas', 'ud');
    const mano = await c.item('SRV-MO', 'Mano de obra técnica', 'h', 21, 'service');
    const herr = await c.party('Repuestos Hostelería Ibérica S.A.', { supplier: true, taxId: 'A50334455' });
    const lara = await c.party('Asador Lara S.L.', { customer: true, address: { line: 'C/ Industria 7', postalCode: '34004', city: 'Palencia', province: 'Palencia' },  taxId: 'B34556677' });
    const agro = await c.party('Hotel Tierra de Campos', { customer: true, address: { line: 'Camino de la Vega s/n', postalCode: '47800', city: 'Medina de Rioseco', province: 'Valladolid' },  taxId: 'F47223344' });
    const seriesT = await c.series('TA', 'standard', 'Facturas');
    await c.series('T', 'simplified', 'Tickets');
    await c.receipt(taller, herr, 'HI-77155', [[disco, 30, 1.7], [electrodo, 20, 9.8]], { post: true, daysAgo: 25 });
    await c.sale(taller, disco, 24, 3);
    await c.minimum(taller, disco, 20);
    await c.minimum(taller, electrodo, 5);
    await c.receipt(taller, herr, 'HI-77290', [[disco, 20, 1.72]]);
    await c.invoice(seriesT, lara, 46, [[mano, 'Reparación de cafetera industrial', 22, 45], [disco, 'Junta de grupo de cafetera', 6, 3.6]], { paid: 'all' });
    await c.invoice(seriesT, lara, 46 - 30 + 16, [[mano, 'Cambio de resistencia de lavavajillas', 22, 45]], { termsDays: 30 }); // vencida
    await c.invoice(seriesT, agro, 12, [[mano, 'Revisión de cámara frigorífica', 40, 45]], { paid: 600, fiscal: 'pending' });
    await c.shift(ruben, 0, '08:00', '14:00', 'Servicio técnico');
  }

  // ================================================================== Bar La Plaza (hostelería)
  await as(lucia.id);
  const bar = await createOrg('bar-la-plaza', 'Hostelería La Plaza S.L.', 'B47998811');
  await q(`update organizations set trade_name = 'Bar La Plaza', fiscal_address = $2, settings = settings || '{"allow_negative_stock": true}'::jsonb where id = $1`, [
    bar, { line: 'Plaza Mayor 3', postalCode: '47001', city: 'Valladolid', province: 'Valladolid' },
  ]);
  {
    const c = await context(bar);
    await c.member(carmen, 'floor_manager', 'P-002');
    await c.member(marta, 'waiter', 'P-014');
    await c.member(ivan, 'waiter', 'P-021');

    const wh = await c.warehouse('BAR', 'Barra y cocina');
    const carta = (await one(`insert into price_lists (organization_id, code, name, is_default, prices_include_tax) values ($1,'CARTA','Carta',true,true) returning id`, [bar])).id;
    const seriesT = await c.series('T', 'simplified', 'Tickets de TPV');
    await c.series('A', 'standard', 'Facturas');

    const cat = {};
    for (const [i, [key, name, icon]] of [
      ['cervezas', 'Cervezas', 'beer'], ['cocteles', 'Cócteles', 'martini'], ['refrescos', 'Refrescos', 'cup-soda'],
      ['cafes', 'Cafés', 'coffee'], ['tapas', 'Tapas', 'utensils'], ['hamburguesas', 'Hamburguesas', 'beef'], ['postres', 'Postres', 'ice-cream'],
    ].entries()) {
      cat[key] = (await one('insert into pos_categories (organization_id, name, icon, sort_order) values ($1,$2,$3,$4) returning id', [bar, name, icon, i + 1])).id;
    }

    // Materia prima (inventariable) con su coste de compra.
    const ing = {};
    const rawMaterials = [
      ['MP-GIN', 'Ginebra', 'l', 14.5, 7, 2], ['MP-RON', 'Ron', 'l', 13, 7, 2], ['MP-VOD', 'Vodka', 'l', 12, 4.2, 1],
      ['MP-TON', 'Tónica (botellín)', 'ud', 0.55, 96, 24], ['MP-COLA', 'Refresco de cola (lata)', 'ud', 0.45, 120, 24],
      ['MP-LIMA', 'Lima', 'ud', 0.25, 60, 20], ['MP-HIER', 'Hierbabuena (manojo)', 'ud', 0.8, 10, 3], ['MP-AZU', 'Azúcar moreno', 'kg', 2.2, 3, 1],
      ['MP-HIELO', 'Hielo', 'kg', 0.35, 60, 20], ['MP-BARRIL', 'Cerveza de barril', 'l', 2.1, 90, 30], ['MP-BOT', 'Botellín de cerveza', 'ud', 0.55, 96, 24],
      ['MP-AGUA', 'Agua mineral 50 cl', 'ud', 0.2, 72, 24], ['MP-CAFE', 'Café en grano', 'kg', 18, 4, 1], ['MP-LECHE', 'Leche', 'l', 0.9, 24, 6],
      ['MP-TERN', 'Carne picada de ternera', 'kg', 9.5, 8, 3], ['MP-PAN', 'Pan de hamburguesa', 'ud', 0.35, 40, 12], ['MP-CHED', 'Queso cheddar', 'kg', 11, 2, 0.5],
      ['MP-BACON', 'Bacon', 'kg', 9, 2, 0.5], ['MP-PATA', 'Patata', 'kg', 1.2, 25, 8], ['MP-ACEITE', 'Aceite de girasol', 'l', 2, 20, 5],
      ['MP-TOM', 'Tomate frito', 'kg', 2.4, 5, 1], ['MP-CROQ', 'Croqueta de jamón (congelada)', 'ud', 0.3, 120, 36], ['MP-TARTA', 'Tarta de queso (porción)', 'ud', 1.4, 16, 4],
    ];
    // Cómo se compra cada cosa: el albarán va en este formato y el stock entra en la unidad de arriba.
    const formats = {
      'MP-GIN': ['botella', 0.7], 'MP-RON': ['botella', 0.7], 'MP-VOD': ['botella', 0.7], 'MP-TON': ['pack', 24], 'MP-COLA': ['pack', 24],
      'MP-LIMA': ['caja', 30], 'MP-HIELO': ['saco', 2], 'MP-BARRIL': ['barril', 30], 'MP-BOT': ['caja', 24], 'MP-AGUA': ['pack', 24],
      'MP-LECHE': ['caja', 6], 'MP-PAN': ['bolsa', 8], 'MP-CROQ': ['bolsa', 40], 'MP-TARTA': ['tarta', 8], 'MP-ACEITE': ['garrafa', 5],
    };
    for (const [sku, name, unit] of rawMaterials) {
      ing[sku] = await c.item(sku, name, unit, 10);
      if (formats[sku]) await q('update inventory_items set purchase_unit = $2, purchase_pack_size = $3 where id = $1', [ing[sku], ...formats[sku]]);
    }
    const bebidas = await c.party('Bebidas Pisuerga S.L.', { supplier: true, taxId: 'B47220011', terms: 30 });
    const carnes = await c.party('Cárnicas del Duero S.L.', { supplier: true, taxId: 'B47330022', terms: 15 });
    const cafes = await c.party('Cafés Tostados Castilla S.L.', { supplier: true, taxId: 'B47440033', terms: 30 });
    const supplierOf = (sku) => (['MP-TERN', 'MP-PAN', 'MP-CHED', 'MP-BACON', 'MP-PATA', 'MP-TOM', 'MP-CROQ', 'MP-TARTA', 'MP-ACEITE'].includes(sku) ? carnes : sku === 'MP-CAFE' || sku === 'MP-LECHE' || sku === 'MP-AZU' ? cafes : bebidas);
    let alb = 400;
    for (const supplier of [bebidas, carnes, cafes]) {
      const lines = rawMaterials.filter(([sku]) => supplierOf(sku) === supplier).map(([sku, , , cost, qty]) => {
        const pack = formats[sku]?.[1] ?? 1;
        return [ing[sku], qty / pack, Number((cost * pack).toFixed(4))];
      });
      await c.receipt(wh, supplier, `ALB-${alb++}`, lines, { post: true, daysAgo: 6 });
    }
    for (const [sku, , , , , min] of rawMaterials) await c.minimum(wh, ing[sku], min);

    // Carta: productos con escandallo (no inventariables) y de venta directa.
    const prod = {};
    const product = async (key, name, category, pvp, recipe = null, stockItem = null) => {
      const id = stockItem ?? (await c.item(`CARTA-${key.toUpperCase()}`, name, 'ud', 10, 'consumable'));
      if (stockItem) await q('update inventory_items set name = $2 where id = $1', [id, name]);
      await q('update inventory_items set pos_category_id = $2 where id = $1', [id, cat[category]]);
      await q('insert into price_list_items (organization_id, price_list_id, item_id, unit_price) values ($1,$2,$3,$4)', [bar, carta, id, pvp]);
      for (const [sku, qty] of recipe ?? []) {
        await q('insert into recipe_lines (organization_id, product_id, ingredient_id, quantity) values ($1,$2,$3,$4)', [bar, id, ing[sku], qty]);
      }
      prod[key] = id;
    };
    await product('cana', 'Caña', 'cervezas', 2.2, [['MP-BARRIL', 0.2]]);
    await product('doble', 'Doble', 'cervezas', 3.5, [['MP-BARRIL', 0.4]]);
    await product('botellin', 'Botellín', 'cervezas', 2.5, null, ing['MP-BOT']);
    await product('gintonic', 'Gin-tonic', 'cocteles', 8, [['MP-GIN', 0.05], ['MP-TON', 1], ['MP-LIMA', 0.25], ['MP-HIELO', 0.15]]);
    await product('cubata', 'Ron con cola', 'cocteles', 7, [['MP-RON', 0.05], ['MP-COLA', 1], ['MP-HIELO', 0.15]]);
    await product('mojito', 'Mojito', 'cocteles', 8.5, [['MP-RON', 0.05], ['MP-LIMA', 0.5], ['MP-HIER', 0.25], ['MP-AZU', 0.02], ['MP-HIELO', 0.2]]);
    await product('vodka', 'Vodka con tónica', 'cocteles', 7.5, [['MP-VOD', 0.05], ['MP-TON', 1], ['MP-HIELO', 0.15]]);
    await product('cola', 'Refresco de cola', 'refrescos', 2.5, null, ing['MP-COLA']);
    await product('agua', 'Agua mineral', 'refrescos', 1.8, null, ing['MP-AGUA']);
    await product('solo', 'Café solo', 'cafes', 1.4, [['MP-CAFE', 0.008]]);
    await product('cortado', 'Cortado', 'cafes', 1.5, [['MP-CAFE', 0.008], ['MP-LECHE', 0.04]]);
    await product('conleche', 'Café con leche', 'cafes', 1.7, [['MP-CAFE', 0.008], ['MP-LECHE', 0.12]]);
    await product('bravas', 'Patatas bravas', 'tapas', 5.5, [['MP-PATA', 0.25], ['MP-ACEITE', 0.03], ['MP-TOM', 0.04]]);
    await product('croquetas', 'Croquetas de jamón (6)', 'tapas', 7, [['MP-CROQ', 6], ['MP-ACEITE', 0.02]]);
    await product('burger', 'Hamburguesa completa', 'hamburguesas', 12.5, [['MP-TERN', 0.2], ['MP-PAN', 1], ['MP-CHED', 0.02], ['MP-BACON', 0.03], ['MP-PATA', 0.15], ['MP-ACEITE', 0.02]]);
    await product('tarta', 'Tarta de queso', 'postres', 5, null, ing['MP-TARTA']);

    // Sala: mesas por zona.
    const tables = {};
    for (const [area, names, seats] of [['Sala', ['1', '2', '3', '4', '5', '6', '7', '8'], 4], ['Terraza', ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'], 4], ['Barra', ['B1', 'B2', 'B3', 'B4'], 2]]) {
      for (const [i, name] of names.entries()) {
        tables[name] = (await one('insert into pos_tables (organization_id, name, area, seats, sort_order) values ($1,$2,$3,$4,$5) returning id', [bar, name, area, seats, i + 1])).id;
      }
    }

    // Terminal ya con código de vinculación y PIN del personal.
    const terminal = (await one(
      `insert into pos_terminals (organization_id, name, warehouse_id, pairing_code_hash, pairing_expires_at) values ($1,'Barra principal',$2,$3, now() + interval '30 days') returning id`,
      [bar, wh, sha256(DEMO_PAIRING_CODE.replace(/[^A-Z0-9]/g, ''))],
    )).id;
    for (const [key, pin] of Object.entries(DEMO_PINS)) {
      await q('insert into pos_staff_pins (organization_id, user_id, pin_hash) values ($1,$2,$3)', [bar, DEMO_USERS[key].id, pinHash(pin)]);
    }

    // Caja abierta esta mañana por la encargada, con algunos cobros y cuentas abiertas.
    await as(carmen.id, [bar]);
    const session = (await one(`insert into cash_sessions (organization_id, terminal_id, opening_float, opened_at) values ($1,$2,150,$3) returning id`, [bar, terminal, at(0, '08:00')])).id;
    await q(`insert into cash_movements (organization_id, cash_session_id, kind, amount, reason) values ($1,$2,'withdrawal',40,'Compra de hielo')`, [bar, session]);

    const menu = async () => Object.fromEntries((await q('select item_id, name, unit_price::text, tax_rate::text from app.pos_menu($1)', [wh])).map((m) => [m.item_id, m]));
    const tab = async (waiter, { table = null, label = null, guests = 2, items, sent = true, status = 'open' }) => {
      await as(waiter.id, [bar]);
      const prices = await menu();
      const t = (await one('insert into pos_tabs (organization_id, table_id, label, terminal_id, guests) values ($1,$2,$3,$4,$5) returning id', [bar, table && tables[table], label, terminal, guests])).id;
      for (const [key, qty] of items) {
        const m = prices[prod[key]];
        await q(
          'insert into pos_tab_lines (id, organization_id, tab_id, item_id, description, quantity, unit_price, tax_rate, sent_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [randomUUID(), bar, t, prod[key], m.name, qty, m.unit_price, m.tax_rate, sent ? new Date().toISOString() : null],
        );
      }
      if (status === 'billing') await q(`update pos_tabs set status = 'billing', precheck_at = now() where id = $1`, [t]);
      return t;
    };
    // Mismo cobro que packages/pos (checkout): ticket F2, stock con escandallo, cobro en la caja.
    const pay = async (waiter, tabId, method) => {
      await as(waiter.id, [bar]);
      const lines = buildTicketLines(await q(
        'select item_id as "itemId", description, quantity::text, unit_price::text as "unitPrice", tax_rate::text as "taxRate", discount_pct::text as "discountPct" from pos_tab_lines where tab_id = $1 order by created_at, id',
        [tabId],
      ));
      const inv = (await one(`insert into invoices (organization_id, direction, party_id, invoice_type, due_date) values ($1,'issued',null,'F2',current_date) returning id`, [bar])).id;
      for (const [i, l] of lines.entries()) {
        await q('insert into invoice_lines (organization_id, invoice_id, line_no, item_id, description, quantity, unit_price, discount_pct, tax_rate) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
          bar, inv, i + 1, l.itemId, l.description, l.quantity, l.unitPrice, l.discountPct, l.taxRate,
        ]);
      }
      const issued = await one('select total::text from app.issue_invoice($1, $2, current_date)', [inv, seriesT(isoDay(0))]);
      if (issued.total !== sumAmounts(lines).total) throw new Error(`Descuadre en el ticket de ejemplo: ${issued.total}`);
      await q(
        `insert into stock_movements (organization_id, warehouse_id, item_id, movement_type, quantity, source_type, source_id, source_line_id, note)
         select $1, $2, m.item_id, 'sale', -m.quantity, 'invoice', $3, m.line_id, m.note from (
           select l.item_id, l.quantity, l.id as line_id, 'Venta TPV' as note
           from invoice_lines l join inventory_items i on i.id = l.item_id
           where l.invoice_id = $3 and i.item_type = 'stockable' and not exists (select 1 from recipe_lines r where r.product_id = l.item_id)
           union all
           select r.ingredient_id, sum(l.quantity * r.quantity), null::uuid, 'Venta TPV · escandallo'
           from invoice_lines l join recipe_lines r on r.product_id = l.item_id where l.invoice_id = $3 group by r.ingredient_id
         ) m order by m.item_id`,
        [bar, wh, inv],
      );
      await q('insert into invoice_payments (organization_id, invoice_id, amount, method, cash_session_id) values ($1,$2,$3,$4,$5)', [bar, inv, issued.total, method, session]);
      await q(`update pos_tabs set status = 'paid', invoice_id = $2, cash_session_id = $3, closed_at = now(), closed_by = $4 where id = $1`, [tabId, inv, session, waiter.id]);
    };

    await pay(marta, await tab(marta, { table: 'B1', guests: 1, items: [['solo', 1], ['cortado', 1]] }), 'cash');
    await pay(marta, await tab(marta, { table: '3', items: [['conleche', 2], ['tarta', 1]] }), 'card');
    await pay(ivan, await tab(ivan, { table: 'T2', guests: 4, items: [['cana', 4], ['bravas', 1], ['croquetas', 1]] }), 'card');
    await pay(ivan, await tab(ivan, { label: 'Barra', guests: 1, items: [['botellin', 2]] }), 'cash');
    await pay(marta, await tab(marta, { table: '5', items: [['burger', 2], ['cola', 1], ['agua', 1]] }), 'card');
    await pay(ivan, await tab(ivan, { table: 'T4', guests: 3, items: [['gintonic', 2], ['mojito', 1]] }), 'cash');

    await tab(marta, { table: '2', guests: 4, items: [['cana', 3], ['doble', 1], ['bravas', 1], ['burger', 1]] });
    await tab(ivan, { table: 'T1', guests: 2, items: [['gintonic', 2]], status: 'billing' });
    await tab(marta, { table: '7', guests: 2, items: [['conleche', 1], ['cola', 1]], sent: false });
    await tab(ivan, { label: 'Barra', guests: 1, items: [['cubata', 1]] });
  }

  await q(`select set_config('app.user_id', '', false), set_config('app.org_ids', '', false)`);
}
