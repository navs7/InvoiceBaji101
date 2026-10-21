import { CURRENCIES } from '../config/gst.js';

// All money is stored as integer minor units (paise / cents). No floating point sums.

// Parse "1,234.5" -> 123450. Returns NaN for invalid input, 0 for empty.
export function toMinor(value) {
  if (value === '' || value == null) return 0;
  const s = String(value).replace(/,/g, '').trim();
  if (!/^-?\d*\.?\d*$/.test(s) || s === '' || s === '.' || s === '-') return NaN;
  const neg = s.startsWith('-');
  const [i = '0', f = ''] = s.replace('-', '').split('.');
  const bump = f.length > 2 && f[2] >= '5' ? 1 : 0;
  const n = parseInt(i || '0', 10) * 100 + parseInt((f + '00').slice(0, 2), 10) + bump;
  return neg ? -n : n;
}

// 123450 -> "1234.50" (plain, no grouping; used for inputs and CSV).
export function minorToPlain(m) {
  const a = Math.abs(m);
  return `${m < 0 ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

function group(intStr, indian) {
  if (intStr.length <= 3) return intStr;
  if (!indian) return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const last3 = intStr.slice(-3);
  const rest = intStr.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

// INR -> ₹1,23,456.00 ; others -> $123,456.00
export function fmtMoney(minor, currency = 'INR', { symbol = true } = {}) {
  const c = CURRENCIES[currency] || { symbol: `${currency} ` };
  const plain = minorToPlain(Math.abs(minor || 0));
  const [i, f] = plain.split('.');
  const body = `${group(i, currency === 'INR')}.${f}`;
  return `${minor < 0 ? '-' : ''}${symbol ? c.symbol : ''}${body}`;
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function below100(n) {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
}
function below1000(n) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? below100(r) : ''].filter(Boolean).join(' ');
}

// Indian numbering: crore, lakh, thousand.
export function indianWords(n) {
  if (n === 0) return '';
  const parts = [];
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1e3);
  const rest = n % 1e3;
  if (crore) parts.push(`${indianWords(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (rest) parts.push(below1000(rest));
  return parts.join(' ');
}

// International numbering for foreign currencies.
export function intlWords(n) {
  if (n === 0) return '';
  const parts = [];
  const scales = [[1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']];
  let rest = n;
  for (const [size, name] of scales) {
    const q = Math.floor(rest / size);
    if (q) parts.push(`${below1000(q)} ${name}`);
    rest %= size;
  }
  if (rest) parts.push(below1000(rest));
  return parts.join(' ');
}

export function amountInWords(minor, currency = 'INR') {
  const c = CURRENCIES[currency] || { name: currency, minor: 'Cents' };
  const words = currency === 'INR' ? indianWords : intlWords;
  const abs = Math.abs(minor);
  const major = Math.floor(abs / 100);
  const frac = abs % 100;
  let s = `${currency === 'INR' ? 'Indian Rupees' : c.name} ${words(major) || 'Zero'}`;
  if (frac) s += ` and ${words(frac)} ${c.minor}`;
  return `${s} Only`;
}

// Multiply minor units by a decimal factor and round to the nearest minor unit.
export const mulRound = (minor, factor) => Math.round(minor * factor);
