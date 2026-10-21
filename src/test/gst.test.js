import { describe, expect, it } from 'vitest';
import { CSV_HEADERS } from '../config/gst.js';
import { fyOfDate, quarterRange } from '../lib/dates.js';
import { gstinError, withChecksum } from '../lib/gstin.js';
import { amountInWords, fmtMoney, toMinor } from '../lib/money.js';
import { formatNumber, nextNumber, numberError, prefixError } from '../lib/numbering.js';
import { buildComposition, buildGstr1, buildGstr3b } from '../lib/reports.js';
import { allowedTemplates, invoiceErrors } from '../lib/rules.js';
import { toCsv } from '../lib/csv.js';
import { computeInvoice } from '../lib/tax.js';

const supplier = {
  stateCode: '08', regType: 'regular', gstin: withChecksum('08ABCFS1234K1Z'), legalName: 'Me', compositionRate: 6,
  lut: { arn: 'AD08', validFrom: '2026-04-01', validTo: '2027-03-31' },
};
const line = (rate, extra = {}) => ({ desc: 'Service', sac: '998314', qty: 1, unit: 'OTH', rate, discount: 0, gstRate: 18, ...extra });

let seq = 0;
function invoice({ template = 'tax', client, pos, currency = 'INR', lines, exportMode, exchangeRate, status = 'issued', date = '2026-10-05' }) {
  const calc = computeInvoice({ template, currency, lines, intraState: pos === supplier.stateCode, exportMode, exchangeRate });
  seq += 1;
  return { template, client, pos, currency, lines, exportMode, exchangeRate, status, date, number: formatNumber('X', '26-27', seq), seq, calc, reverseCharge: false };
}
const b2b = (stateCode) => ({ type: 'b2b', name: 'Acme', gstin: withChecksum(`${stateCode}AAACA1234A1Z`), stateCode, address: 'x' });
const b2c = { type: 'b2c', name: 'Anita', stateCode: '07', address: 'x' };
const us = { type: 'overseas', name: 'Brightwave', country: 'United States' };
const range = { from: '2026-10-01', to: '2026-10-31' };

describe('money', () => {
  it('parses and formats', () => {
    expect(toMinor('1,234.5')).toBe(123450);
    expect(toMinor('abc')).toBeNaN();
    expect(fmtMoney(12345600)).toBe('₹1,23,456.00');
    expect(fmtMoney(12345600, 'USD')).toBe('$123,456.00');
  });
  it('writes amounts in words with Indian numbering', () => {
    expect(amountInWords(1180000)).toBe('Indian Rupees Eleven Thousand Eight Hundred Only');
    expect(amountInWords(17700000)).toBe('Indian Rupees One Lakh Seventy Seven Thousand Only');
    expect(amountInWords(250000, 'USD')).toBe('US Dollars Two Thousand Five Hundred Only');
  });
});

describe('gstin', () => {
  it('validates length, state and checksum', () => {
    const g = withChecksum('08ABCFS1234K1Z');
    expect(gstinError(g, '08')).toBe('');
    expect(gstinError(g, '27')).toMatch(/must match/);
    expect(gstinError(g.slice(0, 14))).toMatch(/15 characters/);
    expect(gstinError(g.slice(0, 14) + (g.endsWith('A') ? 'B' : 'A'))).toMatch(/check character/);
  });
});

describe('tax calculation', () => {
  it('splits CGST + SGST intra-state', () => {
    const { totals } = computeInvoice({ template: 'tax', currency: 'INR', lines: [line(1000000)], intraState: true });
    expect(totals).toMatchObject({ cgst: 90000, sgst: 90000, igst: 0, total: 1180000, roundOff: 0 });
  });
  it('charges IGST inter-state', () => {
    const { totals } = computeInvoice({ template: 'tax', currency: 'INR', lines: [line(1000000)], intraState: false });
    expect(totals).toMatchObject({ igst: 180000, cgst: 0, total: 1180000 });
  });
  it('rounds tax per line and the grand total to the rupee', () => {
    const { totals } = computeInvoice({ template: 'tax', currency: 'INR', lines: [line(10001), line(10001)], intraState: false });
    expect(totals.igst).toBe(3600); // 1800.18 -> 1800 per line
    expect(totals.total % 100).toBe(0);
    expect(totals.subtotal + totals.roundOff).toBe(totals.total);
  });
  it('applies per-line discounts before tax', () => {
    const { totals } = computeInvoice({ template: 'tax', currency: 'INR', lines: [line(1000000, { discount: 100000 })], intraState: false });
    expect(totals.taxable).toBe(900000);
    expect(totals.igst).toBe(162000);
  });
  it('exports under LUT carry no IGST and convert to INR', () => {
    const { totals, inr } = computeInvoice({ template: 'exp', currency: 'USD', lines: [line(200000)], exportMode: 'LUT', exchangeRate: 88.5 });
    expect(totals.igst).toBe(0);
    expect(totals.total).toBe(200000);
    expect(inr.total).toBe(17700000);
  });
  it('exports with IGST charge full rate', () => {
    const { totals, inr } = computeInvoice({ template: 'exp', currency: 'USD', lines: [line(200000)], exportMode: 'IGST', exchangeRate: 88.5 });
    expect(totals.igst).toBe(36000);
    expect(inr.igst).toBe(3186000);
  });
  it('bill of supply has no tax', () => {
    const { totals } = computeInvoice({ template: 'bos', currency: 'INR', lines: [line(1000000)], intraState: true });
    expect(totals).toMatchObject({ cgst: 0, sgst: 0, igst: 0, total: 1000000 });
  });
});

