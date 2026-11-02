import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Pruebas de integración del esquema sobre Postgres embebido (PGlite):
// aislamiento RLS, FKs compuestas, libro de stock, RBAC, fichajes y facturación.
//   npm run db:test
const dir = process.argv[2] ?? fileURLToPath(new URL('../migrations', import.meta.url));
const files = ['20261025000001_tenancy_rbac.sql', '20261025000002_parties_inventory.sql',
  '20261025000003_invoicing.sql', '20261025000004_hr_incidents.sql', '20261025000006_purchasing_sales_hr.sql', '20261025000007_session_queries.sql', '20261025000008_invoice_editor.sql', '20261025000009_invoice_document.sql', '20261025000010_goods_receipt_documents.sql', '20261025000011_payslips.sql', '20261028000012_pos.sql', '20261028000013_purchase_formats.sql', '20261028000014_receipt_pack_choice.sql', '20261028000015_pos_unpair.sql', '20261028000016_pos_tickets_verifactu.sql', '20261028000017_fiscal_chain_order.sql'];
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
await expectError('salida sin existencias', `insert into stock_movements (organization_id, warehouse_id, item_id, movement_type, quantity) values ($1,$2,$3,'issue',-25)`, [A, W, I], /stock_levels_on_hand_non_negative|23514/);
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
ok('factura 3 encadenada a la 2 aunque se emitan en el mismo segundo', inv3.fiscal_previous_hash === inv2.fiscal_record_hash && inv3.fiscal_chain_seq > inv2.fiscal_chain_seq);
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

console.log('\nTPV');
await db.exec('reset role');
const U3 = '33333333-3333-3333-3333-333333333333';
await q(`insert into users (id, email, full_name) values ($1,'cami@a.es','Cami Camarera')`, [U3]);
const roleKeys = (await q(`select key from roles where organization_id=$1 order by key`, [A])).map((r) => r.key);
ok('las sociedades tienen roles Camarero y Encargado', roleKeys.includes('waiter') && roleKeys.includes('floor_manager'));
const [{ id: WAITER }] = await q(`select id from roles where organization_id=$1 and key='waiter'`, [A]);
await q(`insert into user_organizations (user_id, organization_id, role_id) values ($1,$2,$3)`, [U3, A, WAITER]);
const [{ id: TS }] = await q(`insert into invoice_series (organization_id, code, invoice_kind, fiscal_year) values ($1,'T','simplified',extract(year from current_date)::int) returning id`, [A]);

await as(U1, [A]);
const [{ id: TERM }] = await q(`insert into pos_terminals (organization_id, name, warehouse_id, pairing_code_hash, pairing_expires_at) values ($1,'Barra',$2,'hash-del-codigo', now() + interval '10 minutes') returning id`, [A, W]);
await expectError('nadie lee el hash del token', `select token_hash from pos_terminals`, [], /permission denied/);
await expectError('nadie lee los hashes de PIN', `select * from pos_staff_pins`, [], /permission denied/);
await db.exec('reset role');
await q(`select set_config('app.user_id', '', false), set_config('app.org_ids', '', false)`);
await db.exec('set role app_user');
ok('vincular con un código vigente', (await q(`select app.pos_pair_terminal('hash-del-codigo', 'hash-del-token') as id`))[0].id === TERM);
ok('el código no sirve dos veces', (await q(`select app.pos_pair_terminal('hash-del-codigo', 'otro') as id`))[0].id === null);
ok('el terminal se resuelve por su token sin sesión de usuario', (await q(`select organization_id from app.pos_terminal('hash-del-token')`))[0]?.organization_id === A);
ok('la camarera aparece en el personal del terminal', (await q(`select user_id from app.pos_terminal_staff('hash-del-token')`)).some((r) => r.user_id === U3));
ok('el empleado sin TPV no aparece', !(await q(`select user_id from app.pos_terminal_staff('hash-del-token')`)).some((r) => r.user_id === U2));
ok('un token desconocido no desvincula nada', (await q(`select app.pos_unpair_terminal('otro') as id`))[0].id === null);

await as(U3, [A]);
ok('la camarera no ve terminales', (await q(`select id from pos_terminals`)).length === 0);
await expectError('la camarera no pone el PIN de otra persona', `select app.pos_set_pin($1, $2, 'x')`, [A, U1], /encargado/);
await q(`select app.pos_set_pin($1, $2, 'scrypt$sal$clave')`, [A, U3]);
await db.exec('reset role');
ok('la camarera pone su propio PIN', (await q(`select pin_hash from app.pos_pin_challenge('hash-del-token', $1)`, [U3]))[0]?.pin_hash === 'scrypt$sal$clave');
for (let i = 0; i < 5; i++) await q(`select app.pos_pin_result('hash-del-token', $1, false)`, [U3]);
ok('cinco fallos bloquean el PIN', (await q(`select locked_until from app.pos_pin_challenge('hash-del-token', $1)`, [U3]))[0].locked_until !== null);

