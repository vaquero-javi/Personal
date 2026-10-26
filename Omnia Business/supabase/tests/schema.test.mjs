import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Pruebas de integración del esquema sobre Postgres embebido (PGlite):
// aislamiento RLS, FKs compuestas, libro de stock, RBAC, fichajes y facturación.
//   npm run db:test
const dir = process.argv[2] ?? fileURLToPath(new URL('../migrations', import.meta.url));
const files = ['20261025000001_tenancy_rbac.sql', '20261025000002_parties_inventory.sql',
  '20261025000003_invoicing.sql', '20261025000004_hr_incidents.sql', '20261025000006_purchasing_sales_hr.sql', '20261025000007_session_queries.sql', '20261025000008_invoice_editor.sql', '20261025000009_invoice_document.sql', '20261025000010_goods_receipt_documents.sql', '20261025000011_payslips.sql'];
const db = new PGlite();
for (const f of files) {
  try { await db.exec(readFileSync(`${dir}/${f}`, 'utf8')); console.log('OK migración', f); }
  catch (e) { console.error('FALLO', f, e.message); process.exit(1); }
}

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(cond ? '  ✓' : '  ✗', name, extra); };
const q = async (sql, params) => (await db.query(sql, params)).rows;
const expectError = async (name, sql, params, re) => {
  try { await db.query(sql, params); ok(name, false, '(no falló)'); }
  catch (e) { ok(name, re.test(e.message) || re.test(e.code ?? ''), `→ ${e.code ?? ''} ${e.message}`); }
};
const as = async (userId, orgIds) => {
  await db.exec('reset role');
  await q(`select set_config('app.user_id', $1, false), set_config('app.org_ids', $2, false)`, [userId, `{${orgIds.join(',')}}`]);
  await db.exec('set role app_user');
};

const U1 = '11111111-1111-1111-1111-111111111111';
const U2 = '22222222-2222-2222-2222-222222222222';
await q(`insert into users (id, email) values ($1,'ana@a.es'), ($2,'beto@b.es')`, [U1, U2]);

await as(U1, []);
const [{ id: A }] = await q(`select app.create_organization('acme', 'Acme SL', 'B11111111') as id`);
await as(U2, []);
const [{ id: B }] = await q(`select app.create_organization('beta', 'Beta SL', 'B22222222') as id`);

console.log('\nAislamiento');
await as(U1, [A]);
ok('U1 ve solo su organización', (await q('select id from organizations')).length === 1);
const [{ id: W }] = await q(`insert into warehouses (organization_id, code, name) values ($1,'CEN','Central') returning id`, [A]);
const [{ id: I }] = await q(`insert into inventory_items (organization_id, sku, name) values ($1,'SKU-1','Tornillo') returning id`, [A]);
const [{ id: S }] = await q(`insert into parties (organization_id, is_supplier, legal_name) values ($1,true,'Prov SA') returning id`, [A]);
await expectError('U1 no puede escribir en Beta', `insert into warehouses (organization_id, code, name) values ($1,'X','X')`, [B], /row-level security/);

await as(U1, [B]);
ok('U1 pidiendo Beta no ve almacenes', (await q('select * from warehouses')).length === 0);
await as(U2, [A]);
ok('U2 pidiendo Acme no ve artículos', (await q('select * from inventory_items')).length === 0);

await as(U2, [B]);
const [{ id: WB }] = await q(`insert into warehouses (organization_id, code, name) values ($1,'CEN','Central B') returning id`, [B]);
await db.exec('reset role');   // incluso saltándose RLS, la FK compuesta impide mezclar tenants
await expectError('FK compuesta impide stock de B con artículo de A',
  `insert into stock_movements (organization_id, warehouse_id, item_id, movement_type, quantity, created_by) values ($1,$2,$3,'receipt',1,$4)`,
  [B, WB, I, U2], /foreign key|23503/);
const [{ id: SB }] = await q(`insert into parties (organization_id, is_supplier, legal_name) values ($1,true,'Prov B') returning id`, [B]);
const [{ id: RB }] = await q(`insert into goods_receipts (organization_id, number, warehouse_id, supplier_id, supplier_delivery_note) values ($1,1,$2,$3,'X1') returning id`, [B, WB, SB]);
await expectError('FK compuesta impide línea de albarán de B con artículo de A (como superusuario)',
  `insert into goods_receipt_lines (organization_id, receipt_id, line_no, item_id, quantity, unit_cost) values ($1,$2,1,$3,1,1)`, [B, RB, I], /foreign key/);

