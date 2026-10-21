import { useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Field, Modal, MoneyInput } from './ui.jsx';
import { todayISO } from '../lib/dates.js';
import { fmtMoney } from '../lib/money.js';
import { markPaid } from '../lib/service.js';

export default function PaidModal({ invoice, onClose, onDone }) {
  const { notify } = useApp();
  const isExport = invoice.template === 'exp';
  const [p, setP] = useState({ date: todayISO(), amount: invoice.calc.totals.total, ref: '', inrRealised: invoice.calc.inr.total, brc: '' });
  const [err, setErr] = useState('');

  const save = async () => {
    if (!p.date) return setErr('Enter the payment date.');
    if (!(p.amount > 0)) return setErr('Enter the amount received.');
    if (isExport && invoice.currency !== 'INR' && !(p.inrRealised > 0)) return setErr('Enter the INR amount realised.');
    try { await markPaid(invoice.id, p); notify('Marked as paid.'); onDone(); } catch (e) { setErr(e.message); }
  };

  return (
    <Modal title={`Mark ${invoice.number} as paid`} onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="primary" onClick={save}>Mark as paid</button></>}>
      {err && <div className="alert error">{err}</div>}
      <div className="grid">
        <Field label="Date received"><input type="date" value={p.date} onChange={(e) => setP({ ...p, date: e.target.value })} /></Field>
        <Field label={`Amount received (${invoice.currency})`} hint={`Invoice total ${fmtMoney(invoice.calc.totals.total, invoice.currency)}`}><MoneyInput value={p.amount} onChange={(amount) => setP({ ...p, amount })} /></Field>
        <Field label="Payment reference" className="span2"><input value={p.ref} onChange={(e) => setP({ ...p, ref: e.target.value })} /></Field>
        {isExport && <>
          <Field label="INR amount realised"><MoneyInput value={p.inrRealised} onChange={(inrRealised) => setP({ ...p, inrRealised })} /></Field>
          <Field label="e-BRC / FIRC reference"><input value={p.brc} onChange={(e) => setP({ ...p, brc: e.target.value })} /></Field>
        </>}
      </div>
    </Modal>
  );
}
