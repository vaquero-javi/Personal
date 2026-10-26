// Flujos de punta a punta contra la app en local, con un Chrome instalado.
//
//   npm run db:reset            (datos recién sembrados: los flujos cambian el estado)
//   npx next dev -p 3100        (en apps/web)
//   npm run e2e -w @omnia/web
//
// Variables: E2E_BASE (http://localhost:3100), CHROME_PATH, E2E_OUT (capturas de fallos).
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const BASE = process.env.E2E_BASE ?? 'http://localhost:3100';
const ORG = '/o/distribuciones-albar';
const LUCIA = '0a000000-0000-4000-8000-000000000001';
const out = process.env.E2E_OUT ?? 'e2e/failures';
mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await browser.setCookie({ name: 'omnia_dev_user', value: LUCIA, domain: 'localhost', path: '/' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const results = [];
const go = (path) => page.goto(BASE + path, { waitUntil: 'networkidle0', timeout: 120000 });
const text = () => page.evaluate(() => document.body.innerText);
const waitText = async (needle, timeout = 30000) => {
  await page.waitForFunction((n) => document.body.innerText.includes(n), { timeout }, needle);
};
const selectByLabel = async (selector, labelText) => {
  await page.evaluate(
    (sel, t) => {
      const el = document.querySelector(sel);
      const opt = [...el.options].find((o) => o.textContent.includes(t));
      if (!opt) throw new Error(`Opción «${t}» no encontrada en ${sel}`);
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(el, opt.value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    selector,
    labelText,
  );
};
const type = async (selector, value) => {
  await page.waitForSelector(selector);
  await page.$eval(
    selector,
    (el, v) => {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    value,
  );
};
const clickButton = async (label) => {
  const handle = await page.waitForFunction(
    (l) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(l) && !b.disabled),
    { timeout: 20000 },
    label,
  );
  await handle.asElement().click();
};

async function step(name, fn) {
  try {
    await fn();
    results.push(`✓ ${name}`);
  } catch (e) {
    results.push(`✗ ${name}: ${String(e.message ?? e).split('\n')[0]}`);
    await page.screenshot({ path: `${out}/fail-${name.replace(/\W+/g, '-')}.png` }).catch(() => {});
  }
}

await step('Nuevo artículo', async () => {
  await go(`${ORG}/almacen/articulos/nuevo`);
  await type('input[name=sku]', `E2E-${Date.now() % 100000}`);
  await type('input[name=name]', 'Tuerca autoblocante M6 (prueba)');
  await clickButton('Crear artículo');
  await page.waitForFunction(() => /\/articulos\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 30000 });
});

await step('Registrar y contabilizar albarán', async () => {
  await go(`${ORG}/almacen/albaranes/nuevo`);
  await selectByLabel('select[name=supplierId]', 'Tornillería Norte');
  await type('input[name=supplierDeliveryNote]', `TN-E2E-${Date.now() % 100000}`);
  await selectByLabel('select[aria-label="Artículo de la línea 1"]', 'Brida metálica');
  await type('input[aria-label="Cantidad de la línea 1"]', '60');
  await type('input[aria-label="Coste unitario de la línea 1"]', '0,22');
  await clickButton('Guardar borrador');
  await page.waitForFunction(() => /\/albaranes\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 30000 });
  await clickButton('Contabilizar entrada');
  await waitText('Albarán contabilizado');
});

await step('Registrar albarán desde una foto', async () => {
  // Requiere la app arrancada con OMNIA_SCAN_FIXTURE (lectura grabada; ver README).
  await go(`${ORG}/almacen/albaranes/nuevo`);
  await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].find((b) => b.textContent.includes('Escanear')).click());
  const input = await page.waitForSelector('input[type=file][capture]');
  await input.uploadFile(fileURLToPath(new URL('./fixtures/albaran-foto.png', import.meta.url)));
  await clickButton('Leer albarán');
  await waitText('Datos leídos de la foto', 60000);
  const supplier = await page.$eval('select[name=supplierId]', (el) => el.selectedOptions[0]?.textContent);
  if (supplier !== 'Tornillería Norte S.A.') throw new Error(`Proveedor leído: ${supplier}`);
  // La línea sin artículo no se pierde: bloquea el guardado hasta elegirlo.
  await clickButton('Guardar borrador');
  await waitText('Línea 3: elige el artículo');
  await selectByLabel('select[aria-label="Artículo de la línea 3"]', 'Brida metálica');
  await clickButton('Guardar borrador');
  await page.waitForFunction(() => /\/albaranes\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 30000 });
  await waitText('TN-AL-2026-7781');
  // La foto escaneada queda guardada con el albarán.
  await waitText('Albarán en papel');
  const photo = await page.evaluate(async () => {
    const res = await fetch(`${location.pathname}/foto`);
    return { status: res.status, type: res.headers.get('content-type'), size: (await res.arrayBuffer()).byteLength };
  });
  if (photo.status !== 200 || photo.type !== 'image/png' || photo.size < 1000) throw new Error(`Foto del albarán: ${JSON.stringify(photo)}`);
});

