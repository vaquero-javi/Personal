import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Módulos contratados por sociedad (migración 0032): que los roles operan por
// debajo de lo contratado, que nadie ve lo de otra sociedad y que solo el
// equipo de Omnia cambia los módulos.
//   npm run db:test
const dir = fileURLToPath(new URL('../migrations', import.meta.url));
const db = new PGlite();
for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql') && !f.includes('_supabase')).sort()) {
  try { await db.exec(readFileSync(`${dir}/${f}`, 'utf8')); }
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
const features = async () => (await q('select feature_code from app.entitled_features() order by 1')).map((r) => r.feature_code);

const OWNER_A = '11111111-1111-1111-1111-111111111111';
const OWNER_B = '22222222-2222-2222-2222-222222222222';
const EMP_A = '33333333-3333-3333-3333-333333333333';
const STAFF = '44444444-4444-4444-4444-444444444444'; // equipo de Omnia
await q(`insert into users (id, email) values ($1,'a@a.es'), ($2,'b@b.es'), ($3,'e@a.es'), ($4,'staff@omnia.app')`, [OWNER_A, OWNER_B, EMP_A, STAFF]);
await q(`insert into platform_admins (user_id) values ($1)`, [STAFF]);

await as(OWNER_A, []);
const [{ id: A }] = await q(`select app.create_organization('acme', 'Acme SL', 'B11111111') as id`);
await as(OWNER_B, []);
const [{ id: B }] = await q(`select app.create_organization('beta', 'Beta SL', 'B22222222') as id`);
await db.exec('reset role');
const [{ id: EMP_ROLE }] = await q(`select id from roles where organization_id=$1 and key='employee'`, [A]);
await q(`insert into user_organizations (user_id, organization_id, role_id) values ($1,$2,$3)`, [EMP_A, A, EMP_ROLE]);

console.log('\nCatálogo y plan de entrada');
await as(OWNER_A, [A]);
let f = await features();
ok('la base siempre está', ['base', 'inventory', 'invoicing', 'hr', 'tasks', 'incidents'].every((c) => f.includes(c)));
ok('el plan de entrada trae Ventas y Compras', f.includes('sales') && f.includes('purchasing'));
ok('…pero no TPV, Estadísticas ni Nóminas', !f.includes('sales.pos') && !f.includes('stats') && !f.includes('hr.payroll'), JSON.stringify(f));
ok('el alta queda en el historial', (await (async () => { await db.exec('reset role'); return q(`select 1 from organization_feature_events where organization_id=$1 and source='signup'`, [A]); })()).length > 0);
await expectError('un módulo base no cuelga de uno de pago',
  `insert into features (code, parent_code, name, is_core) values ('sales.free', 'sales', 'x', true)`, [], /no puede depender/);
await expectError('la jerarquía se lee en el código', `insert into features (code, parent_code, name) values ('otro.x', 'sales', 'x')`, [], /check constraint|23514/);

console.log('\nLos roles operan por debajo de lo contratado');
await as(OWNER_A, [A]);
ok('la propietaria (rol *) no consigue stats.read sin el módulo', !(await q(`select app.has_permission($1, 'stats.read') ok`, [A]))[0].ok);
ok('…ni pos.manage', !(await q(`select app.has_permission($1, 'pos.manage') ok`, [A]))[0].ok);
ok('…pero sí lo no tapado (members.manage, inventory.post)', (await q(`select app.has_permission($1, 'members.manage') and app.has_permission($1, 'inventory.post') ok`, [A]))[0].ok);
const [{ id: WH }] = await q(`insert into warehouses (organization_id, code, name) values ($1,'C','Central') returning id`, [A]);
await expectError('sin TPV, la propietaria no crea mesas', `insert into pos_tables (organization_id, name) values ($1,'1')`, [A], /row-level security|42501/);
const [{ id: PARTY }] = await q(`insert into parties (organization_id, is_customer, legal_name) values ($1,true,'Cliente') returning id`, [A]);
const [{ id: SO }] = await q(`insert into sales_orders (organization_id, customer_id, warehouse_id) values ($1,$2,$3) returning id`, [A, PARTY, WH]);
ok('con Ventas (plan de entrada) sí crea pedidos', !!SO);

console.log('\nAcceso «a lo propio» también tapado (políticas restrictivas)');
await db.exec('reset role');
await q(`insert into payslips (organization_id, user_id, period, file_name, content_type, byte_size, content, created_by)
         values ($1,$2,'2026-10-01','n.pdf','application/pdf',4,'\\x25504446'::bytea,$3)`, [A, EMP_A, OWNER_A]);
const payslipCount = Number((await q(`select count(*)::int n from payslips where organization_id=$1`, [A]))[0].n);
await as(EMP_A, [A]);
ok('hay una nómina suya en la tabla', payslipCount === 1);
ok('sin Nóminas, el empleado no ve su propia nómina', (await q('select 1 from payslips')).length === 0);

