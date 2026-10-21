import { B2CL_THRESHOLD_PAISE, CSV_HEADERS, TEMPLATES, UQC_DEFAULT, posLabel } from '../config/gst.js';
import { dmy, inRange } from './dates.js';
import { minorToPlain } from './money.js';
import { compositionTax } from './tax.js';

const rs = minorToPlain;
export const isCounted = (i) => i.status === 'issued' || i.status === 'paid';
const isExport = (i) => i.template === 'exp';
const isLut = (i) => isExport(i) && i.exportMode !== 'IGST';
const fx = (i) => (i.currency === 'INR' ? 1 : Number(i.exchangeRate) || 0);
const toInr = (i, v) => (i.currency === 'INR' ? v : Math.round(v * fx(i)));

// Rate printed in the portal files: LUT exports carry no tax, so their rate is 0.
const effRate = (i, line) => (isLut(i) ? 0 : Number(line.gstRate) || 0);

export const numbered = (invoices, range) => invoices.filter((i) => i.number && inRange(i.date, range));
export const counted = (invoices, range) => numbered(invoices, range).filter(isCounted);

const sortByNumber = (a, b) => a.template.localeCompare(b.template) || a.seq - b.seq;

// Per-INR rate groups of an invoice; for LUT exports everything collapses to rate 0.
function rateGroups(inv) {
  const g = {};
  inv.lines.forEach((l, idx) => {
    const c = inv.calc.lines[idx];
    const r = effRate(inv, l);
    const x = (g[r] ||= { rate: r, taxable: 0, igst: 0, cgst: 0, sgst: 0 });
    x.taxable += toInr(inv, c.taxable);
    x.igst += toInr(inv, c.igst);
    x.cgst += toInr(inv, c.cgst);
    x.sgst += toInr(inv, c.sgst);
  });
  return Object.values(g).sort((a, b) => a.rate - b.rate);
}

export function buildGstr1(invoices, supplier, range) {
  const list = counted(invoices, range).sort(sortByNumber);
  const H = CSV_HEADERS;
  const sets = { b2b: [], b2cl: [], b2cs: [], exp: [], hsn_b2b: [], hsn_b2c: [], docs: [] };

  const b2csAgg = {};
  for (const inv of list) {
    const total = inv.calc.inr.total;
    if (inv.template === 'tax' && inv.client.type === 'b2b') {
      for (const g of inv.calc.inr.byRate) {
        sets.b2b.push([inv.client.gstin, inv.client.name, inv.number, dmy(inv.date), rs(total), posLabel(inv.pos), inv.reverseCharge ? 'Y' : 'N', '', 'Regular B2B', '', g.rate, rs(g.taxable), '0.00']);
      }
    } else if (inv.template === 'tax' && inv.client.type === 'b2c') {
      const interState = inv.pos !== supplier.stateCode;
      if (interState && total > B2CL_THRESHOLD_PAISE) {
        for (const g of inv.calc.inr.byRate) {
          sets.b2cl.push([inv.number, dmy(inv.date), rs(total), posLabel(inv.pos), '', g.rate, rs(g.taxable), '0.00', '']);
        }
      } else {
        for (const g of inv.calc.inr.byRate) {
          const k = `${inv.pos}|${g.rate}`;
          b2csAgg[k] = { pos: inv.pos, rate: g.rate, taxable: (b2csAgg[k]?.taxable || 0) + g.taxable };
        }
      }
    } else if (isExport(inv)) {
      for (const g of rateGroups(inv)) {
        sets.exp.push([isLut(inv) ? 'WOPAY' : 'WPAY', inv.number, dmy(inv.date), rs(total), '', '', '', '', g.rate, rs(g.taxable), '0.00']);
      }
    }
  }
  sets.b2cs = Object.values(b2csAgg)
    .sort((a, b) => a.pos.localeCompare(b.pos) || a.rate - b.rate)
    .map((g) => ['OE', posLabel(g.pos), '', g.rate, rs(g.taxable), '0.00', '']);

  // HSN/SAC summary: B2B in one file, B2C (including exports) in the other.
  const hsn = { b2b: {}, b2c: {} };
  for (const inv of list) {
    if (inv.template === 'bos') continue;
    const bucket = inv.client.type === 'b2b' ? hsn.b2b : hsn.b2c;
    inv.lines.forEach((l, idx) => {
      const c = inv.calc.lines[idx];
      const rate = effRate(inv, l);
      const key = `${l.sac}|${rate}|${l.unit}`;
      const x = (bucket[key] ||= { sac: l.sac, desc: l.desc, unit: l.unit, rate, qty: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0 });
      x.qty += Number(l.qty) || 0;
      x.taxable += toInr(inv, c.taxable);
      x.igst += toInr(inv, c.igst);
      x.cgst += toInr(inv, c.cgst);
      x.sgst += toInr(inv, c.sgst);
    });
  }
  const hsnRows = (bucket) =>
    Object.values(bucket)
      .sort((a, b) => a.sac.localeCompare(b.sac) || a.rate - b.rate)
      .map((x) => [x.sac, x.desc, x.unit === 'OTH' || !x.unit ? UQC_DEFAULT : x.unit, +x.qty.toFixed(3), rs(x.taxable + x.igst + x.cgst + x.sgst), x.rate, rs(x.taxable), rs(x.igst), rs(x.cgst), rs(x.sgst), '0.00']);
  sets.hsn_b2b = hsnRows(hsn.b2b);
  sets.hsn_b2c = hsnRows(hsn.b2c);

  // Table 13: documents issued in the period, per series. Cancelled numbers stay in the count.
  const bySeries = {};
  for (const inv of numbered(invoices, range).sort(sortByNumber)) (bySeries[inv.template] ||= []).push(inv);
  sets.docs = Object.entries(bySeries).map(([t, arr]) => [
    `Invoices for outward supply (${TEMPLATES[t].short})`, arr[0].number, arr[arr.length - 1].number, arr.length, arr.filter((i) => i.status === 'cancelled').length,
  ]);

  return {
    b2b: { headers: H.b2b, rows: sets.b2b },
    b2cl: { headers: H.b2cl, rows: sets.b2cl },
    b2cs: { headers: H.b2cs, rows: sets.b2cs },
    exp: { headers: H.exp, rows: sets.exp },
    hsn_b2b: { headers: H.hsn, rows: sets.hsn_b2b },
    hsn_b2c: { headers: H.hsn, rows: sets.hsn_b2c },
    docs: { headers: H.docs, rows: sets.docs },
  };
}

