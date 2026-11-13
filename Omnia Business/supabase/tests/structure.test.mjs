import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Holding → Sociedades → Empresas (migración 0034).
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

const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const EMP = '33333333-3333-3333-3333-333333333333';
await q(`insert into users (id, email) values ($1,'a@a.es'), ($2,'b@b.es'), ($3,'e@a.es')`, [OWNER, OTHER, EMP]);

console.log('\nHolding y sociedades');
await as(OWNER, []);
const [{ id: H }] = await q(`select app.create_holding('grupo', 'Grupo SL', 'B10000000') as id`);
ok('el holding se crea con tipo holding', (await (async () => { await db.exec('reset role'); return q('select kind from organizations where id=$1', [H]); })())[0].kind === 'holding');
await as(OWNER, []);
const [{ id: S1 }] = await q(`select app.create_organization('soc-uno', 'Uno SL', 'B10000001', $1) as id`, [H]);
ok('una sociedad nace dentro del holding', (await (async () => { await db.exec('reset role'); return q('select parent_id from organizations where id=$1', [S1]); })())[0].parent_id === H);
await as(OWNER, []);
const [{ id: S2 }] = await q(`select app.create_organization('soc-dos', 'Dos SL', 'B10000002') as id`);
await q(`select app.set_organization_parent($1, $2)`, [S2, H]);
ok('una sociedad existente se mete en el holding', (await (async () => { await db.exec('reset role'); return q('select parent_id from organizations where id=$1', [S2]); })())[0].parent_id === H);
await as(OWNER, []);
await expectError('una sociedad no cuelga de otra sociedad', `select app.set_organization_parent($1, $2)`, [S2, S1], /solo puede colgar de un holding/);
await expectError('un holding no cuelga de nada', `select app.set_organization_parent($1, $2)`, [H, H], /holding no puede depender/);
await q(`select app.set_organization_parent($1, null)`, [S2]);
ok('y se puede sacar', (await (async () => { await db.exec('reset role'); return q('select parent_id from organizations where id=$1', [S2]); })())[0].parent_id === null);

await as(OTHER, []);
const [{ id: X }] = await q(`select app.create_organization('ajena', 'Ajena SL', 'B20000000') as id`);
await expectError('nadie mete su sociedad en un holding que no gestiona', `select app.set_organization_parent($1, $2)`, [X, H], /holding|42501/);
await expectError('ni crea sociedades dentro de él', `select app.create_organization('intrusa', 'Intrusa SL', 'B20000001', $1)`, [H], /matriz|42501/);
await expectError('ni saca sociedades ajenas', `select app.set_organization_parent($1, null)`, [S1], /gestionar|42501/);

await db.exec('reset role');
const [{ id: EMPROLE }] = await q(`select id from roles where organization_id=$1 and key='employee'`, [S1]);
await q(`insert into user_organizations (user_id, organization_id, role_id) values ($1,$2,$3)`, [EMP, S1, EMPROLE]);
await as(EMP, []);
await expectError('un empleado no mueve su sociedad de grupo', `select app.set_organization_parent($1, null)`, [S1], /gestionar|42501/);
await db.exec('reset role');
await expectError('un holding con sociedades no se convierte en sociedad', `update organizations set kind='company' where id=$1`, [H], /tiene sociedades|OM002/);
await as(OWNER, []);
ok('my_memberships() trae el tipo', (await q(`select kind from app.my_memberships() where organization_id=$1`, [H]))[0].kind === 'holding');

console.log('\nEmpresas (negocios o locales)');
await as(OWNER, [S1]);
const [{ id: E1 }] = await q(`insert into establishments (organization_id, name) values ($1,'Bar Centro') returning id`, [S1]);
await expectError('nombres únicos dentro de la sociedad (sin mayúsculas)', `insert into establishments (organization_id, name) values ($1,'bar centro')`, [S1], /duplicate|23505/);
await as(OWNER, [H]);
await expectError('un holding no tiene empresas propias', `insert into establishments (organization_id, name) values ($1,'Sede')`, [H], /dentro de una sociedad/);
const [{ id: W }] = await (async () => { await as(OWNER, [S1]); return q(`insert into warehouses (organization_id, code, name, establishment_id) values ($1,'B','Barra',$2) returning id`, [S1, E1]); })();
ok('un almacén pertenece a una empresa de su sociedad', !!W);
await as(OWNER, [S2]);
const [{ id: W2 }] = await q(`insert into warehouses (organization_id, code, name) values ($1,'C','Central') returning id`, [S2]);
await db.exec('reset role');
await expectError('FK compuesta: un almacén no usa una empresa de otra sociedad (ni como superusuario)', `update warehouses set establishment_id=$2 where id=$1`, [W2, E1], /foreign key|23503/);
await as(EMP, [S1]);
ok('todo miembro ve las empresas de su sociedad', (await q('select 1 from establishments')).length === 1);
const upd = await db.query(`update establishments set name='X' where id=$1`, [E1]);
ok('pero un empleado no las cambia', upd.affectedRows === 0);
await expectError('ni crea', `insert into establishments (organization_id, name) values ($1,'Otra')`, [S1], /row-level security/);
await as(OTHER, [S1]);
ok('otra sociedad no las ve', (await q('select 1 from establishments')).length === 0);
await as(OWNER, [S1]);
await q(`delete from establishments where id=$1`, [E1]);
ok('borrar la empresa deja el almacén en la sociedad, sin empresa', (await q(`select establishment_id from warehouses where id=$1`, [W]))[0]?.establishment_id === null);