await step('Ajuste de stock', async () => {
  await go(`${ORG}/almacen/movimientos`);
  await selectByLabel('select[name=itemId]', 'Cinta métrica');
  await type('input[name=quantity]', '-1');
  await type('input[name=note]', 'Rotura en estantería (prueba)');
  await clickButton('Registrar ajuste');
  await waitText('Ajuste registrado');
});

await step('Cobro en TPV', async () => {
  await go(`${ORG}/ventas/tpv`);
  await page.waitForFunction(() => [...document.querySelectorAll('ul button')].some((b) => !b.disabled), { timeout: 30000 });
  await page.evaluate(() => [...document.querySelectorAll('ul button')].find((b) => !b.disabled).click());
  await clickButton('Cobrar');
  await waitText('Cobrado ·');
});

let invoiceUrl = '';
await step('Crear y emitir factura', async () => {
  await go(`${ORG}/facturacion/nueva`);
  await selectByLabel('select[name=partyId]', 'Reformas Castilla');
  await selectByLabel('select[aria-label="Artículo de la línea 1"]', 'Silicona');
  await type('input[aria-label="Cantidad de la línea 1"]', '12');
  await clickButton('Guardar borrador');
  await page.waitForFunction(() => /\/facturacion\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 30000 });
  invoiceUrl = new URL(page.url()).pathname;
  await clickButton('Emitir factura');
  await waitText('Factura emitida');
});

await step('Emitir factura desde el editor con retención y duplicarla', async () => {
  await go(`${ORG}/facturacion/nueva`);
  await selectByLabel('select[name=partyId]', 'Reformas Castilla');
  await type('input[aria-label="Descripción de la línea 1"]', 'Asesoría técnica (prueba)');
  await type('input[aria-label="Cantidad de la línea 1"]', '10');
  await type('input[aria-label="Precio unitario de la línea 1"]', '100');
  await selectByLabel('select[name=withholdingRate]', '15 %');
  await type('textarea[name=notes]', 'Pedido del cliente 4471');
  // Vista previa en vivo: 1.000 + 210 − 150.
  await waitText('1.060,00');
  await clickButton('Emitir factura');
  await page.waitForFunction(() => /\/facturacion\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 30000 });
  await waitText('Retención IRPF 15 %');
  await waitText('Pedido del cliente 4471');
  const body = await text();
  if (!/A-\d{4}-\d{6}/.test(body) || !body.includes('1.060,00')) throw new Error('La factura no quedó emitida con el total neto');
  const pdf = await page.evaluate(async () => {
    const a = [...document.querySelectorAll('a')].find((x) => x.textContent.includes('Descargar PDF'));
    const res = await fetch(a.href);
    const head = new TextDecoder().decode((await res.arrayBuffer()).slice(0, 5));
    return { type: res.headers.get('content-type'), disposition: res.headers.get('content-disposition'), head };
  });
  if (pdf.type !== 'application/pdf' || pdf.head !== '%PDF-' || !pdf.disposition.startsWith('attachment')) throw new Error(`PDF no válido: ${JSON.stringify(pdf)}`);
  await page.evaluate(() => [...document.querySelectorAll('a')].find((a) => a.textContent.trim() === 'Duplicar').click());
  await page.waitForFunction(() => location.search.includes('desde='), { timeout: 30000 });
  await waitText('Asesoría técnica (prueba)');
  await clickButton('Guardar borrador');
  await page.waitForFunction(() => /\/facturacion\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 30000 });
  await waitText('Borrador de factura');
});

await step('Registrar cobro', async () => {
  await go(invoiceUrl);
  await clickButton('Registrar cobro');
  await waitText('Pago registrado');
});

await step('Recibir pedido de compra', async () => {
  await go(`${ORG}/compras?estado=sent`);
  await page.evaluate(() => document.querySelector('tbody a').click());
  await page.waitForFunction(() => /\/pedidos\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 30000 });
  await page.waitForSelector('input[name=supplierDeliveryNote]');
  await type('input[name=supplierDeliveryNote]', `AL-E2E-${Date.now() % 100000}`);
  await clickButton('Recibir mercancía');
  await page.waitForFunction(() => /\/albaranes\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 30000 });
  await clickButton('Contabilizar entrada');
  await waitText('Albarán contabilizado');
});