console.log('\nAislamiento entre sociedades (IDOR)');
await as(OWNER_A, [B]);
ok('pidiendo Beta sin ser miembro, entitled_features() no devuelve nada', (await features()).length === 0);
await expectError('org_entitled_features(uuid) no se puede llamar desde la aplicación', `select app.org_entitled_features($1)`, [B], /permission denied/);
await expectError('nadie escribe organization_features directamente', `insert into organization_features (organization_id, feature_code, is_active, activated_at) values ($1,'stats',true,now())`, [A], /permission denied/);
await as(OWNER_A, [A]);
await expectError('…ni siquiera en su sociedad', `update organization_features set is_active=true where organization_id=$1`, [A], /permission denied/);
ok('la sociedad ve su asignación, no la de otras', (await q('select distinct organization_id from organization_features')).every((r) => r.organization_id === A));
await expectError('platform_admins no es legible', `select * from platform_admins`, [], /permission denied/);
ok('my_memberships() trae los módulos de cada sociedad', (await q(`select features from app.my_memberships()`))[0].features.includes('sales'));

console.log('\nPanel de plataforma');
await as(OWNER_A, [A]);
await expectError('una propietaria no es super-admin: no lista sociedades', `select * from app.admin_organizations()`, [], /equipo de Omnia|42501/);
await expectError('…ni se activa módulos', `select app.admin_set_feature($1, 'stats', true)`, [A], /equipo de Omnia|42501/);
await as(STAFF, []);
const orgs = await q(`select id, active_features from app.admin_organizations()`);
ok('el equipo de Omnia ve todas las sociedades', orgs.length === 2);
await q(`select app.admin_set_feature($1, 'stats', true)`, [A]);
await expectError('los módulos base no se tocan', `select app.admin_set_feature($1, 'inventory', false)`, [A], /base|OM002/);
await expectError('módulo inexistente', `select app.admin_set_feature($1, 'nope', true)`, [A], /desconocido|P0002/);
await expectError('sociedad inexistente', `select app.admin_set_feature('00000000-0000-4000-8000-000000000000', 'stats', true)`, [], /no encontrada|P0002/);
await expectError('caducidad en el pasado', `select app.admin_set_feature($1, 'stats', true, now() - interval '1 day')`, [A], /pasado|23514/);
ok('el super-admin no ve datos de la sociedad', (await q('select 1 from warehouses')).length === 0);
await as(OWNER_A, [A]);
ok('activar Estadísticas tiene efecto inmediato en la RLS', (await q(`select app.has_permission($1, 'stats.read') ok`, [A]))[0].ok);

console.log('\nJerarquía y caducidad');
await as(STAFF, []);
await q(`select app.admin_set_feature($1, 'sales.pos.staff_cards', true)`, [A]);
await as(OWNER_A, [A]);
f = await features();
ok('un submódulo sin su padre no es efectivo', !f.includes('sales.pos.staff_cards') && !f.includes('sales.pos'));
await as(STAFF, []);
await q(`select app.admin_set_feature($1, 'sales.pos', true)`, [A]);
await as(OWNER_A, [A]);
ok('con el padre activo, el hijo pasa a ser efectivo', (await features()).includes('sales.pos.staff_cards'));
await q(`insert into pos_tables (organization_id, name) values ($1,'1')`, [A]);
ok('y la propietaria ya crea mesas', (await q('select 1 from pos_tables')).length === 1);
await as(STAFF, []);
await q(`select app.admin_set_feature($1, 'sales', false)`, [A]);
await as(OWNER_A, [A]);
f = await features();
ok('quitar Ventas apaga TPV y Tarjetas en cascada', !f.includes('sales') && !f.includes('sales.pos') && !f.includes('sales.pos.staff_cards'));
ok('…y las mesas ya no se ven', (await q('select 1 from pos_tables')).length === 0);
ok('…ni los pedidos', (await q('select 1 from sales_orders')).length === 0);
await as(STAFF, []);
await q(`select app.admin_set_feature($1, 'sales', true, now() + interval '1 hour')`, [A]);
await db.exec('reset role');
await q(`update organization_features set activated_at = now() - interval '2 hours', expires_at = now() - interval '1 second' where organization_id=$1 and feature_code='sales'`, [A]);
await as(OWNER_A, [A]);
ok('un módulo caducado deja de ser efectivo sin que nadie haga nada', !(await features()).includes('sales'));
const histRows = await (async () => { await db.exec('reset role'); return q(`select count(*)::int n from organization_feature_events where organization_id=$1 and source='platform_admin'`, [A]); })();
ok('cada cambio del panel queda en el historial', histRows[0].n >= 5, `(${histRows[0].n})`);
await expectError('el historial es inmutable', `delete from organization_feature_events`, [], /OM001|inmutable/);

