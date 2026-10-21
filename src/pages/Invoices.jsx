import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../AppContext.jsx';
import PaidModal from '../components/PaidModal.jsx';
import { Badge } from '../components/ui.jsx';
import { TEMPLATES } from '../config/gst.js';
import { db } from '../db/index.js';
import { dmy } from '../lib/dates.js';
import { fmtMoney } from '../lib/money.js';
import { downloadInvoicePdf } from '../lib/pdfActions.js';
import { cancelInvoice, deleteDraft, duplicateInvoice } from '../lib/service.js';

export default function Invoices() {
  const { settings, notify } = useApp();
  const nav = useNavigate();
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [paying, setPaying] = useState(null);

  const load = () => db.list('invoices').then(setList);
  useEffect(() => { load(); }, []);

  const shown = useMemo(() => (list || [])
    .filter((i) => (!status || i.status === status) && `${i.number || ''} ${i.client?.name}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '')), [list, q, status]);

  const run = async (fn, msg) => { try { const r = await fn(); await load(); if (msg) notify(msg); return r; } catch (e) { notify(e.message, 'error'); } };

  if (!list) return <div className="muted">Loading…</div>;
  return (
    <>
      <div className="page-head">
        <h1>Invoices</h1><div className="grow" />
        <input style={{ width: 200 }} placeholder="Search…  ( / )" value={q} onChange={(e) => setQ(e.target.value)} />
        <select style={{ width: 140 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>{['draft', 'issued', 'paid', 'cancelled'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <Link className="btn primary" to="/invoices/new">New invoice</Link>
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Number</th><th>Date</th><th>Client</th><th>Template</th><th className="num">Amount</th><th>Status</th><th /></tr></thead>
          <tbody>
            {shown.map((i) => (
              <tr key={i.id} className="link-row" onClick={() => nav(`/invoices/${i.id}`)}>
                <td className="mono"><strong>{i.number || 'Draft'}</strong></td>
                <td className="nowrap">{dmy(i.date)}</td>
                <td>{i.client?.name}</td>
                <td>{TEMPLATES[i.template]?.short}</td>
                <td className="num nowrap">{fmtMoney(i.calc.totals.total, i.currency)}{i.currency !== 'INR' && <div className="muted">{fmtMoney(i.calc.inr.total)}</div>}</td>
                <td><Badge status={i.status} /></td>
                <td className="right nowrap" onClick={(e) => e.stopPropagation()}>
                  {i.status !== 'draft' && <button className="sm" onClick={() => run(() => downloadInvoicePdf(i, settings))}>PDF</button>}{' '}
                  <button className="sm" onClick={async () => { const c = await run(() => duplicateInvoice(i.id), 'Duplicated as a new draft.'); if (c) nav(`/invoices/${c.id}`); }}>Duplicate</button>{' '}
                  {i.status === 'issued' && <button className="sm" onClick={() => setPaying(i)}>Mark paid</button>}{' '}
                  {['issued', 'paid'].includes(i.status) && <button className="sm danger" onClick={() => confirm(`Cancel ${i.number}? The number stays in your series and is reported as cancelled.`) && run(() => cancelInvoice(i.id), 'Invoice cancelled.')}>Cancel</button>}
                  {i.status === 'draft' && <button className="sm danger" onClick={() => confirm('Delete this draft?') && run(() => deleteDraft(i.id), 'Draft deleted.')}>Delete</button>}
                </td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan="7" className="muted">No invoices found.</td></tr>}
          </tbody>
        </table>
      </div>
      {paying && <PaidModal invoice={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); load(); }} />}
    </>
  );
}
