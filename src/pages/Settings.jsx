import { useRef, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Field, fileToDataUrl, download, setIn } from '../components/ui.jsx';
import { STATES, DEFAULT_COMPOSITION_RATE } from '../config/gst.js';
import { db } from '../db/index.js';
import { loadSampleData } from '../db/seed.js';
import { fyStartYear, todayISO } from '../lib/dates.js';
import { gstinError, panError, panFromGstin } from '../lib/gstin.js';
import { prefixError } from '../lib/numbering.js';

function validate(s) {
  const e = {};
  if (!s.legalName?.trim()) e.legalName = 'Legal name is required.';
  if (!s.address?.trim()) e.address = 'Address is required.';
  if (!s.stateCode) e.stateCode = 'Choose your state.';
  if (!/^\d{6}$/.test(s.pin || '')) e.pin = 'PIN must be 6 digits.';
  const g = gstinError(s.gstin, s.stateCode);
  if (g) e.gstin = g;
  else if (s.pan && s.pan.toUpperCase() !== panFromGstin(s.gstin)) e.pan = 'PAN must match characters 3–12 of the GSTIN.';
  const p = panError(s.pan);
  if (p) e.pan = p;
  const rate = Number(s.compositionRate);
  if (s.regType === 'composition' && !(rate > 0 && rate < 100)) e.compositionRate = 'Enter a rate between 0 and 100.';
  for (const t of ['tax', 'bos', 'exp']) {
    const pe = prefixError(s.prefixes?.[t]);
    if (pe) e[`prefix_${t}`] = pe;
  }
  const l = s.lut || {};
  if (l.validFrom && l.validTo && l.validTo < l.validFrom) e.lutTo = 'Valid-to date is before valid-from.';
  if (s.email && !/^\S+@\S+\.\S+$/.test(s.email)) e.email = 'Enter a valid email address.';
  return e;
}