export function buildGstr3b(invoices, supplier, range) {
  const list = counted(invoices, range);
  const z = () => ({ taxable: 0, igst: 0, cgst: 0, sgst: 0 });
  const a31a = z();
  const a31b = z();
  const s32 = {};
  for (const inv of list) {
    const t = inv.calc.inr;
    if (inv.template === 'tax') {
      for (const k of ['taxable', 'igst', 'cgst', 'sgst']) a31a[k] += t[k];
      if (inv.client.type === 'b2c' && inv.pos !== supplier.stateCode) {
        const g = (s32[inv.pos] ||= { pos: inv.pos, taxable: 0, igst: 0 });
        g.taxable += t.taxable; g.igst += t.igst;
      }
    } else if (isExport(inv)) {
      a31b.taxable += t.taxable; a31b.igst += t.igst;
    }
  }
  return { a31a, a31b, s32: Object.values(s32).sort((a, b) => a.pos.localeCompare(b.pos)) };
}

// Composition: turnover = taxable value of bills of supply in the period.
export function buildComposition(invoices, supplier, range) {
  const turnover = counted(invoices, range).filter((i) => i.template === 'bos').reduce((s, i) => s + i.calc.inr.taxable, 0);
  const rate = Number(supplier.compositionRate) || 0;
  return { turnover, rate, ...compositionTax(turnover, rate) };
}

export function buildSalesRegister(invoices, range) {
  const rows = numbered(invoices, range).sort((a, b) => a.date.localeCompare(b.date) || sortByNumber(a, b)).map((i) => [
    dmy(i.date), i.number, TEMPLATES[i.template].short, i.client.name, i.client.gstin || '', posLabel(i.pos), i.currency,
    rs(i.calc.totals.taxable), rs(i.calc.totals.cgst), rs(i.calc.totals.sgst), rs(i.calc.totals.igst), rs(i.calc.totals.total), i.status,
  ]);
  return { headers: CSV_HEADERS.sales, rows };
}

export function buildExportRegister(invoices, range) {
  const rows = counted(invoices, range).filter(isExport).sort(sortByNumber).map((i) => [
    i.number, dmy(i.date), i.client.name, i.client.country || '', i.currency, rs(i.calc.totals.total), i.currency === 'INR' ? '1' : i.exchangeRate,
    rs(i.calc.inr.total), isLut(i) ? 'LUT' : 'IGST', i.payment?.inrRealised != null ? rs(i.payment.inrRealised) : '', dmy(i.payment?.date), i.payment?.brc || '',
  ]);
  return { headers: CSV_HEADERS.exports, rows };
}