await as(U1, [A]);
const [{ id: MESA }] = await q(`insert into pos_tables (organization_id, name) values ($1,'1') returning id`, [A]);
const [{ id: CAT }] = await q(`insert into pos_categories (organization_id, name) values ($1,'Bebidas') returning id`, [A]);
const [{ id: CANA }] = await q(`insert into inventory_items (organization_id, sku, name, item_type, default_tax_rate, pos_category_id) values ($1,'CANA','Caña','consumable',10,$2) returning id`, [A, CAT]);
const [{ id: BARRIL }] = await q(`insert into inventory_items (organization_id, sku, name, unit_of_measure, default_tax_rate) values ($1,'BARRIL','Barril','l',10) returning id`, [A]);
await expectError('un ingrediente debe ser inventariable', `insert into recipe_lines (organization_id, product_id, ingredient_id, quantity) values ($1,$2,$3,1)`, [A, BARRIL, CANA], /inventariable/);
await q(`insert into recipe_lines (organization_id, product_id, ingredient_id, quantity) values ($1,$2,$3,0.2)`, [A, CANA, BARRIL]);

await as(U3, [A]);
const [{ id: TAB }] = await q(`insert into pos_tabs (organization_id, table_id, terminal_id) values ($1,$2,$3) returning id`, [A, MESA, TERM]);
await expectError('una mesa no tiene dos cuentas abiertas', `insert into pos_tabs (organization_id, table_id, terminal_id) values ($1,$2,$3)`, [A, MESA, TERM], /pos_tabs_one_open_per_table|23505/);
const TL1 = '44444444-4444-4444-4444-444444444444';
await q(`insert into pos_tab_lines (id, organization_id, tab_id, item_id, description, quantity, unit_price, tax_rate, sent_at) values ($1,$2,$3,$4,'Caña',3,2,10,now())`, [TL1, A, TAB, CANA]);
await expectError('la camarera no aplica descuentos', `update pos_tab_lines set discount_pct = 50 where id=$1`, [TL1], /encargado/);
await expectError('la camarera no quita lo enviado a cocina', `delete from pos_tab_lines where id=$1`, [TL1], /encargado/);
await expectError('la camarera no cambia el precio', `update pos_tab_lines set unit_price = 0 where id=$1`, [TL1], /no se modifican/);
await expectError('la camarera no anula una cuenta con consumiciones', `update pos_tabs set status='cancelled', closed_at=now() where id=$1`, [TAB], /encargado/);
await expectError('la camarera no abre la caja', `insert into cash_sessions (organization_id, terminal_id, opening_float) values ($1,$2,100)`, [A, TERM], /row-level security/);

await as(U1, [A]);
await q(`update pos_tab_lines set discount_pct = 50 where id=$1`, [TL1]);
ok('el encargado aplica descuentos', (await q(`select discount_pct::int d from pos_tab_lines where id=$1`, [TL1]))[0].d === 50);
const [{ id: INV }] = await q(`insert into invoices (organization_id, direction, party_id, invoice_type, due_date) values ($1,'issued',null,'F2',current_date) returning id`, [A]);
await q(`insert into invoice_lines (organization_id, invoice_id, line_no, item_id, description, quantity, unit_price, tax_rate) values ($1,$2,1,$3,'Caña',3,1,10)`, [A, INV, CANA]);
const [{ total: TOT }] = await q(`select total::text from app.issue_invoice($1,$2,current_date)`, [INV, TS]);
await q(`insert into stock_movements (organization_id, warehouse_id, item_id, movement_type, quantity, unit_cost, source_type, source_id) values ($1,$2,$3,'receipt',10,2,'goods_receipt',gen_random_uuid())`, [A, W, BARRIL]);
const [{ id: CS }] = await q(`insert into cash_sessions (organization_id, terminal_id, opening_float) values ($1,$2,100) returning id`, [A, TERM]);
await expectError('una sola caja abierta por terminal', `insert into cash_sessions (organization_id, terminal_id, opening_float) values ($1,$2,50)`, [A, TERM], /cash_sessions_one_open|23505/);
await as(U3, [A]);
await q(`insert into invoice_payments (organization_id, invoice_id, amount, method, cash_session_id) values ($1,$2,$3,'cash',$4)`, [A, INV, TOT, CS]);
await q(`update pos_tabs set status='paid', invoice_id=$2, cash_session_id=$3, closed_at=now() where id=$1`, [TAB, INV, CS]);
await expectError('una cuenta cobrada no se toca', `update pos_tabs set guests = 9 where id=$1`, [TAB], /cerrada/);
await as(U1, [A]);
await q(`insert into cash_movements (organization_id, cash_session_id, kind, amount, reason) values ($1,$2,'withdrawal',20,'Proveedor')`, [A, CS]);
await expectError('el cierre no se escribe a mano', `update cash_sessions set status='closed' where id=$1`, [CS], /permission denied/);
const [closed] = await q(`select expected_cash::text, difference::text from app.close_cash_session($1, 113.30, '{}'::jsonb, null)`, [CS]);
ok('el cierre calcula lo esperado: fondo + efectivo − retiradas', closed.expected_cash === (100 + Number(TOT) - 20).toFixed(2), `(${closed.expected_cash})`);
ok('y la diferencia con lo contado', closed.difference === (113.3 - (100 + Number(TOT) - 20)).toFixed(2), `(${closed.difference})`);
await db.exec('reset role');
await expectError('una caja cerrada es inmutable', `update cash_sessions set notes='x' where id=$1`, [CS], /inmutable/);
await expectError('no se cobra en una caja cerrada', `insert into invoice_payments (organization_id, invoice_id, amount, method, cash_session_id) values ($1,$2,1,'cash',$3)`, [A, INV, CS], /cerrada/);