export default function Settings() {
  const { settings, reload, notify } = useApp();
  const [s, setS] = useState(settings);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const restoreRef = useRef();
  const set = (path) => (e) => setS((x) => setIn(x, path, e.target.type === 'checkbox' ? e.target.checked : e.target.value));
  const bind = (path, get) => ({ value: get(s) ?? '', onChange: set(path) });
  const g = (path) => (x) => path.split('.').reduce((o, k) => o?.[k], x);
  const inp = (path) => bind(path, g(path));

  const onGstin = (e) => {
    const gstin = e.target.value.toUpperCase().replace(/\s/g, '');
    setS((x) => ({ ...x, gstin, stateCode: gstin.length >= 2 && STATES.some((st) => st.code === gstin.slice(0, 2)) ? gstin.slice(0, 2) : x.stateCode, pan: gstin.length >= 12 ? panFromGstin(gstin) : x.pan }));
  };

  const image = (key, w, h) => async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { setS((x) => ({ ...x, [key]: undefined })); const url = await fileToDataUrl(f, w, h); setS((x) => ({ ...x, [key]: url })); } catch (ex) { notify(ex.message, 'error'); }
  };

  const save = async () => {
    const errs = validate(s);
    setErrors(errs);
    if (Object.keys(errs).length) { notify('Please fix the highlighted fields.', 'error'); return; }
    setBusy(true);
    try {
      await db.saveSettings({ ...s, gstin: s.gstin.toUpperCase(), pan: (s.pan || '').toUpperCase(), compositionRate: Number(s.compositionRate) || DEFAULT_COMPOSITION_RATE });
      await reload();
      notify('Settings saved.');
    } catch (ex) { notify(ex.message, 'error'); } finally { setBusy(false); }
  };

  const backup = async () => {
    download(`pixelsolutions-backup-${todayISO()}.json`, JSON.stringify(await db.exportAll(), null, 2), 'application/json');
  };
  const restore = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data.clients || !data.invoices) throw new Error('This file is not an Pixel Solutions backup.');
      if (!confirm('Restoring replaces ALL current data with the backup. Continue?')) return;
      await db.importAll(data);
      await reload();
      setS(await db.getSettings());
      notify('Backup restored.');
    } catch (ex) { notify(ex.message, 'error'); }
  };
  const sample = async () => {
    if (!confirm('This replaces your settings and adds sample clients and invoices. Continue?')) return;
    try { await loadSampleData(); await reload(); setS(await db.getSettings()); notify('Sample data loaded.'); } catch (ex) { notify(ex.message, 'error'); }
  };

  const fy = fyStartYear(todayISO());

  return (
    <>
      <div className="page-head"><h1>Settings</h1><div className="grow" /><button className="primary" disabled={busy} onClick={save}>Save settings</button></div>

      <div className="card">
        <h2>Business details</h2>
        <div className="grid">
          <Field label="Legal name" error={errors.legalName}><input {...inp('legalName')} /></Field>
          <Field label="Trade name"><input {...inp('tradeName')} /></Field>
          <Field label="Email" error={errors.email}><input type="email" {...inp('email')} /></Field>
          <Field label="Phone"><input {...inp('phone')} /></Field>
          <Field label="Address" className="span2" error={errors.address}><input {...inp('address')} /></Field>
          <Field label="State" error={errors.stateCode}>
            <select {...inp('stateCode')}><option value="">Select…</option>{STATES.map((st) => <option key={st.code} value={st.code}>{st.label}</option>)}</select>
          </Field>
          <Field label="PIN" error={errors.pin}><input inputMode="numeric" maxLength={6} {...inp('pin')} /></Field>
          <Field label="GSTIN" error={errors.gstin} hint="15 characters. The state and PAN fill in automatically."><input maxLength={15} value={s.gstin || ''} onChange={onGstin} /></Field>
          <Field label="PAN" error={errors.pan}><input maxLength={10} {...inp('pan')} /></Field>
          <Field label="Logo" hint="Shown at the top of every invoice.">
            <input type="file" accept="image/*" onChange={image('logo', 400, 160)} />
            {s.logo && <div className="row"><img src={s.logo} alt="Logo" height="40" /><button className="sm" onClick={() => setS({ ...s, logo: undefined })}>Remove</button></div>}
          </Field>
          <Field label="Authorised signatory"><input {...inp('signatory')} /></Field>
          <Field label="Signature image (optional)">
            <input type="file" accept="image/*" onChange={image('signature', 300, 120)} />
            {s.signature && <div className="row"><img src={s.signature} alt="Signature" height="36" /><button className="sm" onClick={() => setS({ ...s, signature: undefined })}>Remove</button></div>}
          </Field>
        </div>
      </div>

      <div className="card">
        <h2>GST registration</h2>
        <div className="grid">
          <Field label="Registration type">
            <select {...inp('regType')}><option value="regular">Regular</option><option value="composition">Composition</option></select>
          </Field>
          {s.regType === 'composition' && (
            <Field label="Composition rate (%)" error={errors.compositionRate} hint="6% for service providers (3% CGST + 3% SGST).">
              <input inputMode="decimal" {...inp('compositionRate')} />
            </Field>
          )}
          <Field label="Financial year starts"><input value="1 April" disabled /></Field>
          <label className="check span2"><input type="checkbox" checked={!!s.turnoverAbove5Cr} onChange={set('turnoverAbove5Cr')} /> My turnover exceeds ₹5 crore (SAC codes must be at least 6 digits instead of 4)</label>
        </div>
        {s.regType === 'composition' && <div className="alert warn" style={{ marginTop: 12 }}>With composition registration only Bills of Supply are issued, and only to clients in your own state. Confirm eligibility with your CA.</div>}
        <h3>Letter of Undertaking (exports without IGST)</h3>
        <div className="grid">
          <Field label="LUT ARN / reference"><input {...inp('lut.arn')} /></Field>
          <Field label="Financial year"><input placeholder={`${fy}-${String(fy + 1).slice(-2)}`} {...inp('lut.fy')} /></Field>
          <Field label="Valid from"><input type="date" {...inp('lut.validFrom')} /></Field>
          <Field label="Valid to" error={errors.lutTo}><input type="date" {...inp('lut.validTo')} /></Field>
        </div>
      </div>

      <div className="card">
        <h2>Bank details: INR receipts</h2>
        <div className="grid">
          <Field label="Account name"><input {...inp('bankInr.accountName')} /></Field>
          <Field label="Account number"><input {...inp('bankInr.number')} /></Field>
          <Field label="IFSC"><input {...inp('bankInr.ifsc')} /></Field>
          <Field label="Bank"><input {...inp('bankInr.bank')} /></Field>
          <Field label="Branch"><input {...inp('bankInr.branch')} /></Field>
        </div>
        <h3>Bank details: foreign receipts (printed on export invoices only)</h3>
        <div className="grid">
          <Field label="Account name"><input {...inp('bankForeign.accountName')} /></Field>
          <Field label="Account number / IBAN"><input {...inp('bankForeign.number')} /></Field>
          <Field label="SWIFT code"><input {...inp('bankForeign.swift')} /></Field>
          <Field label="Bank"><input {...inp('bankForeign.bank')} /></Field>
          <Field label="Branch"><input {...inp('bankForeign.branch')} /></Field>
          <Field label="Intermediary bank (optional)" className="span2"><input {...inp('bankForeign.intermediary')} /></Field>
        </div>
      </div>

      <div className="card">
        <h2>Invoice defaults</h2>
        <div className="grid">
          <Field label="Default SAC code"><input {...inp('defaultSac')} /></Field>
          <Field label="Default service description"><input {...inp('defaultSacDesc')} /></Field>
          <Field label="Default payment terms" hint="e.g. Net 15. The number of days sets the due date."><input {...inp('paymentTerms')} /></Field>
          <Field label="Default notes / terms" className="span2"><textarea {...inp('notes')} /></Field>
        </div>
        <h3>Invoice number prefixes</h3>
        <p className="muted">Numbers look like <code>INV/{String(fy).slice(-2)}-{String(fy + 1).slice(-2)}/001</code> and restart every 1 April. Maximum 16 characters.</p>
        <div className="grid">
          <Field label="Tax Invoice prefix" error={errors.prefix_tax}><input {...inp('prefixes.tax')} /></Field>
          <Field label="Bill of Supply prefix" error={errors.prefix_bos}><input {...inp('prefixes.bos')} /></Field>
          <Field label="Export invoice prefix" error={errors.prefix_exp}><input {...inp('prefixes.exp')} /></Field>
        </div>
        <p className="muted">Changing a prefix only affects invoices issued from now on.</p>
      </div>

      <div className="card">
        <h2>Backup and sample data</h2>
        <div className="row">
          <button onClick={backup}>Download backup (JSON)</button>
          <button onClick={() => restoreRef.current.click()}>Restore from backup…</button>
          <input ref={restoreRef} type="file" accept="application/json,.json" hidden onChange={restore} />
          <button onClick={sample}>Load sample data</button>
        </div>
      </div>
    </>
  );
}
