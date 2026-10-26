import 'server-only';
import QRCode from 'qrcode';

// Servicio de cotejo de la AEAT. Mientras no se envían registros reales, el QR
// apunta al entorno de pruebas; AEAT_ENTORNO=produccion lo cambia.
const BASE =
  process.env.AEAT_ENTORNO === 'produccion'
    ? 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR'
    : 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR';

/**
 * URL del QR VeriFactu: NIF del emisor, número de serie, fecha de expedición
 * (DD-MM-AAAA) e importe total (base + cuotas, sin retención, con punto).
 */
export function verifactuUrl({ taxId, fullNumber, issueDate, amount }: { taxId: string; fullNumber: string; issueDate: string; amount: string }) {
  const [y, m, d] = issueDate.split('-');
  const params = new URLSearchParams({ nif: taxId, numserie: fullNumber, fecha: `${d}-${m}-${y}`, importe: Number(amount).toFixed(2) });
  return `${BASE}?${params}`;
}

/** PNG en data URL; corrección M y margen 0 (el PDF ya deja aire alrededor). */
export const qrDataUrl = (url: string) => QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 0, width: 360, color: { dark: '#16181d', light: '#ffffff' } });
