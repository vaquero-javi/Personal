import 'server-only';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { InvoiceDetail, PartySnapshot } from '@omnia/invoicing/types';
import { formatDate, formatEuro, formatQty } from '@/lib/format';
import { paymentMethod } from '@/lib/labels';

// Tinta y filetes de DESIGN.md; el papel es blanco y el color de la sociedad
// no aparece: una factura se imprime y se fotocopia.
const INK = '#16181d';
const INK_2 = '#4a5058';
const INK_3 = '#5b6168';
const LINE = '#dadde1';
const HEAD = '#f4f5f7';

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 110, paddingHorizontal: 44, fontFamily: 'Helvetica', fontSize: 9, color: INK },
  row: { flexDirection: 'row' },
  header: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1.2, borderBottomColor: INK, paddingBottom: 14 },
  brand: { fontFamily: 'Helvetica-Bold', fontSize: 15, lineHeight: 1.2, marginBottom: 4 },
  muted: { color: INK_2 },
  faint: { color: INK_3 },
  title: { fontFamily: 'Helvetica-Bold', fontSize: 17, lineHeight: 1.2, textAlign: 'right', marginBottom: 6 },
  meta: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  metaLabel: { color: INK_3, width: 60, textAlign: 'right' },
  metaValue: { width: 92, textAlign: 'right' },
  parties: { flexDirection: 'row', gap: 24, paddingVertical: 14, borderBottomWidth: 0.6, borderBottomColor: LINE },
  label: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: INK_3, marginBottom: 3 },
  strong: { fontFamily: 'Helvetica-Bold' },
  th: { flexDirection: 'row', backgroundColor: HEAD, paddingVertical: 5, paddingHorizontal: 6, marginTop: 16, fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: INK_3 },
  tr: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 0.6, borderBottomColor: LINE },
  cConcept: { flex: 1, paddingRight: 8 },
  cNum: { width: 52, textAlign: 'right' },
  cPrice: { width: 66, textAlign: 'right' },
  cAmount: { width: 72, textAlign: 'right' },
  totals: { marginLeft: 'auto', width: 250, marginTop: 12 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  grand: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1.2, borderTopColor: INK, marginTop: 4, paddingTop: 6 },
  grandText: { fontFamily: 'Helvetica-Bold', fontSize: 12 },
  notes: { marginTop: 20, paddingTop: 10, borderTopWidth: 0.6, borderTopColor: LINE, color: INK_2 },
  footer: { position: 'absolute', left: 44, right: 44, bottom: 30, flexDirection: 'row', alignItems: 'flex-end', gap: 12, borderTopWidth: 0.6, borderTopColor: LINE, paddingTop: 10 },
  qr: { width: 62, height: 62 },
  pageNo: { width: 80, textAlign: 'right', color: INK_3 },
  stamp: { position: 'absolute', top: 330, left: 0, right: 0, textAlign: 'center', fontFamily: 'Helvetica-Bold', fontSize: 54, color: '#e8eaed', transform: 'rotate(-30deg)' },
});

// Las fuentes estándar del PDF (WinAnsi) no tienen los espacios finos que usa Intl.
const pdfText = (t: string) => t.replace(/[  ]/g, ' ').replace(/−/g, '-');
const euro = (n: string | number) => pdfText(formatEuro(n));

const addressLines = (a: PartySnapshot['address']) =>
  a ? [a.line, [a.postalCode, a.city].filter(Boolean).join(' '), a.city !== a.province ? a.province : undefined].filter((x): x is string => !!x) : [];

const TITLES: Record<string, string> = { F1: 'Factura', F2: 'Factura simplificada', F3: 'Factura sustitutiva' };

export interface InvoicePdfProps {
  invoice: InvoiceDetail;
  /** Para borradores, que aún no tienen foto: datos vivos de la sociedad y el cliente. */
  issuerLive: PartySnapshot & { tradeName?: string | null; iban?: string | null };
  partyLive: PartySnapshot | null;
  /** QR VeriFactu (data URL PNG), solo en emitidas con régimen VeriFactu. */
  qr: string | null;
}

