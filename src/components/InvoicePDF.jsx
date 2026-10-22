import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import latin400 from '@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff?url';
import latin700 from '@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff?url';
import sym400 from '@fontsource/noto-sans/files/noto-sans-devanagari-400-normal.woff?url';
import sym700 from '@fontsource/noto-sans/files/noto-sans-devanagari-700-normal.woff?url';
import { CURRENCIES, DECLARATIONS, TEMPLATES, posLabel, stateByCode } from '../config/gst.js';
import { dmy } from '../lib/dates.js';
import { amountInWords, fmtMoney } from '../lib/money.js';

// Noto Sans has no ₹ in its Latin subset, so the symbol is drawn from a second face.
Font.register({ family: 'Noto', fonts: [{ src: latin400, fontWeight: 400 }, { src: latin700, fontWeight: 700 }] });
Font.register({ family: 'NotoSym', fonts: [{ src: sym400, fontWeight: 400 }, { src: sym700, fontWeight: 700 }] });
Font.registerHyphenationCallback((w) => [w]);

const C = { ink: '#1c2330', muted: '#5f6877', line: '#cfd4dc', head: '#eef0f4' };
const s = StyleSheet.create({
  page: { padding: 32, paddingBottom: 40, fontFamily: 'Noto', fontSize: 8.5, color: C.ink, lineHeight: 1.5 },
  row: { flexDirection: 'row' },
  bold: { fontWeight: 700 },
  muted: { color: C.muted },
  title: { fontSize: 15, fontWeight: 700, textAlign: 'right', lineHeight: 1.4, marginBottom: 4 },
  box: { border: `0.75pt solid ${C.line}`, padding: 7 },
  label: { fontSize: 7, color: C.muted, textTransform: 'uppercase', marginBottom: 2, fontWeight: 700 },
  th: { backgroundColor: C.head, fontWeight: 700, borderBottom: `0.75pt solid ${C.line}` },
  td: { borderBottom: `0.5pt solid ${C.line}` },
  cell: { padding: 4 },
  tot: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  decl: { border: `1pt solid ${C.ink}`, padding: 6, marginTop: 8, fontWeight: 700, textAlign: 'center' },
});

// Renders an amount; the rupee sign uses the symbol face.
export function Amt({ v, cur = 'INR', style, bold }) {
  const st = [bold && s.bold, style];
  const text = fmtMoney(v, cur, { symbol: false });
  if (cur === 'INR') {
    return <Text style={st}><Text style={{ fontFamily: 'NotoSym' }}>₹</Text>{text}</Text>;
  }
  return <Text style={st}>{CURRENCIES[cur]?.symbol || `${cur} `}{text}</Text>;
}

const Lines = ({ items }) => items.filter(Boolean).map((t, i) => <Text key={i}>{t}</Text>);

function partyLines(c) {
  const name = [c.salutation, c.contact].filter(Boolean).join(' ');
  const place = [c.city, c.pin].filter(Boolean).join(' ');
  return [
    c.name,
    name && name !== c.name ? `Attn: ${name}` : '',
    c.address, place,
    c.type === 'overseas' ? c.country : (stateByCode(c.stateCode) ? `${stateByCode(c.stateCode).label}` : ''),
    c.gstin && `GSTIN: ${c.gstin}`,
    c.pan && c.type !== 'overseas' && !c.gstin && `PAN: ${c.pan}`,
    c.taxId && `Tax ID: ${c.taxId}`,
    c.emails?.[0],
  ];
}