describe('numbering', () => {
  it('formats and increments with no gaps', () => {
    expect(fyOfDate('2026-10-05')).toBe('26-27');
    expect(fyOfDate('2027-03-31')).toBe('26-27');
    expect(fyOfDate('2027-04-01')).toBe('27-28');
    expect(nextNumber(0, 'INV', '26-27')).toEqual({ seq: 1, number: 'INV/26-27/001' });
    expect(nextNumber(41, 'BOS', '26-27').number).toBe('BOS/26-27/042');
  });
  it('enforces the 16 character / charset rule', () => {
    expect(numberError('INV/26-27/001')).toBe('');
    expect(numberError('INVOICE/26-27/0001')).toMatch(/longer/);
    expect(numberError('INV 26')).toMatch(/only letters/);
    expect(prefixError('TOOLONGPREFIX')).not.toBe('');
    expect(prefixError('INV')).toBe('');
  });
});

describe('rules', () => {
  it('suggests templates by registration type', () => {
    expect(allowedTemplates('b2b', supplier)).toEqual(['tax']);
    expect(allowedTemplates('overseas', supplier)).toEqual(['exp']);
    expect(allowedTemplates('b2b', { ...supplier, regType: 'composition' })).toEqual(['bos']);
    expect(allowedTemplates('overseas', { ...supplier, regType: 'composition' })).toEqual([]);
  });
  it('blocks inter-state and overseas bills for composition suppliers', () => {
    const comp = { ...supplier, regType: 'composition' };
    const mk = (client, pos) => ({ template: 'bos', client, pos, currency: 'INR', date: '2026-10-05', lines: [line(1000000)] });
    expect(invoiceErrors(mk(b2b('27'), '27'), comp).join()).toMatch(/inter-state/);
    expect(invoiceErrors(mk(us, '96'), comp).join()).toMatch(/cannot export/);
    expect(invoiceErrors(mk(b2b('08'), '08'), comp)).toEqual([]);
  });
});

describe('acceptance: GSTR-1 files', () => {
  const invs = [
    invoice({ client: b2b('08'), pos: '08', lines: [line(1000000)] }),
    invoice({ client: b2b('27'), pos: '27', lines: [line(1000000)] }),
    invoice({ client: b2c, pos: '07', lines: [line(15000000)] }),
    invoice({ client: b2c, pos: '07', lines: [line(5000000)] }),
    invoice({ template: 'exp', client: us, pos: '96', currency: 'USD', lines: [line(200000)], exportMode: 'LUT', exchangeRate: 88.5 }),
  ];
  const r = buildGstr1(invs, supplier, range);

  it('1 & 2: B2B rows carry place of supply and totals', () => {
    expect(r.b2b.rows).toHaveLength(2);
    expect(r.b2b.rows[0]).toContain('08-Rajasthan');
    expect(r.b2b.rows[0][4]).toBe('11800.00');
    expect(r.b2b.rows[1]).toContain('27-Maharashtra');
  });
  it('3: unregistered inter-state > ₹1 lakh goes to B2CL, otherwise B2CS', () => {
    expect(r.b2cl.rows).toHaveLength(1);
    expect(r.b2cl.rows[0][2]).toBe('177000.00');
    expect(r.b2cs.rows).toEqual([['OE', '07-Delhi', '', 18, '50000.00', '0.00', '']]);
  });
  it('4: export row is WOPAY in INR', () => {
    expect(r.exp.rows).toHaveLength(1);
    expect(r.exp.rows[0][0]).toBe('WOPAY');
    expect(r.exp.rows[0][3]).toBe('177000.00');
    expect(r.exp.rows[0][9]).toBe('177000.00');
  });
  it('splits HSN into B2B and B2C (exports in B2C)', () => {
    expect(r.hsn_b2b.rows).toHaveLength(1);
    expect(r.hsn_b2c.rows.length).toBeGreaterThan(0);
  });
  it('uses the configured headers', () => {
    expect(r.b2b.headers).toEqual(CSV_HEADERS.b2b);
    expect(toCsv(['A', 'B'], [['x,y', 'q"r']])).toBe('A,B\r\n"x,y","q""r"\r\n');
  });
  it('GSTR-3B splits regular, zero-rated and inter-state B2C', () => {
    const t = buildGstr3b(invs, supplier, range);
    expect(t.a31b.taxable).toBe(17700000);
    expect(t.a31b.igst).toBe(0);
    expect(t.s32).toEqual([{ pos: '07', taxable: 20000000, igst: 3600000 }]);
  });
});

describe('acceptance: composition', () => {
  it('5: quarterly composition tax is 6% split into CGST + SGST', () => {
    const comp = { ...supplier, regType: 'composition' };
    const inv = invoice({ template: 'bos', client: b2b('08'), pos: '08', lines: [line(1000000)] });
    const q = quarterRange(2026, 2); // Oct–Dec
    expect(buildComposition([inv], comp, q)).toMatchObject({ turnover: 1000000, total: 60000, cgst: 30000, sgst: 30000 });
  });
});

describe('acceptance: document series', () => {
  it('6: five issued, one cancelled -> total 5, cancelled 1, no gaps', () => {
    const list = Array.from({ length: 5 }, (_, i) => {
      const inv = invoice({ client: b2b('08'), pos: '08', lines: [line(1000000)] });
      inv.number = formatNumber('INV', '26-27', i + 1);
      inv.seq = i + 1;
      return inv;
    });
    list[2].status = 'cancelled';
    const docs = buildGstr1(list, supplier, range).docs.rows;
    expect(docs).toEqual([['Invoices for outward supply (Tax Invoice)', 'INV/26-27/001', 'INV/26-27/005', 5, 1]]);
    // Cancelled invoices are excluded from the tax tables.
    expect(buildGstr1(list, supplier, range).b2b.rows).toHaveLength(4);
  });
});
