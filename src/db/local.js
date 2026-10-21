import { fyOfDate } from '../lib/dates.js';
import { counterKey } from '../lib/numbering.js';
import { DEFAULT_SETTINGS, clone, newId, prepareIssue } from './shared.js';

const KEY = 'invoice-baji:data';
const empty = () => ({ settings: null, clients: {}, invoices: {}, counters: {} });

// Demo-mode adapter: everything lives in this browser's localStorage.
export function createLocalDb() {
  const read = () => {
    try { return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return empty(); }
  };
  const write = (d) => localStorage.setItem(KEY, JSON.stringify(d));

  return {
    mode: 'local',
    auth: {
      subscribe(cb) { cb({ email: 'Local demo mode' }); return () => {}; },
      async signIn() {},
      async signOut() {},
    },
    async getSettings() { return { ...DEFAULT_SETTINGS, ...(read().settings || {}) }; },
    async hasSettings() { return !!read().settings; },
    async saveSettings(s) { const d = read(); d.settings = clone(s); write(d); },
    async list(col) { return Object.values(read()[col]).map(clone); },
    async get(col, id) { const x = read()[col][id]; return x ? clone(x) : null; },
    async put(col, obj) {
      const d = read();
      const o = clone({ ...obj, id: obj.id || newId() });
      d[col][o.id] = o;
      write(d);
      return clone(o);
    },
    async remove(col, id) { const d = read(); delete d[col][id]; write(d); },
    async issueInvoice(id, supplier) {
      const d = read();
      const inv = d.invoices[id];
      if (!inv) throw new Error('Invoice not found.');
      const { key, seq, invoice } = prepareIssue(inv, d.counters[counterKey(inv.template, fyOfDate(inv.date))] ?? 0, supplier);
      d.counters[key] = seq;
      d.invoices[id] = invoice;
      write(d);
      return clone(invoice);
    },
    async exportAll() { return clone(read()); },
    async importAll(data) { write({ ...empty(), ...clone(data) }); },
    async clearAll() { write(empty()); },
  };
}
