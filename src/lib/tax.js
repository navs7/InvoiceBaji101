import { mulRound } from './money.js';

// Line taxable value = qty x rate - discount, in minor units.
export const lineTaxable = (l) => Math.max(0, mulRound(l.rate || 0, Number(l.qty) || 0) - (l.discount || 0));

const blank = () => ({ taxable: 0, cgst: 0, sgst: 0, igst: 0 });

/**
 * Compute an invoice's amounts.
 *  template: 'tax' | 'bos' | 'exp'
 *  intraState: place of supply equals supplier state (only relevant for 'tax')
 *  exportMode: 'LUT' | 'IGST' (only relevant for 'exp')
 *  exchangeRate: INR per 1 unit of foreign currency (exports)
 * Tax is rounded per line to the minor unit, then summed.
 */
export function computeInvoice({ template, currency, lines, intraState, exportMode, exchangeRate }) {
  const out = lines.map((l) => {
    const taxable = lineTaxable(l);
    const rate = Number(l.gstRate) || 0;
    const t = { taxable, rate, cgst: 0, sgst: 0, igst: 0 };
    if (template === 'tax') {
      if (intraState) {
        t.cgst = Math.round((taxable * rate) / 200);
        t.sgst = Math.round((taxable * rate) / 200);
      } else {
        t.igst = Math.round((taxable * rate) / 100);
      }
    } else if (template === 'exp' && exportMode === 'IGST') {
      t.igst = Math.round((taxable * rate) / 100);
    }
    return t;
  });

  const sum = out.reduce((a, t) => ({ taxable: a.taxable + t.taxable, cgst: a.cgst + t.cgst, sgst: a.sgst + t.sgst, igst: a.igst + t.igst }), blank());
  const subtotal = sum.taxable + sum.cgst + sum.sgst + sum.igst;
  // Round off to the nearest rupee only for INR documents; foreign-currency totals stay exact.
  const roundOff = currency === 'INR' ? Math.round(subtotal / 100) * 100 - subtotal : 0;
  const total = subtotal + roundOff;

  const byRate = {};
  for (const t of out) {
    const g = (byRate[t.rate] ||= { rate: t.rate, ...blank() });
    g.taxable += t.taxable; g.cgst += t.cgst; g.sgst += t.sgst; g.igst += t.igst;
  }
  const rateGroups = Object.values(byRate).sort((a, b) => a.rate - b.rate);

  // INR equivalents: same as the document for INR; converted at the invoice rate for exports.
  const fx = currency === 'INR' ? 1 : Number(exchangeRate) || 0;
  const conv = (v) => (currency === 'INR' ? v : Math.round(v * fx));
  const inr = {
    taxable: conv(sum.taxable), cgst: conv(sum.cgst), sgst: conv(sum.sgst), igst: conv(sum.igst),
    roundOff: conv(roundOff), total: conv(total),
    byRate: rateGroups.map((g) => ({ rate: g.rate, taxable: conv(g.taxable), cgst: conv(g.cgst), sgst: conv(g.sgst), igst: conv(g.igst) })),
  };

  return {
    lines: out,
    totals: { ...sum, subtotal, roundOff, total, byRate: rateGroups },
    inr,
  };
}

// Composition tax is computed only in reports: turnover x rate, split equally into CGST and SGST.
export function compositionTax(turnoverMinor, ratePercent) {
  const total = Math.round((turnoverMinor * ratePercent) / 100);
  const cgst = Math.round(total / 2);
  return { total, cgst, sgst: total - cgst };
}
