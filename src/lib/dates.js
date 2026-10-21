const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

// 2026-10-05 -> 05-Oct-2026 (GSTR-1 offline utility format)
export function dmy(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}-${MON[Number(m) - 1]}-${y}`;
}

// Indian financial year starts on 1 April.
export function fyStartYear(iso) {
  const [y, m] = iso.split('-').map(Number);
  return m >= 4 ? y : y - 1;
}
export const fyLabel = (startYear) => `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
export const fyOfDate = (iso) => fyLabel(fyStartYear(iso));
export const fyRange = (startYear) => ({ from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` });
export const fyDisplay = (startYear) => `FY ${startYear}-${String(startYear + 1).slice(-2)}`;

export const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

// monthIndex 0 = April ... 11 = March of the FY starting in startYear.
export function monthRange(startYear, monthIndex) {
  const calMonth = ((monthIndex + 3) % 12) + 1;
  const year = calMonth >= 4 ? startYear : startYear + 1;
  const last = new Date(Date.UTC(year, calMonth, 0)).getUTCDate();
  return { from: `${year}-${pad(calMonth)}-01`, to: `${year}-${pad(calMonth)}-${pad(last)}` };
}

export const QUARTERS = ['Apr–Jun', 'Jul–Sep', 'Oct–Dec', 'Jan–Mar'];
export function quarterRange(startYear, q) {
  return { from: monthRange(startYear, q * 3).from, to: monthRange(startYear, q * 3 + 2).to };
}

export const inRange = (iso, { from, to }) => iso >= from && iso <= to;

export function parseTermsDays(terms) {
  const m = /(\d+)/.exec(terms || '');
  return m ? Number(m[1]) : 0;
}