await as(U1, [A]);
const [{ id: SINSTOCK }] = await q(`insert into inventory_items (organization_id, sku, name) values ($1,'SIN','Sin stock') returning id`, [A]);
await expectError('sin el ajuste no se vende sin existencias', `insert into stock_movements (organization_id, warehouse_id, item_id, movement_type, quantity) values ($1,$2,$3,'sale',-1)`, [A, W, SINSTOCK], /stock_levels_on_hand_non_negative|23514/);
await q(`update organizations set settings = settings || '{"allow_negative_stock": true}' where id=$1`, [A]);
await q(`insert into stock_movements (organization_id, warehouse_id, item_id, movement_type, quantity) values ($1,$2,$3,'sale',-2)`, [A, W, SINSTOCK]);
ok('con stock negativo permitido se vende igual', (await q(`select on_hand::int n from stock_levels where item_id=$1`, [SINSTOCK]))[0].n === -2);
await q(`insert into stock_movements (organization_id, warehouse_id, item_id, movement_type, quantity, unit_cost, source_type, source_id) values ($1,$2,$3,'receipt',5,3,'goods_receipt',gen_random_uuid())`, [A, W, SINSTOCK]);
ok('la entrada posterior repone y fija el coste', (await q(`select on_hand::int n, avg_unit_cost::numeric(9,2)::text c from stock_levels where item_id=$1`, [SINSTOCK]))[0].c === '3.00');
await q(`update organizations set settings = settings - 'allow_negative_stock' where id=$1`, [A]);

console.log('\nFormato de compra');
await as(U1, [A]);
const [{ id: AGUA }] = await q(`insert into inventory_items (organization_id, sku, name, unit_of_measure) values ($1,'AGUA','Agua','pack') returning id`, [A]);
await q(`insert into stock_movements (organization_id, warehouse_id, item_id, movement_type, quantity, unit_cost, source_type, source_id) values ($1,$2,$3,'receipt',4,4.80,'goods_receipt',gen_random_uuid())`, [A, W, AGUA]);
await q(`update stock_levels set min_quantity = 1 where item_id = $1`, [AGUA]);
await q(`insert into recipe_lines (organization_id, product_id, ingredient_id, quantity) values ($1,$2,$3,0.0417)`, [A, CANA, AGUA]);
await expectError('con movimientos, la unidad no se cambia a mano', `update inventory_items set unit_of_measure = 'ud' where id=$1`, [AGUA], /Cambiar unidad de stock/);
await q(`select app.convert_stock_unit($1, 'ud', 24)`, [AGUA]);
const [conv] = await q(`select sl.on_hand::int n, sl.avg_unit_cost::numeric(9,2)::text c, sl.min_quantity::int m, i.unit_of_measure u, i.purchase_unit pu, i.purchase_pack_size::int ps
  from stock_levels sl join inventory_items i on i.id = sl.item_id where sl.item_id=$1`, [AGUA]);
ok('convertir 4 packs da 96 botellas', conv.n === 96, `(${conv.n})`);
ok('el coste se reparte entre las botellas', conv.c === '0.20', `(${conv.c})`);
ok('el mínimo también se convierte', conv.m === 24);
ok('el pack queda como formato de compra', conv.u === 'ud' && conv.pu === 'pack' && conv.ps === 24);
ok('los escandallos pasan a botellas', (await q(`select quantity::numeric(9,4)::text x from recipe_lines where ingredient_id=$1`, [AGUA]))[0].x === '1.0008');
const [{ id: GRA }] = await q(`insert into goods_receipts (organization_id, warehouse_id, supplier_id, supplier_delivery_note) values ($1,$2,$3,'PACKS-1') returning id`, [A, W, S]);
const [{ pack_size: PS }] = await q(`insert into goods_receipt_lines (organization_id, receipt_id, line_no, item_id, quantity, unit_cost) values ($1,$2,1,$3,2,4.80) returning pack_size::int`, [A, GRA, AGUA]);
ok('la línea de albarán congela las botellas por pack', PS === 24);

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