console.log('\nSolicitudes de activación');
await as(EMP_A, [A]);
await expectError('un empleado no puede pedir módulos', `select app.request_feature('hr.payroll')`, [], /gestiona|42501/);
await as(OWNER_A, [A]);
const [{ id: R1 }] = await q(`select app.request_feature('hr.payroll', 'Para 12 personas') as id`);
const [{ id: R2 }] = await q(`select app.request_feature('hr.payroll') as id`);
ok('pedir dos veces deja una sola solicitud pendiente', R1 === R2);
await expectError('no se pide lo que ya está activo', `select app.request_feature('stats')`, [], /ya está activo|OM002/);
await expectError('no se piden módulos base', `select app.request_feature('inventory')`, [], /desconocido|P0002/);
await as(OWNER_A, [A, B]);
await expectError('pedir con dos sociedades a la vez no vale', `select app.request_feature('hr.payroll')`, [], /gestiona|42501/);
await as(OWNER_B, [B]);
ok('otra sociedad no ve la solicitud', (await q('select 1 from feature_requests')).length === 0);
await as(STAFF, []);
ok('el panel la muestra con su mensaje', (await q(`select pending_request_message m from app.admin_organization_features($1) where code='hr.payroll'`, [A]))[0].m === 'Para 12 personas');
await q(`select app.admin_set_feature($1, 'hr.payroll', true)`, [A]);
await db.exec('reset role');
ok('activar el módulo resuelve la solicitud', (await q(`select resolved_by from feature_requests where id=$1`, [R1]))[0].resolved_by === STAFF);
await as(EMP_A, [A]);
ok('con Nóminas activo, el empleado ya ve su nómina', (await q('select 1 from payslips')).length === 1);

console.log('\nAcceso propio del panel del equipo (0033)');
const HASH = 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
await db.exec('reset role');
await q(`select app.set_platform_admin_password('staff@omnia.app', $1)`, [HASH]);
const [cred] = await q(`select user_id, password_hash, session_version from app.platform_admin_credentials('STAFF@omnia.app ')`);
ok('las credenciales se buscan por email sin distinguir mayúsculas', cred?.user_id === STAFF && cred.password_hash === HASH);
ok('fijar la contraseña sube la versión de sesión', cred.session_version === 2);
ok('la sesión con la versión vigente vale', (await q(`select app.platform_admin_session_valid($1, 2) ok`, [STAFF]))[0].ok);
ok('…y con la anterior, no', !(await q(`select app.platform_admin_session_valid($1, 1) ok`, [STAFF]))[0].ok);
ok('alguien de una sociedad no tiene credenciales del panel', (await q(`select 1 from app.platform_admin_credentials('a@a.es')`)).length === 0);
for (let i = 0; i < 5; i++) await q(`select app.platform_admin_login_result($1, false)`, [STAFF]);
ok('cinco fallos seguidos bloquean la cuenta', (await q(`select locked_until > now() ok from platform_admins where user_id=$1`, [STAFF]))[0].ok);
await q(`select app.platform_admin_login_result($1, true)`, [STAFF]);
ok('un acceso correcto limpia el bloqueo', (await q(`select locked_until is null and failed_attempts = 0 ok from platform_admins where user_id=$1`, [STAFF]))[0].ok);
await expectError('hash con formato raro', `select app.set_platform_admin_password('staff@omnia.app', 'texto-plano')`, [], /Hash no válido/);
await expectError('contraseña para alguien que no es del equipo', `select app.set_platform_admin_password('a@a.es', $1)`, [HASH], /No hay nadie del equipo/);
await as(OWNER_A, [A]);
await expectError('la aplicación de las sociedades no lee hashes', `select * from app.platform_admin_credentials('staff@omnia.app')`, [], /permission denied/);
await expectError('…ni marca accesos', `select app.platform_admin_login_result($1, true)`, [STAFF], /permission denied/);
await expectError('…ni cambia contraseñas', `select app.set_platform_admin_password('staff@omnia.app', $1)`, [HASH], /permission denied/);
await as(STAFF, []);
await expectError('ni siquiera el propio equipo desde app_user', `select * from app.platform_admin_credentials('staff@omnia.app')`, [], /permission denied/);
await db.exec('reset role');
ok('el rol omnia_admin existe y puede leer credenciales', (await q(`select has_function_privilege('omnia_admin', 'app.platform_admin_credentials(text)', 'execute') ok`))[0].ok);
ok('app_user no', !(await q(`select has_function_privilege('app_user', 'app.platform_admin_credentials(text)', 'execute') ok`))[0].ok);

console.log(`\n${pass} correctas, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