console.log('\nPersonal, turnos y fichajes por empresa (0035)');
await as(OWNER, [S1]);
const [{ id: BAR }] = await q(`insert into establishments (organization_id, name) values ($1,'Bar') returning id`, [S1]);
const [{ id: CAFE }] = await q(`insert into establishments (organization_id, name) values ($1,'Cafetería') returning id`, [S1]);
await q(`insert into establishment_members (organization_id, establishment_id, user_id) values ($1,$2,$3)`, [S1, BAR, EMP]);
await as(EMP, [S1]);
await expectError('un empleado no se asigna locales', `insert into establishment_members (organization_id, establishment_id, user_id) values ($1,$2,$3)`, [S1, CAFE, EMP], /row-level security/);
await expectError('nadie de fuera de la sociedad entra en un local (FK compuesta)', `insert into establishment_members (organization_id, establishment_id, user_id) values ($1,$2,$3)`, [S1, BAR, OTHER], /row-level security|foreign key/);
await q(`insert into time_entries (organization_id, user_id, entry_type) values ($1,$2,'clock_in')`, [S1, EMP]);
ok('con un solo local, el fichaje se guarda en él sin elegir', (await q(`select establishment_id from time_entries where user_id=$1 order by occurred_at desc limit 1`, [EMP]))[0].establishment_id === BAR);
await expectError('no se ficha en un local en el que no trabajas', `insert into time_entries (organization_id, user_id, entry_type, establishment_id) values ($1,$2,'clock_out',$3)`, [S1, EMP, CAFE], /No trabajas en ese local/);
await as(OWNER, [S1]);
await q(`insert into establishment_members (organization_id, establishment_id, user_id) values ($1,$2,$3)`, [S1, CAFE, EMP]);
await as(EMP, [S1]);
await q(`insert into time_entries (organization_id, user_id, entry_type) values ($1,$2,'clock_out')`, [S1, EMP]);
ok('con dos locales y sin elegir, queda sin local (la app obliga a elegir)', (await q(`select establishment_id from time_entries where user_id=$1 and entry_type='clock_out'`, [EMP]))[0].establishment_id === null);
await as(OWNER, [S1]);
await expectError('una empresa con fichajes no se borra (registro legal)', `delete from establishments where id=$1`, [BAR], /foreign key|23503/);
const [{ id: SH }] = await q(`insert into shifts (organization_id, user_id, starts_at, ends_at, establishment_id) values ($1,$2, now(), now() + interval '6 hours', $3) returning id`, [S1, EMP, CAFE]);
ok('un turno lleva su local', !!SH);
await q(`delete from establishments where id=$1`, [CAFE]).catch(() => null);
ok('…y si se borra el local (sin fichajes), el turno se queda sin local', (await q(`select establishment_id from shifts where id=$1`, [SH]))[0]?.establishment_id === null);
ok('…y la persona sale de ese local', (await q(`select 1 from establishment_members where establishment_id=$1`, [CAFE])).length === 0);

console.log('\nCifras por empresa');
await db.exec('reset role');
await q(`insert into organization_features (organization_id, feature_code, is_active, activated_at) values ($1,'stats',true,now()) on conflict (organization_id, feature_code) do update set is_active = true`, [S1]);
await as(OWNER, [S1]);
const rows = await q(`select * from app.stats_establishments($1, current_date - 30, current_date)`, [S1]);
ok('una fila por local, con su personal y sus horas', rows.some((r) => r.establishment_id === BAR && r.staff === 1), JSON.stringify(rows.map((r) => [r.name, r.staff, r.shift_hours])));
await as(EMP, [S1]);
await expectError('sin permiso de estadísticas no hay cifras', `select * from app.stats_establishments($1, current_date - 30, current_date)`, [S1], /permiso|42501/);
await as(OTHER, [S1]);
await expectError('ni de otra sociedad', `select * from app.stats_establishments($1, current_date - 30, current_date)`, [S1], /permiso|42501/);

