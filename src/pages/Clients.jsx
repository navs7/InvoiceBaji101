import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Field, Modal } from '../components/ui.jsx';
import { CLIENT_TYPES, CURRENCIES, GST_RATES, SALUTATIONS, STATES, TEMPLATES, stateByCode } from '../config/gst.js';
import { db } from '../db/index.js';
import { gstinError, panError } from '../lib/gstin.js';
import { allowedTemplates } from '../lib/rules.js';
import { archiveClient, deleteClient } from '../lib/service.js';

const blank = (settings) => ({
  salutation: '', contact: '', name: '', emails: [''], phone: '', address: '', city: '', pin: '', country: 'India',
  type: 'b2b', stateCode: '', gstin: '', pan: '', taxId: '', currency: 'INR', template: 'tax',
  sac: settings.defaultSac || '', gstRate: 18, paymentTerms: settings.paymentTerms || '', notes: '', archived: false,
});

function validate(c) {
  const e = {};
  if (!c.name.trim()) e.name = 'Company / legal name is required.';
  if (!c.emails.some((x) => x.trim())) e.emails = 'Add at least one email address.';
  else if (c.emails.some((x) => x.trim() && !/^\S+@\S+\.\S+$/.test(x.trim()))) e.emails = 'One of the email addresses is not valid.';
  if (!c.address.trim()) e.address = 'Billing address is required.';
  if (c.type !== 'overseas') {
    if (!c.stateCode) e.stateCode = 'Choose the client’s state.';
    if (c.pin && !/^\d{6}$/.test(c.pin)) e.pin = 'PIN must be 6 digits.';
  } else if (!c.country.trim() || c.country.trim().toLowerCase() === 'india') e.country = 'Enter the client’s country.';
  if (c.type === 'b2b') {
    const g = gstinError(c.gstin, c.stateCode);
    if (g) e.gstin = g;
  }
  const p = panError(c.pan);
  if (p) e.pan = p;
  return e;
}

