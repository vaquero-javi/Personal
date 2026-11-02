import 'server-only';
import QRCode from 'qrcode';

// Mismo QR que el backoffice (apps/web/src/server/verifactu-qr.ts): cotejo de
// la AEAT, en el entorno de pruebas mientras no se envían registros reales.
const BASE =
  process.env.AEAT_ENTORNO === 'produccion'
    ? 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR'
    : 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR';

export function verifactuUrl({ taxId, fullNumber, issueDate, amount }: { taxId: string; fullNumber: string; issueDate: string; amount: string }) {
  const [y, m, d] = issueDate.split('-');
  const params = new URLSearchParams({ nif: taxId, numserie: fullNumber, fecha: `${d}-${m}-${y}`, importe: Number(amount).toFixed(2) });
  return `${BASE}?${params}`;
}

export const qrSvg = (url: string) => QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, color: { dark: '#000000', light: '#ffffff' } });
