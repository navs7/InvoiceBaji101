import { DEFAULT_PREFIXES, MAX_INVOICE_NUMBER_LENGTH } from '../config/gst.js';

// Separate consecutive series per template, restarting every financial year: INV/26-27/001
export const formatNumber = (prefix, fy, seq) => `${prefix}/${fy}/${String(seq).padStart(3, '0')}`;
export const counterKey = (template, fy) => `${template}_${fy}`;

export function numberError(number) {
  if (!number) return 'Invoice number is empty.';
  if (number.length > MAX_INVOICE_NUMBER_LENGTH) return `Invoice number “${number}” is longer than ${MAX_INVOICE_NUMBER_LENGTH} characters.`;
  if (!/^[A-Za-z0-9/-]+$/.test(number)) return 'Invoice numbers may contain only letters, digits, “-” and “/”.';
  return '';
}

export function prefixError(prefix) {
  if (!prefix) return 'Prefix is required.';
  if (!/^[A-Za-z0-9-]+$/.test(prefix)) return 'Prefix may contain only letters, digits and “-”.';
  return numberError(formatNumber(prefix, '99-00', 999));
}

export const prefixFor = (supplier, template) => supplier?.prefixes?.[template] || DEFAULT_PREFIXES[template];

// Pure: given the current counter value, produce the next number.
export function nextNumber(lastSeq, prefix, fy) {
  const seq = (lastSeq || 0) + 1;
  const number = formatNumber(prefix, fy, seq);
  const err = numberError(number);
  if (err) throw new Error(err);
  return { seq, number };
}
