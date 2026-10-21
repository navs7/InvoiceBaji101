import { download } from '../components/ui.jsx';
import { fmtMoney } from './money.js';

// The PDF renderer is large, so it is loaded only when someone asks for a PDF.
const loadPdf = () => import('../components/InvoicePDF.jsx');

export async function pdfBlobUrl(inv, settings) {
  const { renderPdfBlob } = await loadPdf();
  return URL.createObjectURL(await renderPdfBlob(inv, settings));
}

export async function downloadInvoicePdf(inv, settings) {
  const { renderPdfBlob, pdfFileName } = await loadPdf();
  download(pdfFileName(inv), await renderPdfBlob(inv, settings));
}

function greeting(c) {
  const surname = (c.contact || '').trim().split(/\s+/).slice(-1)[0];
  if (c.salutation && c.salutation !== 'M/s.' && surname) return `Dear ${c.salutation} ${surname},`;
  return `Dear ${c.contact || c.name},`;
}

// Opens the user's mail client; the PDF is downloaded separately for attaching.
export async function sendInvoice(inv, settings) {
  await downloadInvoicePdf(inv, settings);
  const sup = inv.supplier || settings;
  const subject = `Invoice ${inv.number} from ${sup.tradeName || sup.legalName}`;
  const body = `${greeting(inv.client)}\n\nPlease find attached invoice ${inv.number} dated ${inv.date} for ${fmtMoney(inv.calc.totals.total, inv.currency)}.${inv.dueDate ? ` Payment is due by ${inv.dueDate}.` : ''}\n\nRegards,\n${sup.signatory || sup.tradeName || sup.legalName}`;
  const to = (inv.client.emails || []).join(',');
  window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
