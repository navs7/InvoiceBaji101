import { db } from './index.js';
import { addDays, todayISO } from '../lib/dates.js';
import { withChecksum } from '../lib/gstin.js';
import { clientSnapshot, issueInvoice, saveDraft } from '../lib/service.js';
import { DEFAULT_SETTINGS } from './shared.js';

const fyStart = () => {
  const t = todayISO();
  const [y, m] = t.split('-').map(Number);
  return m >= 4 ? y : y - 1;
};

export const sampleSettings = () => {
  const y = fyStart();
  return {
    ...DEFAULT_SETTINGS,
    legalName: 'Sample Consulting LLP', tradeName: 'Sample Consulting',
    address: '12, Tilak Marg, C-Scheme, Jaipur', stateCode: '08', pin: '302001',
    email: 'accounts@sample-consulting.example', phone: '+91 98290 00000',
    gstin: withChecksum('08ABCFS1234K1Z'), pan: 'ABCFS1234K', regType: 'regular',
    lut: { arn: 'AD080000000000A', fy: `${y}-${String(y + 1).slice(-2)}`, validFrom: `${y}-04-01`, validTo: `${y + 1}-03-31` },
    bankInr: { accountName: 'Sample Consulting LLP', number: '000123456789', ifsc: 'HDFC0000001', bank: 'HDFC Bank', branch: 'C-Scheme, Jaipur' },
    bankForeign: { accountName: 'Sample Consulting LLP', number: '000123456789', swift: 'HDFCINBBXXX', bank: 'HDFC Bank Ltd', branch: 'C-Scheme, Jaipur', intermediary: '' },
    defaultSac: '998314', defaultSacDesc: 'IT consulting and support services',
    signatory: 'A. Sharma, Partner',
    paymentTerms: 'Net 15',
    notes: 'Thank you for your business.',
  };
};

export const sampleClients = () => [
  { name: 'Pink City Traders Pvt Ltd', salutation: 'Mr.', contact: 'Rakesh Sharma', emails: ['rakesh@pinkcity.example'], phone: '+91 141 000 0000', address: '45, MI Road', city: 'Jaipur', pin: '302001', country: 'India', type: 'b2b', stateCode: '08', gstin: withChecksum('08AAACP1234C1Z'), currency: 'INR' },
  { name: 'Western Logistics Ltd', salutation: 'Ms.', contact: 'Neha Kulkarni', emails: ['neha@westernlog.example'], phone: '+91 22 0000 0000', address: 'Plot 9, Andheri East', city: 'Mumbai', pin: '400069', country: 'India', type: 'b2b', stateCode: '27', gstin: withChecksum('27AAACW1234C1Z'), currency: 'INR' },
  { name: 'Anita Verma', salutation: 'Mrs.', contact: 'Anita Verma', emails: ['anita.verma@example.com'], phone: '+91 98100 00000', address: 'B-12, Greater Kailash', city: 'New Delhi', pin: '110048', country: 'India', type: 'b2c', stateCode: '07', currency: 'INR' },
  { name: 'Brightwave Inc.', salutation: 'Mr.', contact: 'John Miller', emails: ['john@brightwave.example'], phone: '+1 415 000 0000', address: '500 Market St', city: 'San Francisco, CA', pin: '94105', country: 'United States', type: 'overseas', taxId: 'EIN 12-3456789', currency: 'USD' },
];

// Loads a profile, four clients and a handful of invoices (via the real issue path, so numbering is genuine).
export async function loadSampleData() {
  const settings = sampleSettings();
  await db.saveSettings(settings);
  const clients = [];
  for (const c of sampleClients()) {
    clients.push(await db.put('clients', {
      ...c, paymentTerms: 'Net 15', sac: settings.defaultSac, gstRate: 18,
      template: c.type === 'overseas' ? 'exp' : 'tax', createdAt: new Date().toISOString(),
    }));
  }
  const [intra, inter, consumer, us] = clients;
  const today = todayISO();
  const line = (desc, rate, extra = {}) => ({ id: Math.random().toString(36).slice(2), desc, sac: settings.defaultSac, qty: 1, unit: 'OTH', rate, discount: 0, gstRate: 18, ...extra });
  const base = (c, template, pos, currency, lines, extra = {}) => ({
    status: 'draft', template, client: clientSnapshot(c), clientId: c.id, currency, pos, reverseCharge: false,
    date: addDays(today, -(extra.ago ?? 3)), paymentTerms: 'Net 15', lines, notes: settings.notes, ...extra,
    dueDate: addDays(today, 15 - (extra.ago ?? 3)),
  });

  const specs = [
    base(intra, 'tax', '08', 'INR', [line('Monthly IT support retainer', 1000000)], { ago: 12 }),
    base(inter, 'tax', '27', 'INR', [line('Software consulting – phase 1', 1000000)], { ago: 8 }),
    base(consumer, 'tax', '07', 'INR', [line('Website maintenance', 5000000)], { ago: 5 }),
    base(us, 'exp', '96', 'USD', [line('Software development services', 200000, { gstRate: 18 })], { ago: 2, exportMode: 'LUT', exchangeRate: 88.5, rateDate: addDays(today, -2) }),
  ];
  for (const s of specs) await issueInvoice(s, settings);
  // One draft to show on the dashboard.
  await saveDraft(base(intra, 'tax', '08', 'INR', [line('Quarterly review workshop', 2500000)], { ago: 0 }), settings);
}