await step('Servir y facturar pedido de venta', async () => {
  await go(`${ORG}/ventas?estado=confirmed`);
  await page.evaluate(() => document.querySelector('tbody a').click());
  await page.waitForFunction(() => /\/pedidos\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 30000 });
  await clickButton('Servir pedido');
  await waitText('Pedido servido');
  await go(new URL(page.url()).pathname);
  await clickButton('Facturar pedido');
  await waitText('Pendiente');
  await page.waitForFunction(() => /\/facturacion\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 30000 });
});

await step('Fichar entrada', async () => {
  await go(`${ORG}/rrhh`);
  await clickButton('Fichar entrada');
  await waitText('Entrada registrada');
});

await step('Aprobar ausencia', async () => {
  await go(`${ORG}/rrhh/ausencias`);
  await clickButton('Aprobar');
  await waitText('Solicitud aprobada');
});

await step('Crear turno', async () => {
  await go(`${ORG}/rrhh/turnos`);
  await selectByLabel('select[name=userId]', 'Carmen');
  await page.$eval('input[name=date]', (el) => { const d = new Date(); d.setDate(d.getDate() + 6); el.value = d.toISOString().slice(0, 10); });
  await clickButton('Crear turno');
  await waitText('Turno creado');
});

await step('Subir nómina y verla con la cuenta del empleado', async () => {
  const IVAN = '0a000000-0000-4000-8000-000000000004';
  await go(`${ORG}/rrhh/nominas/personal`);
  await selectByLabel('select[name=userId]', 'ivan@albar.es');
  await type('input[name=netAmount]', '1.418,55');
  const input = await page.waitForSelector('input[name=file]');
  await input.uploadFile(fileURLToPath(new URL('./fixtures/nomina.pdf', import.meta.url)));
  await clickButton('Subir nómina');
  await waitText('Nómina subida');
  // Una nómina de otra persona, para comprobar que Iván no puede abrirla.
  const others = await page.evaluate(() =>
    [...document.querySelectorAll('tbody tr')].filter((tr) => tr.textContent.includes('marta@albar.es')).map((tr) => tr.querySelector('a[href*="/archivo"]').getAttribute('href')),
  );
  if (!others.length) throw new Error('No aparecen las nóminas de Marta');

  await browser.setCookie({ name: 'omnia_dev_user', value: IVAN, domain: 'localhost', path: '/' });
  try {
    await go(`${ORG}/rrhh/nominas`);
    await waitText('Mis nóminas');
    await waitText('ivan@albar.es');
    await waitText('1.418,55');
    if ((await text()).includes('Marta')) throw new Error('Iván ve datos de Marta');
    const own = await page.$eval('a[href*="/archivo"]', (a) => a.getAttribute('href'));
    const check = (href) => page.evaluate(async (h) => { const r = await fetch(h); return { status: r.status, type: r.headers.get('content-type') }; }, href);
    const mine = await check(own);
    if (mine.status !== 200 || mine.type !== 'application/pdf') throw new Error(`Su nómina: ${JSON.stringify(mine)}`);
    const foreign = await check(others[0]);
    if (foreign.status !== 404) throw new Error(`Nómina ajena accesible: ${JSON.stringify(foreign)}`);
    const staff = await page.goto(`${BASE}${ORG}/rrhh/nominas/personal`, { waitUntil: 'networkidle0' });
    if (!new URL(page.url()).pathname.endsWith('/rrhh/nominas')) throw new Error(`Iván entra en Nóminas del personal (${staff.status()})`);
  } finally {
    await browser.setCookie({ name: 'omnia_dev_user', value: LUCIA, domain: 'localhost', path: '/' });
  }
});

await step('Abrir incidencia y comentar', async () => {
  await go(`${ORG}/incidencias/nueva`);
  await type('input[name=title]', 'Prueba E2E: estantería suelta');
  await clickButton('Abrir incidencia');
  await page.waitForFunction(() => /\/incidencias\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 30000 });
  await type('textarea[name=body]', 'Revisado: falta un tornillo de anclaje.');
  await clickButton('Comentar');
  await waitText('falta un tornillo de anclaje');
});

await step('Nuevo cliente', async () => {
  await go(`${ORG}/ventas/clientes/nuevo`);
  await type('input[name=legalName]', 'Cliente de prueba E2E S.L.');
  await clickButton('Crear cliente');
  await page.waitForFunction(() => /\/clientes\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 30000 });
});

await step('Error de validación visible', async () => {
  await go(`${ORG}/almacen/movimientos`);
  await selectByLabel('select[name=itemId]', 'Cinta métrica');
  await type('input[name=quantity]', '-99999');
  await type('input[name=note]', 'Debe fallar');
  await clickButton('Registrar ajuste');
  await waitText('No hay existencias suficientes');
});

console.log(results.join('\n'));
if (errors.length) console.log('ERRORES DE PÁGINA:\n' + [...new Set(errors)].slice(0, 6).join('\n'));
await browser.close();
process.exit(results.some((r) => r.startsWith('✗')) ? 1 : 0);
