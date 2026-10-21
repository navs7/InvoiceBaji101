import { fyOfDate } from '../lib/dates.js';
import { counterKey, nextNumber, prefixFor } from '../lib/numbering.js';

export const clone = (x) => JSON.parse(JSON.stringify(x));
export const newId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

export const DEFAULT_SETTINGS = {
  regType: 'regular', compositionRate: 6, turnoverAbove5Cr: false,
  prefixes: { tax: 'INV', bos: 'BOS', exp: 'EXP' },
  paymentTerms: 'Net 15', lastRates: {},
};

// Shared by every adapter so numbering behaves identically in local and Firebase mode.
// The adapter is responsible for running this atomically with the counter read/write.
export function prepareIssue(invoice, lastSeq, supplier) {
  if (invoice.status !== 'draft') throw new Error('Only draft invoices can be issued.');
  const fy = fyOfDate(invoice.date);
  const { seq, number } = nextNumber(lastSeq, prefixFor(supplier, invoice.template), fy);
  return {
    key: counterKey(invoice.template, fy),
    seq,
    invoice: { ...invoice, status: 'issued', number, seq, fy, supplier: clone(supplier), issuedAt: new Date().toISOString() },
  };
}