console.log('\nAlbarán y stock');
await as(U1, [A]);
const [{ id: R, number }] = await q(`insert into goods_receipts (organization_id, warehouse_id, supplier_id, supplier_delivery_note) values ($1,$2,$3,'ALB-77') returning id, number`, [A, W, S]);
ok('numeración correlativa del albarán', Number(number) === 1);
const [{ id: L1 }] = await q(`insert into goods_receipt_lines (organization_id, receipt_id, line_no, item_id, quantity, unit_cost) values ($1,$2,1,$3,10,2.00) returning id`, [A, R, I]);
await q(`insert into stock_movements (organization_id, warehouse_id, item_id, movement_type, quantity, unit_cost, source_type, source_id, source_line_id)
         values ($1,$2,$3,'receipt',10,2.00,'goods_receipt',$4,$5)`, [A, W, I, R, L1]);
await q(`update goods_receipts set status='posted', posted_at=now(), posted_by=$2 where id=$1`, [R, U1]);
let [lvl] = await q(`select on_hand, avg_unit_cost from stock_levels where item_id=$1`, [I]);
ok('saldo tras la entrada = 10', Number(lvl.on_hand) === 10, JSON.stringify(lvl));
await expectError('doble contabilización de la misma línea', `insert into stock_movements (organization_id, warehouse_id, item_id, movement_type, quantity, unit_cost, source_type, source_id, source_line_id)
         values ($1,$2,$3,'receipt',10,2.00,'goods_receipt',$4,$5)`, [A, W, I, R, L1], /duplicate key|23505/);
await expectError('albarán contabilizado es inmutable', `update goods_receipts set notes='x' where id=$1`, [R], /OM001|ya está/);
const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
await q(`insert into goods_receipt_documents (organization_id, receipt_id, content_type, file_name, byte_size, content) values ($1,$2,'image/jpeg','alb.jpg',4,$3)`, [A, R, photo]);
ok('foto guardada con el albarán', (await q(`select length(content)::int n from goods_receipt_documents where receipt_id=$1`, [R]))[0]?.n === 4);
await expectError('una sola foto por albarán', `insert into goods_receipt_documents (organization_id, receipt_id, content_type, file_name, byte_size, content) values ($1,$2,'image/jpeg','b.jpg',4,$3)`, [A, R, photo], /duplicate key|23505/);
await expectError('la foto no se sustituye', `update goods_receipt_documents set file_name='x' where receipt_id=$1`, [R], /permission denied/);
await as(U2, [B]);
ok('otra sociedad no ve la foto', (await q(`select 1 from goods_receipt_documents`)).length === 0);
await as(U1, [A]);
await expectError('stock_levels.on_hand no se edita a mano', `update stock_levels set on_hand=999 where item_id=$1`, [I], /permission denied/);
await q(`insert into stock_movements (organization_id, warehouse_id, item_id, movement_type, quantity, unit_cost) values ($1,$2,$3,'receipt',10,4.00)`, [A, W, I]);
[lvl] = await q(`select on_hand, avg_unit_cost from stock_levels where item_id=$1`, [I]);
ok('coste medio ponderado = 3', Number(lvl.avg_unit_cost) === 3, JSON.stringify(lvl));
await expectError('salida sin existencias', `insert into stock_movements (organization_id, warehouse_id, item_id, movement_type, quantity) values ($1,$2,$3,'issue',-25)`, [A, W, I], /stock_levels_on_hand_non_negative/);
const [mv] = await q(`insert into stock_movements (organization_id, warehouse_id, item_id, movement_type, quantity) values ($1,$2,$3,'issue',-5) returning unit_cost`, [A, W, I]);
ok('salida valorada al coste medio', Number(mv.unit_cost) === 3);
await expectError('movimiento inmutable', `update stock_movements set note='x'`, [], /permission denied|OM001/);

