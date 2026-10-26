// DATOS DE EJEMPLO para desarrollo local. Todo es ficticio: personas, NIF,
// clientes, proveedores e importes. Se siembra a través de las mismas funciones
// y triggers que usa la aplicación (create_organization, issue_invoice, libro
// de stock…), así que los datos cumplen las reglas del esquema.
//
// Las fechas son relativas al día de la siembra; `npm run db:reset` las renueva.

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
          const line = await one(
            'insert into goods_receipt_lines (organization_id, receipt_id, line_no, item_id, quantity, unit_cost) values ($1,$2,$3,$4,$5,$6) returning id',
            [org, r.id, n++, itemId, qty, cost],
          );
          if (post) {
            await q(
              `insert into stock_movements (organization_id, warehouse_id, item_id, movement_type, quantity, unit_cost, source_type, source_id, source_line_id, occurred_at)
               values ($1,$2,$3,'receipt',$4,$5,'goods_receipt',$6,$7,$8)`,
              [org, warehouseId, itemId, qty, cost, r.id, line.id, at(-daysAgo, '09:30')],
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
    const catalog = [
      ['T-M6', 'Tornillo M6 inox (caja 100)', 'caja', 0.35, 0.62, 200],
      ['T-M8', 'Tornillo M8 inox (caja 100)', 'caja', 0.48, 0.85, 150],
      ['BR-32', 'Brida metálica 32 mm', 'ud', 0.21, 0.45, 50],
      ['CA-50', 'Cinta americana 50 m', 'rollo', 2.9, 5.4, 24],
      ['TN-8', 'Taco nailon 8 mm (bolsa 50)', 'bolsa', 1.1, 2.3, 500],
      ['SL-300', 'Silicona neutra 300 ml', 'ud', 2.4, 4.95, 60],
      ['GU-NI', 'Guantes de nitrilo (caja 100)', 'caja', 4.6, 8.9, 40],
      ['BR-HSS6', 'Broca HSS 6 mm', 'ud', 0.9, 1.95, 80],
      ['DC-230', 'Disco de corte 230 mm', 'ud', 1.7, 3.6, 30],
      ['CN-CU25', 'Cinta métrica 5 m', 'ud', 3.2, 6.5, 20],
    ];
    for (const [sku, name, unit, cost, price] of catalog) {
      items[sku] = await c.item(sku, name, unit);
      await q('insert into price_list_items (organization_id, price_list_id, item_id, unit_price) values ($1,$2,$3,$4), ($1,$5,$3,$6)', [
        dist, general, items[sku], price, pro, (price * 0.9).toFixed(4),
      ]);
    }
    items.TRANSPORTE = await c.item('SRV-PORTE', 'Portes y entrega', 'servicio', 21, 'service');
    await q('insert into price_list_items (organization_id, price_list_id, item_id, unit_price) values ($1,$2,$3,18)', [dist, general, items.TRANSPORTE]);

    const tornilleria = await c.party('Tornillería Norte S.A.', { supplier: true, taxId: 'A48112233', email: 'pedidos@tornillerianorte.example', terms: 60 });
    const adhesivos = await c.party('Adhesivos Levante S.L.', { supplier: true, taxId: 'B46223344', terms: 30 });
    const herramientas = await c.party('Herramientas Ibéricas S.A.', { supplier: true, taxId: 'A50334455', terms: 45 });
    const ruiz = await c.party('Ferretería Ruiz S.L.', { customer: true, address: { line: 'C/ Santiago 21', postalCode: '47001', city: 'Valladolid', province: 'Valladolid' },  taxId: 'B47112200', email: 'compras@ferreteriaruiz.example', priceList: pro });
    const ebro = await c.party('Construcciones Ebro S.A.', { customer: true, address: { line: 'Avda. de Cataluña 88', postalCode: '50014', city: 'Zaragoza', province: 'Zaragoza' },  taxId: 'A50998877', priceList: pro });
    const gil = await c.party('Suministros Gil', { customer: true, address: { line: 'C/ Mayor 5', postalCode: '47400', city: 'Medina del Campo', province: 'Valladolid' },  taxId: '12345678Z' });
    const duero = await c.party('Almacenes Duero S.L.', { customer: true, address: { line: 'Ctra. de Soria km 3', postalCode: '47193', city: 'La Cistérniga', province: 'Valladolid' },  taxId: 'B47556677' });
    const castilla = await c.party('Reformas Castilla S.L.', { customer: true, address: { line: 'C/ Vitoria 140, bajo', postalCode: '09007', city: 'Burgos', province: 'Burgos' },  taxId: 'B09887766' });

    const seriesA = await c.series('A', 'standard', 'Facturas');
    await c.series('T', 'simplified', 'Tickets de TPV');
    await c.series('R', 'rectifying', 'Rectificativas');

    // Stock: entradas contabilizadas, ventas y mínimos.
    await c.receipt(cen, tornilleria, 'TN-ALB-5531', [[items['T-M6'], 300, 0.35], [items['T-M8'], 200, 0.48], [items['TN-8'], 600, 1.1]], { post: true, daysAgo: 40 });
    await c.receipt(cen, adhesivos, 'AL-20811', [[items['CA-50'], 48, 2.9], [items['SL-300'], 120, 2.4]], { post: true, daysAgo: 33 });
    await c.receipt(cen, herramientas, 'HI-77120', [[items['BR-32'], 100, 0.21], [items['GU-NI'], 60, 4.6], [items['BR-HSS6'], 150, 0.9], [items['DC-230'], 50, 1.7], [items['CN-CU25'], 30, 3.2]], { post: true, daysAgo: 28 });
    await c.receipt(n2, tornilleria, 'TN-ALB-5602', [[items['T-M6'], 100, 0.36], [items['T-M8'], 80, 0.48]], { post: true, daysAgo: 12 });
    for (const [sku, qty, d] of [['T-M6', 260, 6], ['BR-32', 88, 5], ['CA-50', 45, 4], ['TN-8', 420, 3], ['SL-300', 30, 2], ['GU-NI', 12, 2], ['DC-230', 14, 1]]) {
      await c.sale(cen, items[sku], qty, d);
    }
    for (const [sku, min] of [['T-M6', 200], ['T-M8', 150], ['BR-32', 50], ['CA-50', 24], ['TN-8', 500], ['SL-300', 60], ['GU-NI', 40], ['BR-HSS6', 80], ['DC-230', 30], ['CN-CU25', 20]]) {
      await c.minimum(cen, items[sku], min);
    }

    // Albaranes pendientes de contabilizar.
    await c.receipt(cen, tornilleria, 'TN-ALB-5688', [[items['T-M6'], 400, 0.36], [items['TN-8'], 300, 1.12]]);
    await c.receipt(cen, adhesivos, 'AL-20977', [[items['CA-50'], 48, 2.95]]);
    await c.receipt(n2, herramientas, 'HI-77301', [[items['DC-230'], 40, 1.72], [items['BR-HSS6'], 60, 0.9]]);
    await c.receipt(cen, herramientas, 'HI-77302', [[items['GU-NI'], 40, 4.65]]);

    // Pedidos de compra.
    const po = await one(
      `insert into purchase_orders (organization_id, supplier_id, warehouse_id, status, order_date, expected_on) values ($1,$2,$3,'sent',$4,$5) returning id`,
      [dist, adhesivos, cen, isoDay(-3), isoDay(4)],
    );
    // Las líneas se insertan con el pedido aún en borrador (el trigger protege los enviados).
    await q(`update purchase_orders set status = 'draft' where id = $1`, [po.id]);
    await q(
      'insert into purchase_order_lines (organization_id, purchase_order_id, line_no, item_id, quantity, unit_cost) values ($1,$2,1,$3,120,2.4), ($1,$2,2,$4,48,2.9)',
      [dist, po.id, items['SL-300'], items['CA-50']],
    );
    await q(`update purchase_orders set status = 'sent' where id = $1`, [po.id]);
    const po2 = await one(`insert into purchase_orders (organization_id, supplier_id, warehouse_id, expected_on) values ($1,$2,$3,$4) returning id`, [dist, herramientas, cen, isoDay(10)]);
    await q('insert into purchase_order_lines (organization_id, purchase_order_id, line_no, item_id, quantity, unit_cost) values ($1,$2,1,$3,60,4.6)', [dist, po2.id, items['GU-NI']]);

    // Facturas emitidas (en orden cronológico: la huella se encadena).
    const L = (sku, qty, price) => [items[sku], catalog.find((x) => x[0] === sku)[1], qty, price];
    await c.invoice(seriesA, ruiz, 62, [L('T-M6', 40, 0.56), L('SL-300', 24, 4.45)], { paid: 'all' });
    await c.invoice(seriesA, ebro, 55, [L('GU-NI', 30, 8.0), L('DC-230', 50, 3.24)], { paid: 'all' });
    await c.invoice(seriesA, duero, 50, [L('T-M8', 60, 0.85), L('TN-8', 100, 2.3)], { paid: 'all' });
    await c.invoice(seriesA, ruiz, 51, [L('CA-50', 300, 5.4), L('BR-32', 400, 0.45)], { termsDays: 30 }); // vencida 21 días
    await c.invoice(seriesA, castilla, 46, [L('SL-300', 80, 4.95), L('GU-NI', 20, 8.9)], { paid: 'all' });
    await c.invoice(seriesA, ebro, 44, [L('DC-230', 300, 3.24), L('BR-HSS6', 120, 1.75)], { termsDays: 30 }); // vencida 14 días
    await c.invoice(seriesA, gil, 37, [L('T-M6', 500, 0.62), L('CN-CU25', 20, 6.5)], { termsDays: 30, paid: 120 }); // vencida, parcial
    await c.invoice(seriesA, duero, 26, [L('TN-8', 600, 2.3), L('CA-50', 100, 5.4)], { termsDays: 30 });
    await c.invoice(seriesA, ruiz, 20, [L('T-M8', 300, 0.77), L('SL-300', 40, 4.45)], { termsDays: 30, paid: 'all' });
    await c.invoice(seriesA, castilla, 15, [L('GU-NI', 60, 8.9), L('DC-230', 80, 3.6)], { termsDays: 30 });
    await c.invoice(seriesA, ebro, 9, [L('BR-32', 1000, 0.41), L('T-M6', 200, 0.56)], { termsDays: 30, fiscal: 'pending' });
    await c.invoice(seriesA, gil, 4, [L('SL-300', 30, 4.95)], { termsDays: 15, fiscal: 'pending' });
    await c.invoice(seriesA, duero, 2, [L('CN-CU25', 15, 6.5), L('BR-HSS6', 50, 1.95)], {
      termsDays: 30,
      fiscal: 'rejected',
      response: { code: '4102', message: 'El NIF del destinatario no está identificado en la AEAT' },
    });

    // Facturas de proveedor.
    await c.receivedInvoice(tornilleria, 'TN-F-2026-1188', 38, [L('T-M6', 300, 0.35), L('T-M8', 200, 0.48)], { termsDays: 60 });
    await c.receivedInvoice(adhesivos, 'AL-F-9921', 32, [L('CA-50', 48, 2.9), L('SL-300', 120, 2.4)], { paid: true });
    await c.receivedInvoice(herramientas, 'HI-2026-0412', 27, [L('GU-NI', 60, 4.6), L('DC-230', 50, 1.7)], { termsDays: 45 });

    // Pedido de venta B2B confirmado y otro en borrador.
    const so = await one(`insert into sales_orders (organization_id, customer_id, warehouse_id, price_list_id) values ($1,$2,$3,$4) returning id`, [dist, castilla, cen, pro]);
    await q(
      `insert into sales_order_lines (organization_id, sales_order_id, line_no, item_id, description, quantity, unit_price, tax_rate)
       values ($1,$2,1,$3,'Tornillo M8 inox (caja 100)',40,0.77,21), ($1,$2,2,$4,'Silicona neutra 300 ml',24,4.45,21)`,
      [dist, so.id, items['T-M8'], items['SL-300']],
    );
    await q(`update sales_orders set status = 'confirmed' where id = $1`, [so.id]);
    const so2 = await one(`insert into sales_orders (organization_id, customer_id, warehouse_id, price_list_id) values ($1,$2,$3,$4) returning id`, [dist, ruiz, cen, pro]);
    await q(
      `insert into sales_order_lines (organization_id, sales_order_id, line_no, item_id, description, quantity, unit_price, tax_rate)
       values ($1,$2,1,$3,'Guantes de nitrilo (caja 100)',10,8.01,21)`,
      [dist, so2.id, items['GU-NI']],
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
      priority: 'urgent', category: 'Recepción', partyId: tornilleria, assignee: marta,
      description: 'Llegó un palé con cajas de tornillería abiertas. Faltan unidades por contar.',
      comments: [[marta, 'He apartado el palé en la zona de devoluciones y he hecho fotos.'], [lucia, 'Avisa al proveedor y pide abono si faltan unidades.']],
    });
    await c.incident('Fichaje olvidado · M. Ortega', { priority: 'high', category: 'RRHH', employee: marta, assignee: carmen });
    await c.incident('Error de precio en tarifa Profesional', { priority: 'normal', category: 'Ventas', partyId: ruiz, assignee: carmen });
    await c.incident('Carretilla 2 hace ruido al elevar', { priority: 'normal', category: 'Mantenimiento', assignee: ivan });
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
    const palet = await c.item('PAL-EU', 'Palé europeo', 'ud');
    const porte = await c.item('SRV-RUTA', 'Servicio de ruta', 'servicio', 21, 'service');
    const centro = await c.party('Gasóleos Centro S.L.', { supplier: true, taxId: 'B47001122' });
    const distrib = await c.party('Distribuciones Albar S.L.', { customer: true, address: { line: 'Polígono San Cristóbal, C/ Plata 14', postalCode: '47012', city: 'Valladolid', province: 'Valladolid' },  taxId: 'B28461930' });
    const leroy = await c.party('Bricocentro Valladolid S.A.', { customer: true, address: { line: 'Avda. de Zamora 30', postalCode: '47008', city: 'Valladolid', province: 'Valladolid' },  taxId: 'A47009988' });
    const seriesL = await c.series('L', 'standard', 'Facturas');
    await c.series('T', 'simplified', 'Tickets');
    await c.receipt(base, centro, 'GC-ALB-301', [[palet, 120, 7.5]], { post: true, daysAgo: 20 });
    await c.minimum(base, palet, 40);
    await c.invoice(seriesL, distrib, 40, [[porte, 'Rutas septiembre', 16, 150]], { paid: 'all' });
    await c.invoice(seriesL, leroy, 30, [[porte, 'Rutas Bricocentro', 10, 180]], { paid: 'all' });
    await c.invoice(seriesL, distrib, 10, [[porte, 'Rutas octubre (1ª quincena)', 16, 150]], { paid: 1000 });
    await c.invoice(seriesL, leroy, 3, [[porte, 'Rutas octubre', 12, 180]]);
    await c.receivedInvoice(centro, 'GC-55102', 6, [[gasoil, 'Gasóleo A', 900, 1.31]], { termsDays: 30 });
    await c.shift(ruben, 0, '06:00', '14:00', 'Ruta Valladolid–Palencia');
    await c.clock(ruben, 0, 'clock_in', '05:57', { lat: 41.6311, lng: -4.7429 });
    await c.clock(carmen, 0, 'clock_in', '09:02');
    await c.incident('Retraso en ruta Valladolid', { category: 'Rutas', assignee: ruben });
  }

  // ================================================================== Talleres Albar
  {
    const c = await context(tall);
    await c.member(ruben, 'employee', 'T-003');
    const taller = await c.warehouse('TAL', 'Taller');
    const disco = await c.item('DC-230', 'Disco de corte 230 mm', 'ud');
    const electrodo = await c.item('EL-25', 'Electrodo rutilo 2,5 mm (caja)', 'caja');
    const mano = await c.item('SRV-MO', 'Mano de obra', 'h', 21, 'service');
    const herr = await c.party('Herramientas Ibéricas S.A.', { supplier: true, taxId: 'A50334455' });
    const lara = await c.party('Excavaciones Lara S.L.', { customer: true, address: { line: 'C/ Industria 7', postalCode: '34004', city: 'Palencia', province: 'Palencia' },  taxId: 'B34556677' });
    const agro = await c.party('Agrícola Tierra de Campos', { customer: true, address: { line: 'Camino de la Vega s/n', postalCode: '47800', city: 'Medina de Rioseco', province: 'Valladolid' },  taxId: 'F47223344' });
    const seriesT = await c.series('TA', 'standard', 'Facturas');
    await c.series('T', 'simplified', 'Tickets');
    await c.receipt(taller, herr, 'HI-77155', [[disco, 30, 1.7], [electrodo, 20, 9.8]], { post: true, daysAgo: 25 });
    await c.sale(taller, disco, 24, 3);
    await c.minimum(taller, disco, 20);
    await c.minimum(taller, electrodo, 5);
    await c.receipt(taller, herr, 'HI-77290', [[disco, 20, 1.72]]);
    await c.invoice(seriesT, lara, 46, [[mano, 'Reparación brazo excavadora', 22, 45], [disco, 'Disco de corte 230 mm', 6, 3.6]], { paid: 'all' });
    await c.invoice(seriesT, lara, 46 - 30 + 16, [[mano, 'Soldadura cazo', 22, 45]], { termsDays: 30 }); // vencida
    await c.invoice(seriesT, agro, 12, [[mano, 'Revisión cosechadora', 40, 45]], { paid: 600, fiscal: 'pending' });
    await c.shift(ruben, 0, '08:00', '14:00', 'Taller');
  }

  await q(`select set_config('app.user_id', '', false), set_config('app.org_ids', '', false)`);
}
