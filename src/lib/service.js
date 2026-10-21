import { db } from '../db/index.js';
import { addDays, parseTermsDays, todayISO } from './dates.js';
import { invoiceErrors, isIntraState } from './rules.js';
import { computeInvoice } from './tax.js';

export const clientSnapshot = (c) => ({
  id: c.id, salutation: c.salutation || '', contact: c.contact || '', name: c.name, emails: c.emails || [], phone: c.phone || '',
  address: c.address || '', city: c.city || '', pin: c.pin || '', country: c.country || 'India', type: c.type,
  stateCode: c.stateCode || '', gstin: c.gstin || '', pan: c.pan || '', taxId: c.taxId || '',
});

export function recalc(inv, supplier) {
  return {
    ...inv,
    calc: computeInvoice({
      template: inv.template, currency: inv.currency, lines: inv.lines,
      intraState: isIntraState(inv.pos, supplier), exportMode: inv.exportMode, exchangeRate: inv.exchangeRate,
    }),
  };
}

export async function saveDraft(inv, supplier) {
  if (inv.status && inv.status !== 'draft') throw new Error('Issued invoices are read-only.');
  const now = new Date().toISOString();
  const saved = await db.put('invoices', { ...recalc({ ...inv, status: 'draft' }, supplier), updatedAt: now, createdAt: inv.createdAt || now });
  if (saved.template === 'exp' && saved.currency !== 'INR' && Number(saved.exchangeRate) > 0) {
    const s = await db.getSettings();
    await db.saveSettings({ ...s, lastRates: { ...s.lastRates, [saved.currency]: { rate: saved.exchangeRate, date: saved.rateDate } } });
  }
  return saved;
}

// Validates, then atomically assigns the next number in the template's series for the invoice's FY.
export async function issueInvoice(inv, supplier) {
  const draft = await saveDraft(inv, supplier);
  const errs = invoiceErrors(draft, supplier);
  if (errs.length) throw new Error(errs.join('\n'));
  return db.issueInvoice(draft.id, supplier);
}

export async function cancelInvoice(id) {
  const inv = await db.get('invoices', id);
  if (!inv || !['issued', 'paid'].includes(inv.status)) throw new Error('Only issued invoices can be cancelled.');
  return db.put('invoices', { ...inv, status: 'cancelled', cancelledAt: new Date().toISOString() });
}

export async function markPaid(id, payment) {
  const inv = await db.get('invoices', id);
  if (!inv || inv.status !== 'issued') throw new Error('Only issued invoices can be marked as paid.');
  return db.put('invoices', { ...inv, status: 'paid', payment });
}

export async function duplicateInvoice(id) {
  const inv = await db.get('invoices', id);
  const copy = { ...inv, id: undefined, status: 'draft', number: undefined, seq: undefined, fy: undefined, supplier: undefined, issuedAt: undefined, cancelledAt: undefined, payment: undefined, date: todayISO(), createdAt: undefined };
  copy.dueDate = addDays(copy.date, parseTermsDays(copy.paymentTerms));
  return db.put('invoices', copy);
}

export async function deleteDraft(id) {
  const inv = await db.get('invoices', id);
  if (inv?.status !== 'draft') throw new Error('Only drafts can be deleted. Cancel an issued invoice instead.');
  await db.remove('invoices', id);
}

export async function archiveClient(id, archived) {
  const c = await db.get('clients', id);
  return db.put('clients', { ...c, archived });
}

export async function deleteClient(id) {
  const invoices = await db.list('invoices');
  if (invoices.some((i) => i.clientId === id)) throw new Error('This client has invoices, so it can only be archived, not deleted.');
  await db.remove('clients', id);
}