/** Factura en A4. Se genera siempre de los datos congelados al emitir. */
export function InvoicePdf({ invoice: inv, issuerLive, partyLive, qr }: InvoicePdfProps) {
  const draft = inv.status === 'draft';
  const issuer = inv.issuerSnapshot ?? issuerLive;
  const party = inv.partySnapshot ?? partyLive;
  const title = inv.invoiceType.startsWith('R') ? 'Factura rectificativa' : (TITLES[inv.invoiceType] ?? 'Factura');
  const subtotal = draft ? inv.lines.reduce((a, l) => a + Number(l.lineBase), 0) : Number(inv.subtotal);
  const breakdown = draft
    ? [...inv.lines.reduce((m, l) => {
        const k = l.taxRate;
        const acc = m.get(k) ?? { taxRate: k, base: 0, tax: 0 };
        m.set(k, { taxRate: k, base: acc.base + Number(l.lineBase), tax: acc.tax + Number(l.lineTax) });
        return m;
      }, new Map<string, { taxRate: string; base: number; tax: number }>()).values()]
    : inv.taxBreakdown.map((t) => ({ taxRate: t.taxRate, base: Number(t.base), tax: Number(t.tax) }));
  const tax = breakdown.reduce((a, t) => a + t.tax, 0);
  const withheld = draft ? Math.round(subtotal * Number(inv.withholdingRate)) / 100 : Number(inv.withholdingTotal);
  const total = draft ? subtotal + tax - withheld : Number(inv.total);
  const showIban = issuer.iban && (inv.paymentMethod ?? 'transfer') === 'transfer';

  return (
    <Document title={inv.fullNumber ? `${title} ${inv.fullNumber}` : 'Borrador de factura'} author={issuer.legalName} creator="Omnia" producer="Omnia" language="es-ES">
      <Page size="A4" style={s.page}>
        {draft && <Text style={s.stamp} fixed>BORRADOR</Text>}

        <View style={s.header}>
          <View style={{ maxWidth: 270 }}>
            <Text style={s.brand}>{issuer.tradeName ?? issuer.legalName}</Text>
            {issuer.tradeName && <Text>{issuer.legalName}</Text>}
            <Text>NIF {issuer.taxId}</Text>
            {addressLines(issuer.address).map((l) => (
              <Text key={l} style={s.muted}>{l}</Text>
            ))}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.title}>{title}</Text>
            <View style={s.meta}>
              <Text style={s.metaLabel}>Número</Text>
              <Text style={[s.metaValue, s.strong]}>{inv.fullNumber ?? 'Sin emitir'}</Text>
            </View>
            <View style={s.meta}>
              <Text style={s.metaLabel}>Fecha</Text>
              <Text style={s.metaValue}>{inv.issueDate ? formatDate(inv.issueDate) : '—'}</Text>
            </View>
            {inv.operationDate && inv.operationDate !== inv.issueDate && (
              <View style={s.meta}>
                <Text style={s.metaLabel}>Operación</Text>
                <Text style={s.metaValue}>{formatDate(inv.operationDate)}</Text>
              </View>
            )}
            {inv.rectifiesNumber && (
              <View style={s.meta}>
                <Text style={s.metaLabel}>Rectifica a</Text>
                <Text style={s.metaValue}>{inv.rectifiesNumber}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={s.parties}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>FACTURAR A</Text>
            {party ? (
              <>
                <Text style={s.strong}>{party.legalName}</Text>
                {party.taxId && <Text>NIF {party.taxId}</Text>}
                {addressLines(party.address).map((l) => (
                  <Text key={l} style={s.muted}>{l}</Text>
                ))}
              </>
            ) : (
              <Text style={s.muted}>Cliente de mostrador</Text>
            )}
          </View>
          <View style={{ width: 200 }}>
            <Text style={s.label}>COBRO</Text>
            <View style={s.row}>
              <Text style={[s.faint, { width: 70 }]}>Vencimiento</Text>
              <Text>{formatDate(inv.dueDate)}</Text>
            </View>
            <View style={s.row}>
              <Text style={[s.faint, { width: 70 }]}>Forma de pago</Text>
              <Text>{paymentMethod[inv.paymentMethod ?? 'transfer']}</Text>
            </View>
            {showIban && (
              <View style={s.row}>
                <Text style={[s.faint, { width: 70 }]}>IBAN</Text>
                <Text>{issuer.iban!.replace(/(.{4})/g, '$1 ').trim()}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={s.th}>
          <Text style={s.cConcept}>CONCEPTO</Text>
          <Text style={s.cNum}>CANTIDAD</Text>
          <Text style={s.cPrice}>PRECIO</Text>
          <Text style={s.cNum}>DTO.</Text>
          <Text style={s.cNum}>IVA</Text>
          <Text style={s.cAmount}>IMPORTE</Text>
        </View>
        {inv.lines.map((l) => (
          <View key={l.id} style={s.tr} wrap={false}>
            <Text style={s.cConcept}>{l.description}</Text>
            <Text style={s.cNum}>{pdfText(formatQty(l.quantity))}</Text>
            <Text style={s.cPrice}>{euro(l.unitPrice)}</Text>
            <Text style={[s.cNum, s.faint]}>{Number(l.discountPct) ? `${pdfText(formatQty(l.discountPct))} %` : '—'}</Text>
            <Text style={[s.cNum, s.faint]}>{pdfText(formatQty(l.taxRate))} %</Text>
            <Text style={s.cAmount}>{euro(l.lineBase)}</Text>
          </View>
        ))}

        <View style={s.totals} wrap={false}>
          <View style={s.totalRow}>
            <Text style={s.muted}>Base imponible</Text>
            <Text>{euro(subtotal)}</Text>
          </View>
          {breakdown.map((t) => (
            <View key={t.taxRate} style={s.totalRow}>
              <Text style={s.muted}>
                IVA {pdfText(formatQty(t.taxRate))} %{breakdown.length > 1 ? ` s/ ${euro(t.base)}` : ''}
              </Text>
              <Text>{euro(t.tax)}</Text>
            </View>
          ))}
          {withheld > 0 && (
            <View style={s.totalRow}>
              <Text style={s.muted}>Retención IRPF {pdfText(formatQty(inv.withholdingRate))} %</Text>
              <Text>-{euro(withheld)}</Text>
            </View>
          )}
          <View style={s.grand}>
            <Text style={s.grandText}>{withheld > 0 ? 'Total a cobrar' : 'Total'}</Text>
            <Text style={s.grandText}>{euro(total)}</Text>
          </View>
        </View>

        {inv.notes && <Text style={s.notes}>{inv.notes}</Text>}

        <View style={s.footer} fixed>
          {qr && (
            <>
              <Image src={qr} style={s.qr} />
              <View style={{ width: 170 }}>
                <Text style={s.strong}>VERI*FACTU</Text>
                <Text style={s.faint}>Factura verificable en la sede electrónica de la AEAT</Text>
              </View>
            </>
          )}
          <View style={{ flex: 1 }}>
            {draft ? (
              <Text style={s.faint}>Borrador sin validez fiscal: no tiene número ni registro de facturación.</Text>
            ) : (
              inv.fiscalRecordHash && <Text style={[s.faint, { fontSize: 6.5 }]}>Huella del registro: {inv.fiscalRecordHash}</Text>
            )}
          </View>
          {/* Dentro del pie y con ancho fijo: suelto en la página, react-pdf no lo pinta. */}
          <Text style={s.pageNo} fixed render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