function ClientForm({ initial, settings, onSaved, onClose }) {
  const { notify } = useApp();
  const [c, setC] = useState(initial);
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setC((x) => ({ ...x, [k]: e.target.value }));
  const allowed = allowedTemplates(c.type, settings);

  const setType = (type) => setC((x) => {
    const al = allowedTemplates(type, settings);
    return {
      ...x, type, currency: type === 'overseas' ? (x.currency === 'INR' && x.type !== 'overseas' ? 'USD' : x.currency) : 'INR',
      country: type === 'overseas' ? (x.country === 'India' ? '' : x.country) : 'India',
      template: al[0] || '', gstin: type === 'b2b' ? x.gstin : '', pan: type === 'overseas' ? '' : x.pan,
    };
  });
  const setGstin = (e) => {
    const gstin = e.target.value.toUpperCase().replace(/\s/g, '');
    setC((x) => ({ ...x, gstin, stateCode: gstin.length >= 2 && stateByCode(gstin.slice(0, 2)) ? gstin.slice(0, 2) : x.stateCode, pan: gstin.length >= 12 ? gstin.slice(2, 12) : x.pan }));
  };
  const setEmail = (i, v) => setC((x) => ({ ...x, emails: x.emails.map((m, j) => (j === i ? v : m)) }));

  const save = async () => {
    const errs = validate(c);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      const saved = await db.put('clients', { ...c, emails: c.emails.map((x) => x.trim()).filter(Boolean), name: c.name.trim(), createdAt: c.createdAt || new Date().toISOString() });
      onSaved(saved);
    } catch (ex) { notify(ex.message, 'error'); }
  };

  return (
    <Modal title={c.id ? 'Edit client' : 'New client'} onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="primary" onClick={save}>Save client</button></>}>
      <div className="grid">
        <Field label="Client type" className="span2">
          <select value={c.type} onChange={(e) => setType(e.target.value)}>{Object.entries(CLIENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <Field label="Company / legal name" error={errors.name} className="span2"><input value={c.name} onChange={set('name')} /></Field>
        <Field label="Salutation"><select value={c.salutation} onChange={set('salutation')}>{SALUTATIONS.map((s) => <option key={s} value={s}>{s || '(none)'}</option>)}</select></Field>
        <Field label="Contact person"><input value={c.contact} onChange={set('contact')} /></Field>
        <Field label="Email addresses (first is primary)" error={errors.emails} className="span2">
          {c.emails.map((m, i) => (
            <div className="row" key={i} style={{ flexWrap: 'nowrap' }}>
              <input type="email" value={m} onChange={(e) => setEmail(i, e.target.value)} />
              {c.emails.length > 1 && <button className="sm" onClick={() => setC((x) => ({ ...x, emails: x.emails.filter((_, j) => j !== i) }))}>Remove</button>}
            </div>
          ))}
          <div><button className="sm" onClick={() => setC((x) => ({ ...x, emails: [...x.emails, ''] }))}>+ Add another email</button></div>
        </Field>
        <Field label="Phone"><input value={c.phone} onChange={set('phone')} /></Field>
        <Field label="Billing address" error={errors.address} className="span2"><input value={c.address} onChange={set('address')} /></Field>
        <Field label="City"><input value={c.city} onChange={set('city')} /></Field>
        <Field label={c.type === 'overseas' ? 'ZIP / postal code' : 'PIN'} error={errors.pin}><input value={c.pin} onChange={set('pin')} /></Field>
        {c.type === 'overseas'
          ? <Field label="Country" error={errors.country}><input value={c.country} onChange={set('country')} /></Field>
          : <Field label="State" error={errors.stateCode}>
              <select value={c.stateCode} onChange={set('stateCode')} disabled={c.type === 'b2b' && gstinError(c.gstin) === '' }>
                <option value="">Select…</option>{STATES.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              </select>
            </Field>}
        {c.type === 'b2b' && <Field label="GSTIN" error={errors.gstin} hint="State and PAN fill in automatically."><input maxLength={15} value={c.gstin} onChange={setGstin} /></Field>}
        {c.type !== 'overseas' && <Field label="PAN (optional)" error={errors.pan}><input maxLength={10} value={c.pan} onChange={(e) => setC({ ...c, pan: e.target.value.toUpperCase() })} /></Field>}
        {c.type === 'overseas' && <Field label="Foreign tax ID (VAT / EIN / ABN…)"><input value={c.taxId} onChange={set('taxId')} /></Field>}
        <Field label="Billing currency" hint={c.type === 'overseas' ? '' : 'Domestic clients are billed in INR.'}>
          <select value={c.currency} onChange={set('currency')} disabled={c.type !== 'overseas'}>{Object.keys(CURRENCIES).map((k) => <option key={k}>{k}</option>)}</select>
        </Field>
      </div>
      <h3>Invoice defaults</h3>
      <div className="grid">
        <Field label="Default template" hint={!allowed.length ? 'Composition suppliers cannot bill overseas clients.' : ''}>
          <select value={c.template} onChange={set('template')} disabled={!allowed.length}>{allowed.map((k) => <option key={k} value={k}>{TEMPLATES[k].short}</option>)}</select>
        </Field>
        <Field label="Default SAC"><input value={c.sac} onChange={set('sac')} /></Field>
        <Field label="Default GST rate">
          <select value={c.gstRate} onChange={(e) => setC({ ...c, gstRate: Number(e.target.value) })}>{GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</select>
        </Field>
        <Field label="Payment terms"><input value={c.paymentTerms} onChange={set('paymentTerms')} /></Field>
        <Field label="Notes" className="span2"><textarea value={c.notes} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}

export default function Clients() {
  const { settings, notify } = useApp();
  const [clients, setClients] = useState(null);
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = () => db.list('clients').then((l) => setClients(l.sort((a, b) => a.name.localeCompare(b.name))));
  useEffect(() => { load(); }, []);

  const shown = useMemo(() => (clients || []).filter((c) => (showArchived || !c.archived)
    && `${c.name} ${c.contact} ${c.gstin} ${c.emails?.join(' ')}`.toLowerCase().includes(q.toLowerCase())), [clients, q, showArchived]);

  const run = async (fn, msg) => { try { await fn(); await load(); notify(msg); } catch (e) { notify(e.message, 'error'); } };

  if (!clients) return <div className="muted">Loading…</div>;
  return (
    <>
      <div className="page-head">
        <h1>Clients</h1><div className="grow" />
        <input style={{ width: 220 }} placeholder="Search clients…  ( / )" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="check"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
        <button className="primary" onClick={() => setEditing(blank(settings))}>Add client</button>
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>GSTIN / Tax ID</th><th>State / Country</th><th>Currency</th><th /></tr></thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.name}</strong> {c.archived && <span className="badge">archived</span>}<div className="muted">{[c.salutation, c.contact].filter(Boolean).join(' ')} {c.emails?.[0]}</div></td>
                <td>{CLIENT_TYPES[c.type]}</td>
                <td className="mono">{c.gstin || c.taxId || '—'}</td>
                <td>{c.type === 'overseas' ? c.country : stateByCode(c.stateCode)?.label}</td>
                <td>{c.currency}</td>
                <td className="right nowrap">
                  <button className="sm" onClick={() => setEditing({ ...blank(settings), ...c, emails: c.emails?.length ? c.emails : [''] })}>Edit</button>{' '}
                  <button className="sm" onClick={() => run(() => archiveClient(c.id, !c.archived), c.archived ? 'Client restored.' : 'Client archived.')}>{c.archived ? 'Restore' : 'Archive'}</button>{' '}
                  <button className="sm danger" onClick={() => confirm(`Delete ${c.name}?`) && run(() => deleteClient(c.id), 'Client deleted.')}>Delete</button>
                </td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan="6" className="muted">No clients yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {editing && <ClientForm initial={editing} settings={settings} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); notify('Client saved.'); }} />}
    </>
  );
}
