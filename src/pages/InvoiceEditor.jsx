import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../AppContext.jsx';
import PaidModal from '../components/PaidModal.jsx';
import { Badge, Field, Modal, MoneyInput } from '../components/ui.jsx';
import { CURRENCIES, GST_RATES, STATES, TEMPLATES, posLabel } from '../config/gst.js';
import { db } from '../db/index.js';
import { addDays, dmy, fyRange, fyStartYear, parseTermsDays, todayISO } from '../lib/dates.js';
import { amountInWords, fmtMoney } from '../lib/money.js';
import { downloadInvoicePdf, pdfBlobUrl, sendInvoice } from '../lib/pdfActions.js';
import { allowedTemplates, dueDateWarning, invoiceErrors, isComposition } from '../lib/rules.js';
import { cancelInvoice, clientSnapshot, duplicateInvoice, issueInvoice, recalc, saveDraft, updateIssued } from '../lib/service.js';

const newLine = (settings, client) => ({
  id: Math.random().toString(36).slice(2), desc: settings.defaultSacDesc || '', sac: client?.sac || settings.defaultSac || '',
  qty: 1, unit: 'OTH', rate: 0, discount: 0, gstRate: client?.gstRate ?? 18,
});

const blankInvoice = (settings) => {
  const date = todayISO();
  return {
    status: 'draft', template: null, clientId: '', client: null, currency: 'INR', pos: '', reverseCharge: false,
    exportMode: 'LUT', exchangeRate: '', rateDate: date, date, paymentTerms: settings.paymentTerms || '',
    dueDate: addDays(date, parseTermsDays(settings.paymentTerms)), lines: [newLine(settings)], notes: settings.notes || '', terms: '',
  };
};

const normalize = (inv) => ({ ...inv, exchangeRate: inv.exchangeRate === '' ? '' : Number(inv.exchangeRate), lines: inv.lines.map((l) => ({ ...l, qty: Number(l.qty) || 0 })) });

function PreviewModal({ inv, settings, onClose }) {
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let u;
    pdfBlobUrl(inv, settings).then((x) => { u = x; setUrl(x); }).catch((e) => setErr(e.message));
    return () => u && URL.revokeObjectURL(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Modal title="PDF preview" wide onClose={onClose}>
      {err ? <div className="alert error">Could not build the PDF: {err}</div> : url ? <iframe className="preview" title="Invoice PDF" src={url} /> : <div className="muted">Building PDF…</div>}
    </Modal>
  );
}

function ReadOnly({ inv, onChanged }) {
  const { settings, notify } = useApp();
  const nav = useNavigate();
  const [paying, setPaying] = useState(false);
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let u;
    pdfBlobUrl(inv, settings).then((x) => { u = x; setUrl(x); }).catch((e) => notify(`PDF failed: ${e.message}`, 'error'));
    return () => u && URL.revokeObjectURL(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv.id, inv.status]);
  const run = async (fn, msg) => { try { await fn(); if (msg) notify(msg); } catch (e) { notify(e.message, 'error'); } };

  return (
    <>
      <div className="page-head">
        <h1>{inv.number}</h1><Badge status={inv.status} /><div className="grow" />
        <button onClick={() => run(() => downloadInvoicePdf(inv, settings))}>Download PDF</button>
        <button onClick={() => run(() => sendInvoice(inv, settings))}>Send…</button>
        <button onClick={() => run(async () => { const c = await duplicateInvoice(inv.id); nav(`/invoices/${c.id}`); }, 'Duplicated as a new draft.')}>Duplicate</button>
        {['issued', 'paid'].includes(inv.status) && <button onClick={() => nav(`/invoices/${inv.id}?edit=1`)}>Edit</button>}
        {inv.status === 'issued' && <button className="primary" onClick={() => setPaying(true)}>Mark as paid</button>}
        {['issued', 'paid'].includes(inv.status) && (
          <button className="danger" onClick={() => confirm(`Cancel ${inv.number}? The number stays in your series and is reported as cancelled.`) && run(async () => { await cancelInvoice(inv.id); onChanged(); }, 'Invoice cancelled.')}>Cancel invoice</button>
        )}
      </div>
      {inv.status === 'cancelled' && <div className="alert error">This invoice was cancelled. Its number is kept and reported as cancelled. Issue a new invoice to replace it.</div>}
      {inv.payment && (
        <div className="alert info">
          Paid on {dmy(inv.payment.date)}: {fmtMoney(inv.payment.amount, inv.currency)}{inv.payment.ref ? `, ref ${inv.payment.ref}` : ''}.
          {inv.template === 'exp' && ` Realised ${fmtMoney(inv.payment.inrRealised)}${inv.payment.brc ? `, e-BRC/FIRC ${inv.payment.brc}` : ''}.`}
        </div>
      )}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {url ? <iframe className="preview" style={{ height: '78vh' }} title="Invoice PDF" src={url} /> : <div className="muted" style={{ padding: 16 }}>Building PDF…</div>}
      </div>
      {paying && <PaidModal invoice={inv} onClose={() => setPaying(false)} onDone={() => { setPaying(false); onChanged(); }} />}
    </>
  );
}