console.log('\nMensajes (0037)');
const MATE = '55555555-5555-5555-5555-555555555555';
await db.exec('reset role');
await q(`insert into users (id, email) values ($1,'mate@a.es')`, [MATE]);
await q(`insert into user_organizations (user_id, organization_id, role_id) values ($1,$2,$3)`, [MATE, S1, EMPROLE]);
await q(`insert into organization_features (organization_id, feature_code, is_active, activated_at) values ($1,'messages',true,now()) on conflict (organization_id, feature_code) do update set is_active = true`, [S1]);
await as(EMP, [S1]);
const [{ id: TH }] = await q(`select app.message_send('Hola', 'Primer mensaje', $1::uuid[]) as id`, [[MATE]]);
ok('un empleado escribe a un compañero', !!TH);
await as(MATE, [S1]);
ok('el destinatario la ve sin leer', (await q(`select (last_read_at is null) as unread from message_participants where thread_id=$1 and user_id=$2`, [TH, MATE]))[0].unread);
await q(`select app.message_reply($1, 'Respuesta')`, [TH]);
ok('y responde', (await q('select count(*)::int n from messages where thread_id=$1', [TH]))[0].n === 2);
await as(OWNER, [S1]);
ok('la propietaria NO ve conversaciones ajenas', (await q('select 1 from message_threads where id=$1', [TH])).length === 0);
ok('…ni sus mensajes', (await q('select 1 from messages where thread_id=$1', [TH])).length === 0);
await expectError('…ni puede responder en ellas', `select app.message_reply($1, 'Me cuelo')`, [TH], /no encontrada|P0002/);
await as(EMP, [S1]);
await expectError('no se escribe a alguien de otra sociedad', `select app.message_send('X', 'Y', $1::uuid[])`, [[OTHER]], /no pertenece/);
await expectError('ni sin destinatarios', `select app.message_send('X', 'Y', '{}'::uuid[])`, [], /al menos a una persona/);
await expectError('los mensajes no se insertan a mano', `insert into messages (organization_id, thread_id, sender_id, body) values ($1,$2,$3,'x')`, [S1, TH, EMP], /permission denied/);
await expectError('ni se editan', `update messages set body='cambiado' where thread_id=$1`, [TH], /permission denied|OM001/);
await q(`select app.message_set_state($1, null, true, true)`, [TH]);
ok('cada uno archiva y destaca lo suyo', (await q(`select archived_at is not null a, starred s from message_participants where thread_id=$1 and user_id=$2`, [TH, EMP]))[0].s === true);
await as(MATE, [S1]);
await q(`select app.message_reply($1, 'Otra más')`, [TH]);
await as(EMP, [S1]);
ok('una respuesta nueva devuelve la conversación a Recibidos', (await q(`select archived_at from message_participants where thread_id=$1 and user_id=$2`, [TH, EMP]))[0].archived_at === null);
ok('no leídas por sociedad', (await q(`select unread from app.my_unread_messages() where organization_id=$1`, [S1]))[0]?.unread === 1);
await as(EMP, [S2]);
await expectError('pidiendo otra sociedad no se envía nada', `select app.message_send('X', 'Y', $1::uuid[])`, [[MATE]], /no está disponible/);
await db.exec('reset role');
await q(`update organization_features set is_active=false where organization_id=$1 and feature_code='messages'`, [S1]);
await as(MATE, [S1]);
ok('sin el módulo, las conversaciones no se ven', (await q('select 1 from message_threads')).length === 0);
await expectError('ni se escribe', `select app.message_send('X', 'Y', $1::uuid[])`, [[EMP]], /no está disponible/);

console.log('\nTareas pendientes (0038)');
await db.exec('reset role');
// Tareas es Pro (0040): no viene en el alta, se activa para la prueba.
await q(`insert into organization_features (organization_id, feature_code, is_active, activated_at) values ($1,'tasks',true,now()) on conflict (organization_id, feature_code) do update set is_active = true`, [S1]);
await as(OWNER, [S1]);
await q(`insert into tasks (organization_id, title, assignee_user_id) values ($1,'Limpiar cámara',$2), ($1,'Pedir hielo',$2), ($1,'Revisar caja',$2), ($1,'Mía propia',$3)`, [S1, EMP, OWNER]);
await q(`update tasks set status='done' where title='Revisar caja'`);
await as(EMP, []);
ok('cuenta las que te mandan y no has hecho', (await q(`select pending from app.my_pending_tasks() where organization_id=$1`, [S1]))[0]?.pending === 2);
await as(EMP, [S1]);
await q(`update tasks set status='in_progress' where title='Pedir hielo'`);
await as(EMP, []);
ok('empezada sigue contando', (await q(`select pending from app.my_pending_tasks() where organization_id=$1`, [S1]))[0]?.pending === 2);
await as(OWNER, []);
ok('las que te mandas a ti no cuentan', (await q(`select 1 from app.my_pending_tasks() where organization_id=$1`, [S1])).length === 0);

console.log(`\n${pass} correctas, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
