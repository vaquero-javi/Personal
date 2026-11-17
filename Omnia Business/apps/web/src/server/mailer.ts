import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';

// Correo saliente de Omnia por el SMTP de Gmail (omniahold@gmail.com).
// Gmail exige una «contraseña de aplicación» (verificación en dos pasos activada):
//   GMAIL_USER=omniahold@gmail.com
//   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
// Sin ellas (desarrollo), el correo no se envía: se escribe en la consola.

const globalForMail = globalThis as unknown as { omniaMailer?: Transporter };

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Envía el correo. Devuelve false si no hay SMTP configurado (solo se ha mostrado en la consola). */
export async function sendMail(mail: Mail): Promise<boolean> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '');
  if (!user || !pass) {
    console.warn(`[correo sin enviar: faltan GMAIL_USER y GMAIL_APP_PASSWORD]\nPara: ${mail.to}\nAsunto: ${mail.subject}\n\n${mail.text}\n`);
    return false;
  }
  const transport = (globalForMail.omniaMailer ??= nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  }));
  await transport.sendMail({ from: { name: 'Omnia', address: user }, ...mail });
  return true;
}

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Plantilla común: tarjeta blanca con un único botón (estilos en línea, para los clientes de correo). */
function layout({ preheader, title, paragraphs, button, footer }: { preheader: string; title: string; paragraphs: string[]; button: { label: string; url: string }; footer: string }) {
  const p = paragraphs.map((t) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#3a3a3c">${t}</p>`).join('');
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)}</title></head>
<body style="margin:0;padding:0;background:#f2f2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${escape(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f7;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px 28px">
<tr><td>
<p style="margin:0 0 20px;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#8e8e93">Omnia</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;color:#1c1c1e">${escape(title)}</h1>
${p}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="border-radius:10px;background:#0a84ff">
<a href="${escape(button.url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">${escape(button.label)}</a>
</td></tr></table>
<p style="margin:0;font-size:12px;line-height:1.5;color:#8e8e93">${footer}</p>
</td></tr></table>
</td></tr></table>
</body></html>`;
}

interface InviteMailInput {
  to: string;
  firstName: string;
  orgName: string;
  roleName: string;
  invitedBy: string;
  url: string;
}

/** Invitación a una persona sin cuenta: pone su contraseña y entra. */
export function invitationMail({ to, firstName, orgName, roleName, invitedBy, url }: InviteMailInput): Mail {
  const subject = `${invitedBy} te ha dado acceso a ${orgName} en Omnia`;
  return {
    to,
    subject,
    html: layout({
      preheader: `Pon tu contraseña para entrar en ${orgName}.`,
      title: `Hola, ${firstName}`,
      paragraphs: [
        `${escape(invitedBy)} te ha añadido a <strong>${escape(orgName)}</strong> en Omnia con el rol <strong>${escape(roleName)}</strong>.`,
        'Pulsa el botón, elige tu contraseña y entrarás directamente con tus sociedades y permisos.',
      ],
      button: { label: 'Activar mi acceso', url },
      footer: `El enlace es personal y caduca en 24 horas. Si no esperabas este correo, puedes ignorarlo.<br>Si el botón no funciona, copia esta dirección en el navegador:<br><span style="word-break:break-all">${escape(url)}</span>`,
    }),
    text: `Hola, ${firstName}:\n\n${invitedBy} te ha añadido a ${orgName} en Omnia con el rol ${roleName}.\n\nAbre este enlace, elige tu contraseña y entrarás directamente:\n${url}\n\nEl enlace es personal y caduca en 24 horas. Si no esperabas este correo, puedes ignorarlo.`,
  };
}

/** Aviso a quien ya tiene cuenta: tiene una sociedad nueva al entrar. */
export function accessGrantedMail({ to, firstName, orgName, roleName, invitedBy, url }: InviteMailInput): Mail {
  const subject = `${invitedBy} te ha dado acceso a ${orgName} en Omnia`;
  return {
    to,
    subject,
    html: layout({
      preheader: `Ya tienes ${orgName} en Omnia.`,
      title: `Hola, ${firstName}`,
      paragraphs: [
        `${escape(invitedBy)} te ha añadido a <strong>${escape(orgName)}</strong> en Omnia con el rol <strong>${escape(roleName)}</strong>.`,
        'No tienes que hacer nada más: ya la tienes junto a tus otras sociedades, con tu cuenta y tu contraseña de siempre. Pulsa el botón para abrirla.',
      ],
      button: { label: `Abrir ${orgName}`, url },
      footer: 'Si no esperabas este correo, puedes ignorarlo.',
    }),
    text: `Hola, ${firstName}:\n\n${invitedBy} te ha añadido a ${orgName} en Omnia con el rol ${roleName}.\n\nNo tienes que hacer nada más: ya la tienes junto a tus otras sociedades, con tu cuenta de siempre. Ábrela aquí:\n${url}`,
  };
}
