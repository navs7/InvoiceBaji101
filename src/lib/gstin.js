import { stateByCode } from '../config/gst.js';

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const FORMAT = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PAN_FORMAT = /^[A-Z]{5}\d{4}[A-Z]$/;

export function gstinChecksum(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(v / 36) + (v % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

export const withChecksum = (first14) => first14 + gstinChecksum(first14);

// Returns an error message, or '' when valid. stateCode (optional) must match the first 2 digits.
export function gstinError(value, stateCode) {
  const g = (value || '').trim().toUpperCase();
  if (g.length !== 15) return 'GSTIN must be exactly 15 characters.';
  if (!FORMAT.test(g)) return 'GSTIN format is invalid. It should look like 08ABCDE1234F1Z5.';
  if (!stateByCode(g.slice(0, 2))) return `GSTIN starts with ${g.slice(0, 2)}, which is not a valid state code.`;
  if (stateCode && g.slice(0, 2) !== stateCode) {
    return `The first two digits of the GSTIN (${g.slice(0, 2)}) must match the selected state code (${stateCode}).`;
  }
  if (gstinChecksum(g.slice(0, 14)) !== g[14]) return 'GSTIN check character does not match. Please check for typos.';
  return '';
}

export const panFromGstin = (g) => (g || '').slice(2, 12).toUpperCase();
export const panError = (v) => (v && !PAN_FORMAT.test(v.trim().toUpperCase()) ? 'PAN must look like ABCDE1234F.' : '');
