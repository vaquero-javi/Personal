// Pone o cambia la contraseña de alguien del equipo de Omnia (panel apps/admin).
// Cierra sus sesiones abiertas.
//
//   npm run admin:password -- <email>                 pide la contraseña y muestra el SQL para Supabase
//   npm run admin:password -- <email> --local         la aplica en la base local (npm run db:dev)
//
// La persona debe existir en public.users y en public.platform_admins.
import { randomBytes, scryptSync } from 'node:crypto';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';

const [email, flag] = process.argv.slice(2);
if (!email || !email.includes('@')) {
  console.error('Uso: npm run admin:password -- <email> [--local]');
  process.exit(1);
}

async function askHidden(question) {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  rl._writeToOutput = (s) => rl.output.write(s.startsWith(question) ? s : '');
  const answer = await rl.question(question);
  rl.close();
  stdout.write('\n');
  return answer;
}

const password = await askHidden('Nueva contraseña (mínimo 12 caracteres): ');
if (password.length < 12) {
  console.error('Demasiado corta: usa al menos 12 caracteres.');
  process.exit(1);
}
if ((await askHidden('Repítela: ')) !== password) {
  console.error('No coinciden.');
  process.exit(1);
}

const salt = randomBytes(16);
const hash = `scrypt$${salt.toString('base64')}$${scryptSync(password, salt, 32).toString('base64')}`;

if (flag === '--local') {
  const { default: postgres } = await import('postgres');
  const sql = postgres(process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/postgres', { max: 1 });
  try {
    await sql`select app.set_platform_admin_password(${email}, ${hash})`;
    console.log(`Contraseña cambiada para ${email}. Sus sesiones abiertas se han cerrado.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
} else {
  console.log('\nPega esto en Supabase → SQL Editor y pulsa Run:\n');
  console.log(`select app.set_platform_admin_password('${email.replace(/'/g, "''")}', '${hash}');\n`);
}