console.log('\nRBAC');
await db.exec('reset role');
const [{ id: EMP }] = await q(`select id from roles where organization_id=$1 and key='employee'`, [A]);
await q(`insert into user_organizations (user_id, organization_id, role_id) values ($1,$2,$3)`, [U2, A, EMP]);
await as(U2, [A]);
ok('empleado ve el stock', (await q('select * from stock_levels')).length === 1);
await expectError('empleado no contabiliza stock', `insert into stock_movements (organization_id, warehouse_id, item_id, movement_type, quantity) values ($1,$2,$3,'receipt',1)`, [A, W, I], /row-level security/);
await expectError('empleado no ve facturas', `insert into invoice_series (organization_id, code, fiscal_year) values ($1,'A',2026)`, [A], /row-level security/);
const esc = await db.query(`update user_organizations set role_id = (select id from roles where key='owner' and organization_id=$1) where user_id=$2 and organization_id=$1`, [A, U2]);
ok('empleado no se autoasciende (0 filas afectadas)', esc.affectedRows === 0);
ok('…y su rol sigue siendo empleado', (await q(`select 1 from user_organizations where user_id=$1 and organization_id=$2 and role_id=$3`, [U2, A, EMP])).length === 1);
const [{ id: T }] = await q(`insert into time_entries (organization_id, user_id, entry_type, latitude, longitude, geo_consent) values ($1,$2,'clock_in',40.4,-3.7,true) returning id`, [A, U2]);
ok('empleado ficha', !!T);
await expectError('fichaje por otro empleado', `insert into time_entries (organization_id, user_id, entry_type) values ($1,$2,'clock_in')`, [A, U1], /row-level security/);
await expectError('geolocalización sin consentimiento', `insert into time_entries (organization_id, user_id, entry_type, latitude, longitude) values ($1,$2,'clock_in',1,1)`, [A, U2], /check constraint/);
await expectError('fichaje inmutable', `delete from time_entries where id=$1`, [T], /permission denied|OM001/);
const [{ number: incNo }] = await q(`insert into incidents (organization_id, title, employee_user_id) values ($1,'Fichaje olvidado',$2) returning number`, [A, U2]);
ok('empleado abre incidencia nº1', Number(incNo) === 1);

console.log('\nFacturación');
await as(U1, [A]);
const [{ id: SER }] = await q(`insert into invoice_series (organization_id, code, fiscal_year) values ($1,'A',2026) returning id`, [A]);
const [{ id: C }] = await q(`insert into parties (organization_id, is_customer, legal_name, tax_id) values ($1,true,'Cliente SL','B33333333') returning id`, [A]);
const mkInvoice = async (qty, price) => {
  const [{ id }] = await q(`insert into invoices (organization_id, direction, party_id) values ($1,'issued',$2) returning id`, [A, C]);
  await q(`insert into invoice_lines (organization_id, invoice_id, line_no, description, quantity, unit_price, tax_rate) values ($1,$2,1,'Servicio',$3,$4,21)`, [A, id, qty, price]);
  return id;
};
const F1 = await mkInvoice(2, 50);
await expectError('no se emite por UPDATE directo', `update invoices set status='issued' where id=$1`, [F1], /row-level security/);
const [inv1] = await q(`select * from app.issue_invoice($1,$2,'2026-10-25')`, [F1, SER]);
ok('factura 1 numerada A-2026-000001', inv1.full_number === 'A-2026-000001');
ok('totales 100 + 21 = 121', Number(inv1.total) === 121, `${inv1.subtotal} ${inv1.tax_total} ${inv1.total}`);
ok('huella sin anterior', inv1.fiscal_previous_hash === null && /^[0-9A-F]{64}$/.test(inv1.fiscal_record_hash));
const F2 = await mkInvoice(1, 10);
const [inv2] = await q(`select * from app.issue_invoice($1,$2,'2026-10-25')`, [F2, SER]);
ok('factura 2 encadenada a la 1', inv2.fiscal_previous_hash === inv1.fiscal_record_hash && inv2.number === 2);
const F3 = await mkInvoice(10, 100);
await q(`update invoices set withholding_rate = 15 where id=$1`, [F3]);
const [inv3] = await q(`select * from app.issue_invoice($1,$2,'2026-10-25')`, [F3, SER]);
ok('retención IRPF 15 %: 1000 + 210 − 150 = 1060', Number(inv3.withholding_total) === 150 && Number(inv3.total) === 1060, `${inv3.withholding_total} ${inv3.total}`);
ok('emitida congela emisor y cliente', inv3.issuer_snapshot?.taxId === 'B11111111' && inv3.party_snapshot?.legalName === 'Cliente SL');
await q(`update parties set legal_name = 'Cliente Renombrado SL' where id=$1`, [C]);
ok('renombrar el cliente no altera la factura', (await q(`select party_snapshot from invoices where id=$1`, [F3]))[0].party_snapshot.legalName === 'Cliente SL');
await expectError('factura emitida inmutable', `update invoices set total=1 where id=$1`, [F1], /OM001|inmutables/);
await expectError('líneas de emitida inmutables', `update invoice_lines set quantity=9 where invoice_id=$1`, [F1], /OM001|emitida/);
await q(`insert into invoice_payments (organization_id, invoice_id, amount, method) values ($1,$2,21,'card')`, [A, F1]);
ok('cobro parcial', (await q(`select status from invoices where id=$1`, [F1]))[0].status === 'partially_paid');
await expectError('cobro por encima del pendiente', `insert into invoice_payments (organization_id, invoice_id, amount, method) values ($1,$2,500,'card')`, [A, F1], /supera/);
await q(`insert into invoice_payments (organization_id, invoice_id, amount, method) values ($1,$2,100,'transfer')`, [A, F1]);
ok('cobro total → pagada', (await q(`select status from invoices where id=$1`, [F1]))[0].status === 'paid');
await as(U2, [B]);
await expectError('otro tenant no emite facturas ajenas', `select * from app.issue_invoice($1,$2,'2026-10-25')`, [F2, SER], /no encontrada/);

