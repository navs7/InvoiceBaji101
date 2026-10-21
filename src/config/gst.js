// Every GST constant lives here: state codes, rates, CSV headers, declarations.
// The GST portal changes offline-tool headers occasionally; edit CSV_HEADERS only.

export const STATES = [
  ['01', 'Jammu & Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh'],
  ['05', 'Uttarakhand'], ['06', 'Haryana'], ['07', 'Delhi'], ['08', 'Rajasthan'],
  ['09', 'Uttar Pradesh'], ['10', 'Bihar'], ['11', 'Sikkim'], ['12', 'Arunachal Pradesh'],
  ['13', 'Nagaland'], ['14', 'Manipur'], ['15', 'Mizoram'], ['16', 'Tripura'],
  ['17', 'Meghalaya'], ['18', 'Assam'], ['19', 'West Bengal'], ['20', 'Jharkhand'],
  ['21', 'Odisha'], ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'], ['24', 'Gujarat'],
  ['26', 'Dadra & Nagar Haveli and Daman & Diu'], ['27', 'Maharashtra'], ['29', 'Karnataka'],
  ['30', 'Goa'], ['31', 'Lakshadweep'], ['32', 'Kerala'], ['33', 'Tamil Nadu'],
  ['34', 'Puducherry'], ['35', 'Andaman & Nicobar Islands'], ['36', 'Telangana'],
  ['37', 'Andhra Pradesh'], ['38', 'Ladakh'], ['97', 'Other Territory'],
].map(([code, name]) => ({ code, name, label: `${code}-${name}` }));

export const OTHER_COUNTRIES = { code: '96', name: 'Other Countries', label: '96-Other Countries' };

export const stateByCode = (code) =>
  STATES.find((s) => s.code === code) || (code === '96' ? OTHER_COUNTRIES : null);
export const posLabel = (code) => stateByCode(code)?.label || code || '';

export const GST_RATES = [0, 5, 18, 40];

export const CURRENCIES = {
  INR: { symbol: '₹', name: 'Rupees', minor: 'Paise', locale: 'en-IN' },
  USD: { symbol: '$', name: 'US Dollars', minor: 'Cents', locale: 'en-US' },
  EUR: { symbol: '€', name: 'Euros', minor: 'Cents', locale: 'en-IE' },
  GBP: { symbol: '£', name: 'Pounds Sterling', minor: 'Pence', locale: 'en-GB' },
  AUD: { symbol: 'A$', name: 'Australian Dollars', minor: 'Cents', locale: 'en-AU' },
  CAD: { symbol: 'C$', name: 'Canadian Dollars', minor: 'Cents', locale: 'en-CA' },
  SGD: { symbol: 'S$', name: 'Singapore Dollars', minor: 'Cents', locale: 'en-SG' },
  AED: { symbol: 'AED ', name: 'UAE Dirhams', minor: 'Fils', locale: 'en-AE' },
};

export const SALUTATIONS = ['', 'Mr.', 'Ms.', 'Mrs.', 'Dr.', 'M/s.'];

export const CLIENT_TYPES = {
  b2b: 'Domestic – Registered (B2B)',
  b2c: 'Domestic – Unregistered (B2C)',
  overseas: 'Overseas',
};

export const TEMPLATES = {
  tax: { key: 'tax', title: 'TAX INVOICE', short: 'Tax Invoice', series: 'INV' },
  bos: { key: 'bos', title: 'BILL OF SUPPLY', short: 'Bill of Supply', series: 'BOS' },
  exp: { key: 'exp', title: 'TAX INVOICE – EXPORT OF SERVICES', short: 'Export of Services', series: 'EXP' },
};

export const DECLARATIONS = {
  composition: 'Composition taxable person, not eligible to collect tax on supplies.',
  lut: 'SUPPLY MEANT FOR EXPORT UNDER LETTER OF UNDERTAKING WITHOUT PAYMENT OF INTEGRATED TAX',
  exportIgst: 'SUPPLY MEANT FOR EXPORT ON PAYMENT OF INTEGRATED TAX',
  forex: 'Payment to be received in convertible foreign exchange.',
  original: 'Original for Recipient',
};

export const B2CL_THRESHOLD_PAISE = 100000_00; // ₹1,00,000
export const UNREG_NAME_ADDRESS_THRESHOLD_PAISE = 50000_00; // ₹50,000
export const DEFAULT_COMPOSITION_RATE = 6;
export const MAX_INVOICE_NUMBER_LENGTH = 16;
export const DEFAULT_PREFIXES = { tax: 'INV', bos: 'BOS', exp: 'EXP' };
export const UQC_DEFAULT = 'OTH-OTHERS';

// Headers of the GSTR-1 offline utility CSV templates. Keep in sync with the portal.
export const CSV_HEADERS = {
  b2b: ['GSTIN/UIN of Recipient', 'Receiver Name', 'Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply', 'Reverse Charge', 'Applicable % of Tax Rate', 'Invoice Type', 'E-Commerce GSTIN', 'Rate', 'Taxable Value', 'Cess Amount'],
  b2cl: ['Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN'],
  b2cs: ['Type', 'Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN'],
  exp: ['Export Type', 'Invoice Number', 'Invoice date', 'Invoice Value', 'Port Code', 'Shipping Bill Number', 'Shipping Bill Date', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount'],
  hsn: ['HSN', 'Description', 'UQC', 'Total Quantity', 'Total Value', 'Rate', 'Taxable Value', 'Integrated Tax Amount', 'Central Tax Amount', 'State/UT Tax Amount', 'Cess Amount'],
  docs: ['Nature of Document', 'Sr. No. From', 'Sr. No. To', 'Total Number', 'Cancelled'],
  sales: ['Date', 'Number', 'Template', 'Client', 'GSTIN', 'Place of Supply', 'Currency', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Total', 'Status'],
  exports: ['Invoice Number', 'Date', 'Client', 'Country', 'Currency', 'Foreign Amount', 'Exchange Rate', 'INR Value', 'Export Mode', 'Amount Realised (INR)', 'Realisation Date', 'e-BRC / FIRC Reference'],
};
