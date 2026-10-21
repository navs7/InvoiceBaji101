import { TEMPLATES, UNREG_NAME_ADDRESS_THRESHOLD_PAISE, stateByCode } from '../config/gst.js';
import { gstinError } from './gstin.js';
import { fmtMoney } from './money.js';

export const isComposition = (supplier) => supplier?.regType === 'composition';
export const isIntraState = (posCode, supplier) => !!posCode && posCode === supplier?.stateCode;

// Templates a client may be billed on, given my registration type.
export function allowedTemplates(clientType, supplier) {
  if (isComposition(supplier)) return clientType === 'overseas' ? [] : ['bos'];
  return clientType === 'overseas' ? ['exp'] : ['tax'];
}

export const defaultTemplate = (clientType, supplier) => allowedTemplates(clientType, supplier)[0] || null;

export const minSacDigits = (supplier) => (supplier?.turnoverAbove5Cr ? 6 : 4);

export function lutValidOn(supplier, iso) {
  const l = supplier?.lut;
  return !!(l?.arn && l.validFrom && l.validTo && iso >= l.validFrom && iso <= l.validTo);
}

// Blocking problems: the invoice cannot be issued while any of these exist.
export function invoiceErrors(inv, supplier) {
  const errs = [];
  const c = inv.client;
  if (!c) return ['Please choose a client.'];
  if (!supplier?.gstin) errs.push('Add your GSTIN in Settings before issuing invoices.');
  if (!supplier?.legalName) errs.push('Add your legal name in Settings before issuing invoices.');

  const allowed = allowedTemplates(c.type, supplier);
  if (isComposition(supplier)) {
    if (c.type === 'overseas') errs.push('Composition service providers cannot export services. Switch your registration to Regular in Settings, or choose a different client.');
    else if (!isIntraState(inv.pos, supplier)) errs.push('Composition service providers cannot make inter-state supplies. The client’s state must be the same as yours.');
  } else if (!allowed.includes(inv.template)) {
    errs.push(`${TEMPLATES[inv.template]?.short || 'This template'} is not allowed for this client.`);
  }
  if (allowed.length && !allowed.includes(inv.template)) errs.push(`This client can only be billed on: ${allowed.map((k) => TEMPLATES[k].short).join(', ')}.`);

  if (!inv.date) errs.push('Invoice date is required.');
  if (!inv.lines?.length) errs.push('Add at least one line item.');
  const minSac = minSacDigits(supplier);
  inv.lines?.forEach((l, i) => {
    const n = i + 1;
    if (!l.desc?.trim()) errs.push(`Line ${n}: description is required.`);
    if (!(Number(l.qty) > 0)) errs.push(`Line ${n}: quantity must be greater than zero.`);
    if (!(l.rate > 0)) errs.push(`Line ${n}: rate must be greater than zero.`);
    if ((l.discount || 0) > Math.round((Number(l.qty) || 0) * (l.rate || 0))) errs.push(`Line ${n}: discount is more than the line amount.`);
    if (!/^\d+$/.test(l.sac || '') || l.sac.length < minSac) errs.push(`Line ${n}: SAC code must be at least ${minSac} digits.`);
  });

  if (c.type === 'b2b') {
    const e = gstinError(c.gstin);
    if (e) errs.push(`Client GSTIN: ${e}`);
  }
  if (inv.template === 'tax' && c.type !== 'overseas') {
    if (!inv.pos || !stateByCode(inv.pos)) errs.push('Place of supply is required.');
    if (c.type === 'b2c' && (!c.name || !c.address || !c.stateCode)) {
      errs.push(`Unregistered clients need a name, address and state on the invoice (mandatory above ${fmtMoney(UNREG_NAME_ADDRESS_THRESHOLD_PAISE)}).`);
    }
  }
  if (inv.template === 'exp') {
    if (inv.currency !== 'INR' && !(Number(inv.exchangeRate) > 0)) errs.push('Enter the exchange rate (INR per 1 unit of the invoice currency).');
    if (inv.exportMode === 'LUT' && !lutValidOn(supplier, inv.date)) errs.push('No valid LUT covers the invoice date. Add your LUT details in Settings, or switch the export mode to “With IGST payment”.');
  }
  return errs;
}

export function dueDateWarning(inv) {
  return inv.dueDate && inv.date && inv.dueDate < inv.date ? 'Due date is before the invoice date.' : '';
}