console.log('\nNóminas');
await as(U1, [A]);   // propietaria de Acme; U2 es empleado de Acme
const pdf = new TextEncoder().encode('%PDF-1.4 x');
const [{ id: N1 }] = await q(`insert into payslips (organization_id, user_id, period, net_amount, content_type, file_name, byte_size, content) values ($1,$2,'2026-09-01',1200,'application/pdf','n.pdf',$3,$4) returning id`, [A, U2, pdf.length, pdf]);
await q(`insert into payslips (organization_id, user_id, period, content_type, file_name, byte_size, content) values ($1,$2,'2026-09-01','application/pdf','n.pdf',$3,$4)`, [A, U1, pdf.length, pdf]);
await expectError('una nómina por persona, mes y tipo', `insert into payslips (organization_id, user_id, period, content_type, file_name, byte_size, content) values ($1,$2,'2026-09-01','application/pdf','n.pdf',$3,$4)`, [A, U2, pdf.length, pdf], /duplicate key|23505/);
await expectError('el periodo es un mes', `insert into payslips (organization_id, user_id, period, content_type, file_name, byte_size, content) values ($1,$2,'2026-08-15','application/pdf','n.pdf',$3,$4)`, [A, U2, pdf.length, pdf], /check constraint/);
await expectError('no se sube nómina a quien no es de la sociedad', `insert into payslips (organization_id, user_id, period, content_type, file_name, byte_size, content) values ($1,$2,'2026-09-01','application/pdf','n.pdf',$3,$4)`, [B, U2, pdf.length, pdf], /row-level security|foreign key/);
await as(U2, [A]);
const mine = await q(`select id from payslips`);
ok('el empleado ve solo su nómina', mine.length === 1 && mine[0].id === N1);
await expectError('el empleado no sube nóminas', `insert into payslips (organization_id, user_id, period, content_type, file_name, byte_size, content) values ($1,$2,'2026-10-01','application/pdf','n.pdf',$3,$4)`, [A, U2, pdf.length, pdf], /row-level security/);
const del = await db.query(`delete from payslips where id=$1`, [N1]);
ok('el empleado no borra su nómina', del.affectedRows === 0);
await expectError('el empleado no edita su nómina', `update payslips set net_amount=9999 where id=$1`, [N1], /permission denied/);
await q(`select app.mark_payslip_viewed($1)`, [N1]);
ok('acuse de lectura al abrirla', (await q(`select viewed_at from payslips where id=$1`, [N1]))[0].viewed_at !== null);
await as(U2, [B]);
ok('desde otra sociedad no se ve', (await q(`select 1 from payslips`)).length === 0);
await db.exec('reset role');
ok('la auditoría no copia el PDF', (await q(`select count(*)::int n from audit_log where table_name='payslips' and (new_data ? 'content' or old_data ? 'content')`))[0].n === 0);

console.log('\nConsolidado (holding)');
await db.exec('reset role');
const [{ id: OWN_B }] = await q(`select id from roles where organization_id=$1 and key='owner'`, [B]);
await q(`insert into user_organizations (user_id, organization_id, role_id) values ($1,$2,$3)`, [U1, B, OWN_B]);
await as(U1, [A, B]);
ok('vista consolidada ve almacenes de A y B', (await q('select * from warehouses')).length === 2);
const audit = await q(`select count(*)::int n from audit_log`);
ok('auditoría registrada', audit[0].n > 0, `(${audit[0].n} filas)`);

console.log(`\n${pass} correctas, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