export function InvoiceDoc({ invoice: inv, supplier: sup }) {
  const t = TEMPLATES[inv.template];
  const cur = inv.currency;
  const calc = inv.calc;
  const isTax = inv.template === 'tax';
  const isExp = inv.template === 'exp';
  const showTax = isTax || (isExp && inv.exportMode === 'IGST');
  const intra = isTax && inv.pos === sup.stateCode;
  const draft = !inv.number;
  const bank = isExp ? sup.bankForeign : sup.bankInr;
  const hasDiscount = inv.lines.some((l) => l.discount);
  const cols = [
    { k: 'n', w: 18, h: '#' },
    { k: 'desc', w: 0, h: 'Description' },
    { k: 'sac', w: 46, h: 'SAC' },
    { k: 'qty', w: 36, h: 'Qty', r: true },
    { k: 'unit', w: 28, h: 'Unit' },
    { k: 'rate', w: 56, h: 'Rate', r: true },
    ...(hasDiscount ? [{ k: 'disc', w: 48, h: 'Discount', r: true }] : []),
    { k: 'tax', w: 62, h: 'Taxable', r: true },
    ...(showTax ? [{ k: 'gst', w: 28, h: 'GST', r: true }] : []),
    ...(showTax && intra ? [{ k: 'cgst', w: 46, h: 'CGST', r: true }, { k: 'sgst', w: 46, h: 'SGST', r: true }] : []),
    ...(showTax && !intra ? [{ k: 'igst', w: 50, h: 'IGST', r: true }] : []),
  ];
  const cellStyle = (c) => [s.cell, c.w ? { width: c.w } : { flexGrow: 1, flexShrink: 1 }, c.r && { textAlign: 'right' }];
  const lineValue = (c, l, i) => {
    const x = calc.lines[i];
    switch (c.k) {
      case 'n': return String(i + 1);
      case 'desc': return l.desc;
      case 'sac': return l.sac;
      case 'qty': return String(l.qty);
      case 'unit': return l.unit || 'OTH';
      case 'rate': return <Amt v={l.rate} cur={cur} />;
      case 'disc': return <Amt v={l.discount || 0} cur={cur} />;
      case 'tax': return <Amt v={x.taxable} cur={cur} />;
      case 'gst': return `${x.rate}%`;
      case 'cgst': return <Amt v={x.cgst} cur={cur} />;
      case 'sgst': return <Amt v={x.sgst} cur={cur} />;
      case 'igst': return <Amt v={x.igst} cur={cur} />;
      default: return '';
    }
  };

  return (
    <Document title={inv.number || 'Draft invoice'} author={sup.legalName} creator="Pixel Solutions" producer="Pixel Solutions">
      <Page size="A4" style={s.page} wrap>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <View style={{ width: '58%' }}>
            {sup.logo && <Image src={sup.logo} style={{ height: 42, objectFit: 'contain', objectPosition: 'left', marginBottom: 6 }} />}
            <Text style={[s.bold, { fontSize: 12, lineHeight: 1.5, marginBottom: 2 }]}>{sup.tradeName || sup.legalName}</Text>
            {sup.tradeName && sup.tradeName !== sup.legalName && <Text>{sup.legalName}</Text>}
            <Lines items={[sup.address, `${stateByCode(sup.stateCode)?.label || ''}${sup.pin ? ` – ${sup.pin}` : ''}`, `GSTIN: ${sup.gstin}`, sup.pan && `PAN: ${sup.pan}`, sup.email, sup.phone]} />
          </View>
          <View style={{ width: '40%' }}>
            <Text style={s.title}>{t.title}</Text>
            {inv.template !== 'bos' && <Text style={[s.muted, { textAlign: 'right' }]}>({DECLARATIONS.original})</Text>}
            <View style={[s.box, { marginTop: 8 }]}>
              <View style={s.tot}><Text style={s.muted}>Invoice no.</Text><Text style={s.bold}>{inv.number || 'DRAFT'}</Text></View>
              <View style={s.tot}><Text style={s.muted}>Invoice date</Text><Text>{dmy(inv.date)}</Text></View>
              {inv.dueDate && <View style={s.tot}><Text style={s.muted}>Due date</Text><Text>{dmy(inv.dueDate)}</Text></View>}
              {inv.paymentTerms && <View style={s.tot}><Text style={s.muted}>Payment terms</Text><Text>{inv.paymentTerms}</Text></View>}
            </View>
          </View>
        </View>
        {draft && <Text style={[s.bold, { color: '#b26a00', marginTop: 6 }]}>DRAFT: not a valid tax document until issued.</Text>}

        <View style={[s.row, { marginTop: 10, gap: 8 }]}>
          <View style={[s.box, { flex: 1 }]}>
            <Text style={s.label}>Bill to</Text>
            <Text style={s.bold}>{inv.client.name}</Text>
            <Lines items={partyLines(inv.client).slice(1)} />
          </View>
          <View style={[s.box, { width: '38%' }]}>
            <Text style={s.label}>Supply details</Text>
            <Text>Place of supply: {posLabel(inv.pos)}</Text>
            {isTax && <Text>Tax payable on reverse charge: {inv.reverseCharge ? 'Yes' : 'No'}</Text>}
            {isExp && <Text>Recipient country: {inv.client.country}</Text>}
            {isExp && inv.client.taxId && <Text>Recipient tax ID: {inv.client.taxId}</Text>}
            {isExp && cur !== 'INR' && <Text>Currency: {cur}</Text>}
          </View>
        </View>

        <View style={{ marginTop: 10, border: `0.75pt solid ${C.line}` }}>
          <View style={[s.row, s.th]} fixed>
            {cols.map((c) => <Text key={c.k} style={cellStyle(c)}>{c.h}</Text>)}
          </View>
          {inv.lines.map((l, i) => (
            <View key={l.id || i} style={[s.row, s.td]} wrap={false}>
              {cols.map((c) => <Text key={c.k} style={cellStyle(c)}>{lineValue(c, l, i)}</Text>)}
            </View>
          ))}
        </View>

        <View wrap={false}>
          <View style={[s.row, { marginTop: 8, justifyContent: 'space-between' }]}>
            <View style={{ width: '52%' }}>
              <Text style={s.label}>Amount in words</Text>
              <Text style={s.bold}>{amountInWords(calc.totals.total, cur)}</Text>
              {isExp && cur !== 'INR' && Number(inv.exchangeRate) > 0 && (
                <View style={{ marginTop: 8 }}>
                  <Text style={s.label}>INR equivalent</Text>
                  <Text>1 {cur} = <Amt v={Math.round(Number(inv.exchangeRate) * 100)} cur="INR" /> (rate dated {dmy(inv.rateDate)})</Text>
                  <Text>Taxable value: <Amt v={calc.inr.taxable} cur="INR" /></Text>
                  {calc.inr.igst > 0 && <Text>IGST: <Amt v={calc.inr.igst} cur="INR" /></Text>}
                </View>
              )}
            </View>
            <View style={{ width: '44%' }}>
              <View style={s.tot}><Text>Taxable value</Text><Amt v={calc.totals.taxable} cur={cur} /></View>
              {showTax && calc.totals.byRate.filter((g) => intra ? (g.cgst || g.sgst) : g.igst).map((g) => (
                intra
                  ? [<View key={`c${g.rate}`} style={s.tot}><Text>CGST @ {g.rate / 2}%</Text><Amt v={g.cgst} cur={cur} /></View>,
                     <View key={`s${g.rate}`} style={s.tot}><Text>SGST @ {g.rate / 2}%</Text><Amt v={g.sgst} cur={cur} /></View>]
                  : <View key={`i${g.rate}`} style={s.tot}><Text>IGST @ {g.rate}%</Text><Amt v={g.igst} cur={cur} /></View>
              ))}
              {calc.totals.roundOff !== 0 && <View style={s.tot}><Text>Round off</Text><Amt v={calc.totals.roundOff} cur={cur} /></View>}
              <View style={[s.tot, { borderTop: `1pt solid ${C.ink}`, marginTop: 3, paddingTop: 4 }]}>
                <Text style={[s.bold, { fontSize: 10.5, lineHeight: 1.5 }]}>Total</Text><Amt v={calc.totals.total} cur={cur} bold style={{ fontSize: 10.5, lineHeight: 1.5 }} />
              </View>
            </View>
          </View>

          {inv.template === 'bos' && <Text style={s.decl}>{DECLARATIONS.composition}</Text>}
          {isExp && <Text style={s.decl}>{inv.exportMode === 'IGST' ? DECLARATIONS.exportIgst : DECLARATIONS.lut}{inv.exportMode !== 'IGST' && sup.lut?.arn ? `\nLUT ARN: ${sup.lut.arn}  |  FY: ${sup.lut.fy || ''}` : ''}</Text>}

          <View style={[s.row, { marginTop: 10, gap: 8 }]}>
            <View style={[s.box, { flex: 1 }]}>
              <Text style={s.label}>{isExp ? 'Bank details (foreign remittance)' : 'Bank details'}</Text>
              {bank && <Lines items={[
                bank.accountName && `Account name: ${bank.accountName}`, bank.number && `Account no.: ${bank.number}`,
                bank.ifsc && `IFSC: ${bank.ifsc}`, bank.swift && `SWIFT: ${bank.swift}`,
                bank.bank && `${bank.bank}${bank.branch ? `, ${bank.branch}` : ''}`, bank.intermediary && `Intermediary bank: ${bank.intermediary}`,
              ]} />}
              {isExp && <Text style={[s.muted, { marginTop: 3 }]}>{DECLARATIONS.forex}</Text>}
            </View>
            <View style={[s.box, { width: '42%', alignItems: 'flex-end', justifyContent: 'space-between', minHeight: 70 }]}>
              <Text>For {sup.legalName}</Text>
              {sup.signature && <Image src={sup.signature} style={{ height: 30, objectFit: 'contain' }} />}
              <Text style={s.muted}>{sup.signatory || 'Authorised signatory'}</Text>
            </View>
          </View>
          {(inv.notes || inv.terms) && (
            <View style={{ marginTop: 8 }}>
              <Text style={s.label}>Notes / terms</Text>
              <Text>{[inv.notes, inv.terms].filter(Boolean).join('\n')}</Text>
            </View>
          )}
        </View>
        <Text style={[s.muted, { position: 'absolute', bottom: 18, left: 32, right: 32, textAlign: 'center', fontSize: 7 }]} fixed render={({ pageNumber, totalPages }) => `${inv.number || 'Draft'}  ·  Page ${pageNumber} of ${totalPages}`} />
      </Page>
    </Document>
  );
}

export const pdfFileName = (inv) => `${(inv.number || 'draft').replace(/\//g, '-')}.pdf`;

// Issued invoices render from the supplier snapshot taken at issue, so reprints never drift.
export const supplierFor = (inv, settings) => inv.supplier || settings;

export async function renderPdfBlob(inv, settings) {
  return pdf(<InvoiceDoc invoice={inv} supplier={supplierFor(inv, settings)} />).toBlob();
}