export default function InvoiceEditor() {
  const { id } = useParams();
  const { settings, notify } = useApp();
  const nav = useNavigate();
  const [inv, setInv] = useState(null);
  const [clients, setClients] = useState([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [showErrors, setShowErrors] = useState(false); // validation list appears only after a save or issue attempt
  const [sp] = useSearchParams();
  const isNew = id === 'new';

  const load = async () => {
    setClients((await db.list('clients')).filter((c) => !c.archived).sort((a, b) => a.name.localeCompare(b.name)));
    if (isNew) { setInv(blankInvoice(settings)); return; }
    const x = await db.get('invoices', id);
    if (!x) { notify('Invoice not found.', 'error'); nav('/invoices'); return; }
    setInv(x);
  };
  useEffect(() => { setInv(null); load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const isDraft = inv?.status === 'draft';
  // Issued or paid invoices can be amended in place via ?edit=1; number, series and template stay fixed.
  const amending = !!inv && ['issued', 'paid'].includes(inv.status) && sp.get('edit') === '1';
  const view = useMemo(() => (inv && (isDraft || amending) ? recalc(normalize(inv), amending ? inv.supplier || settings : settings) : inv), [inv, settings, isDraft, amending]);
  if (!inv) return <div className="muted">Loading…</div>;
  if (!isDraft && !amending) return <ReadOnly inv={inv} onChanged={load} />;
  const sup = amending ? inv.supplier || settings : settings;
  const fy = amending ? fyRange(fyStartYear(inv.date)) : null;

  const set = (patch) => setInv((x) => ({ ...x, ...patch }));
  const allowed = inv.client ? allowedTemplates(inv.client.type, settings) : [];
  const calc = view.calc;
  const errors = inv.client ? invoiceErrors(view, sup) : [];
  const showTaxRate = inv.template === 'tax' || inv.template === 'exp';
  const comp = isComposition(settings);

  const pickClient = (cid) => {
    const c = clients.find((x) => x.id === cid);
    if (!c) { set({ clientId: '', client: null, template: null }); return; }
    const al = allowedTemplates(c.type, settings);
    const template = al.includes(c.template) ? c.template : al[0] || null;
    const rate = settings.lastRates?.[c.currency];
    const terms = c.paymentTerms || settings.paymentTerms || '';
    setInv((x) => ({
      ...x, clientId: c.id, client: clientSnapshot(c), template, currency: c.currency,
      pos: c.type === 'overseas' ? '96' : c.stateCode,
      exchangeRate: c.currency === 'INR' ? '' : (rate?.rate ?? ''), rateDate: rate?.date || x.rateDate,
      paymentTerms: terms, dueDate: addDays(x.date, parseTermsDays(terms)),
      notes: c.notes || x.notes,
      lines: x.lines.map((l) => (l.rate ? l : { ...l, sac: c.sac || l.sac, gstRate: c.gstRate ?? l.gstRate })),
    }));
  };
  const pickTemplate = (t) => set({ template: t, pos: t === 'exp' ? '96' : (inv.pos === '96' ? inv.client.stateCode : inv.pos) });
  const setLine = (i, patch) => setInv((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  const doSave = async (quiet) => {
    const saved = await saveDraft(normalize(inv), settings);
    if (!quiet) notify('Draft saved.');
    if (isNew) nav(`/invoices/${saved.id}`, { replace: true }); else setInv(saved);
    return saved;
  };
  const guard = async (fn) => { setBusy(true); try { await fn(); } catch (e) { notify(e.message, 'error'); } finally { setBusy(false); } };
  const save = () => guard(async () => {
    setShowErrors(true); if (!inv.client) throw new Error('Choose a client first.'); await doSave(); });
  const saveAmendment = () => guard(async () => {
    setShowErrors(true);
    if (errors.length) throw new Error('Fix the problems listed above before saving.');
    if (inv.date < fy.from || inv.date > fy.to) throw new Error(`The invoice date must stay inside ${inv.fy}, the financial year of its number.`);
    const paidWarning = inv.status === 'paid' && view.calc.totals.total !== inv.calc.totals.total ? ' This invoice is marked paid and the total is changing, so check the recorded payment.' : '';
    if (!confirm(`Save changes to ${inv.number}? If this invoice is already in a filed GST return, a credit/debit note is the correct way to amend it.${paidWarning}`)) return;
    await updateIssued(normalize(inv));
    notify(`Saved changes to ${inv.number}.`);
    nav(`/invoices/${inv.id}`, { replace: true });
  });
  const issue = () => guard(async () => {
    setShowErrors(true);
    if (errors.length) throw new Error('Fix the problems listed above before issuing.');
    if (!confirm('Issue this invoice? It gets its number now and can no longer be edited.')) return;
    const done = await issueInvoice(normalize(inv), settings);
    notify(`Issued ${done.number}.`);
    nav(`/invoices/${done.id}`, { replace: true });
  });

  return (
    <>
      <div className="page-head">
        <h1>{amending ? `Edit ${inv.number}` : isNew ? 'New invoice' : 'Draft invoice'}</h1><Badge status={inv.status} /><div className="grow" />
        <button disabled={!inv.client || !inv.template} onClick={() => setPreview(true)}>Preview PDF</button>
        {amending ? (
          <>
            <button onClick={() => nav(`/invoices/${inv.id}`)}>Discard changes</button>
            <button className="primary" disabled={busy} onClick={saveAmendment}>Save changes</button>
          </>
        ) : (
          <>
            <button disabled={busy} onClick={save}>Save draft</button>
            <button className="primary" disabled={busy || !inv.client || !inv.template} onClick={issue}>Issue invoice</button>
          </>
        )}
      </div>
      {comp && <div className="alert warn">You are registered under the Composition scheme: only Bills of Supply to clients in {settings.stateCode ? posLabel(settings.stateCode) : 'your state'} are allowed.</div>}
      {amending && <div className="alert warn">You are editing an issued invoice. The number, series and template stay the same. Amending an invoice that is already in a filed GST return should be done with a credit/debit note instead.</div>}
      {showErrors && errors.length > 0 && (
        <div className="alert error"><strong>{amending ? 'Before these changes can be saved:' : 'Before this can be issued:'}</strong><ul>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>
      )}

      <div className="card">
        <h2>Details</h2>
        <div className="grid">
          <Field label="Client">
            <select value={inv.clientId} onChange={(e) => pickClient(e.target.value)}>
              <option value="">Select a client…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Template" hint={inv.client && !allowed.length ? 'No template is allowed for this client.' : ''}>
            <select value={inv.template || ''} disabled={allowed.length < 2 || amending} onChange={(e) => pickTemplate(e.target.value)}>
              {!inv.template && <option value="">—</option>}
              {(allowed.length ? allowed : [inv.template].filter(Boolean)).map((k) => <option key={k} value={k}>{TEMPLATES[k].short}</option>)}
            </select>
          </Field>
          <Field label="Invoice date"><input type="date" value={inv.date} min={fy?.from} max={fy?.to} onChange={(e) => set({ date: e.target.value, dueDate: addDays(e.target.value, parseTermsDays(inv.paymentTerms)) })} /></Field>
          <Field label="Payment terms"><input value={inv.paymentTerms} onChange={(e) => set({ paymentTerms: e.target.value, dueDate: addDays(inv.date, parseTermsDays(e.target.value)) })} /></Field>
          <Field label="Due date" error={dueDateWarning(inv)}><input type="date" value={inv.dueDate} onChange={(e) => set({ dueDate: e.target.value })} /></Field>
          <Field label="Place of supply">
            <select value={inv.pos} disabled={inv.template !== 'tax'} onChange={(e) => set({ pos: e.target.value })}>
              {inv.template === 'exp' && <option value="96">96-Other Countries</option>}
              {!inv.pos && <option value="">Select…</option>}
              {STATES.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
          </Field>
          {inv.template === 'tax' && (
            <Field label="Tax payable on reverse charge">
              <select value={inv.reverseCharge ? 'Y' : 'N'} onChange={(e) => set({ reverseCharge: e.target.value === 'Y' })}><option value="N">No</option><option value="Y">Yes</option></select>
            </Field>
          )}
          {inv.template === 'exp' && (
            <>
              <Field label="Export mode">
                <select value={inv.exportMode} onChange={(e) => set({ exportMode: e.target.value })}>
                  <option value="LUT">Under LUT (without IGST)</option><option value="IGST">With IGST payment</option>
                </select>
              </Field>
              <Field label="Currency"><input value={`${inv.currency} (${CURRENCIES[inv.currency]?.name || ''})`} disabled /></Field>
              {inv.currency !== 'INR' && (
                <>
                  <Field label={`Exchange rate: 1 ${inv.currency} = ₹`} hint="Entered manually. Defaults to the last rate you used."><input inputMode="decimal" value={inv.exchangeRate} onChange={(e) => set({ exchangeRate: e.target.value })} /></Field>
                  <Field label="Rate date"><input type="date" value={inv.rateDate} onChange={(e) => set({ rateDate: e.target.value })} /></Field>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Line items</h2>
        <div className="table-wrap">
          <table className="lines">
            <thead><tr><th>Description</th><th style={{ width: 90 }}>SAC</th><th style={{ width: 70 }}>Qty</th><th style={{ width: 64 }}>Unit</th><th style={{ width: 110 }}>Rate ({inv.currency})</th><th style={{ width: 100 }}>Discount</th>{showTaxRate && <th style={{ width: 78 }}>GST %</th>}<th className="num" style={{ width: 110 }}>Taxable</th><th /></tr></thead>
            <tbody>
              {inv.lines.map((l, i) => (
                <tr key={l.id}>
                  <td><input value={l.desc} onChange={(e) => setLine(i, { desc: e.target.value })} /></td>
                  <td><input inputMode="numeric" value={l.sac} onChange={(e) => setLine(i, { sac: e.target.value.replace(/\D/g, '') })} /></td>
                  <td><input type="number" min="0" step="any" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} /></td>
                  <td><input value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value.toUpperCase() })} /></td>
                  <td><MoneyInput value={l.rate} onChange={(rate) => setLine(i, { rate })} /></td>
                  <td><MoneyInput value={l.discount} onChange={(discount) => setLine(i, { discount })} /></td>
                  {showTaxRate && <td><select value={l.gstRate} onChange={(e) => setLine(i, { gstRate: Number(e.target.value) })}>{GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</select></td>}
                  <td className="num nowrap">{fmtMoney(calc.lines[i].taxable, inv.currency)}</td>
                  <td><button className="sm" disabled={inv.lines.length === 1} onClick={() => setInv((x) => ({ ...x, lines: x.lines.filter((_, j) => j !== i) }))} aria-label="Remove line">×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p><button className="sm" onClick={() => setInv((x) => ({ ...x, lines: [...x.lines, newLine(settings, x.client && clients.find((c) => c.id === x.clientId))] }))}>+ Add line</button></p>

        <div className="totals">
          <div><span>Taxable value</span><span>{fmtMoney(calc.totals.taxable, inv.currency)}</span></div>
          {calc.totals.byRate.map((g) => (
            <div key={g.rate} style={{ display: 'contents' }}>
              {g.cgst > 0 && <><div><span>CGST @ {g.rate / 2}%</span><span>{fmtMoney(g.cgst, inv.currency)}</span></div><div><span>SGST @ {g.rate / 2}%</span><span>{fmtMoney(g.sgst, inv.currency)}</span></div></>}
              {g.igst > 0 && <div><span>IGST @ {g.rate}%</span><span>{fmtMoney(g.igst, inv.currency)}</span></div>}
            </div>
          ))}
          {calc.totals.roundOff !== 0 && <div><span>Round off</span><span>{fmtMoney(calc.totals.roundOff, inv.currency)}</span></div>}
          <div className="grand"><span>Total</span><span>{fmtMoney(calc.totals.total, inv.currency)}</span></div>
          {inv.currency !== 'INR' && Number(inv.exchangeRate) > 0 && <div className="muted"><span>INR equivalent (taxable)</span><span>{fmtMoney(calc.inr.taxable)}</span></div>}
        </div>
        <p className="muted right">{amountInWords(calc.totals.total, inv.currency)}</p>
      </div>

      <div className="card">
        <h2>Notes</h2>
        <div className="grid c2">
          <Field label="Notes"><textarea value={inv.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
          <Field label="Terms"><textarea value={inv.terms} onChange={(e) => set({ terms: e.target.value })} /></Field>
        </div>
      </div>
      {preview && inv.client && <PreviewModal inv={recalc(normalize(inv), settings)} settings={settings} onClose={() => setPreview(false)} />}
    </>
  );
}
