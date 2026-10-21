import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../AppContext.jsx';
import { db } from '../db/index.js';
import { loadSampleData } from '../db/seed.js';
import { addDays, fyOfDate, fyStartYear, inRange, todayISO } from '../lib/dates.js';
import { fmtMoney } from '../lib/money.js';
import { isCounted } from '../lib/reports.js';
import { lutValidOn } from '../lib/rules.js';

export default function Dashboard() {
  const { settings, configured, reload, notify } = useApp();
  const [invoices, setInvoices] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { db.list('invoices').then(setInvoices); }, []);
  if (!invoices) return <div className="muted">Loading…</div>;

  const today = todayISO();
  const month = { from: `${today.slice(0, 7)}-01`, to: `${today.slice(0, 7)}-31` };
  const live = invoices.filter(isCounted);
  const invoiced = live.filter((i) => inRange(i.date, month)).reduce((s, i) => s + i.calc.inr.total, 0);
  const unpaid = invoices.filter((i) => i.status === 'issued').reduce((s, i) => s + i.calc.inr.total, 0);
  const drafts = invoices.filter((i) => i.status === 'draft').length;

  const lut = settings.lut || {};
  const warnLut = settings.regType === 'regular' && (!lutValidOn(settings, today)
    ? true : lut.validTo < addDays(today, 30));
  const lutText = !lut.arn
    ? `No LUT is recorded for FY ${fyStartYear(today)}-${String(fyStartYear(today) + 1).slice(-2)}. Add your LUT details in Settings before invoicing exports without IGST.`
    : !lutValidOn(settings, today)
      ? `Your LUT (${lut.arn}) is not valid today. It covers ${lut.validFrom} to ${lut.validTo}. Renew it before invoicing exports without IGST.`
      : `Your LUT (${lut.arn}) expires on ${lut.validTo}. Renew it soon.`;

  const sample = async () => {
    if (!confirm('This replaces your settings with sample data and adds sample clients and invoices. Continue?')) return;
    setBusy(true);
    try { await loadSampleData(); await reload(); setInvoices(await db.list('invoices')); notify('Sample data loaded.'); } catch (e) { notify(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="page-head"><h1>Dashboard</h1><div className="grow" /><Link className="btn primary" to="/invoices/new">New invoice</Link></div>
      {!configured && (
        <div className="alert info">
          Welcome! Start by filling in <Link to="/settings">Settings</Link> with your business details, or{' '}
          <button className="link" disabled={busy} onClick={sample}>load sample data</button> to explore the app.
        </div>
      )}
      {warnLut && configured && <div className="alert warn">{lutText}</div>}
      <div className="stats">
        <div className="stat"><div className="muted">Invoiced this month</div><div className="n">{fmtMoney(invoiced)}</div></div>
        <div className="stat"><div className="muted">Unpaid</div><div className="n">{fmtMoney(unpaid)}</div></div>
        <div className="stat"><div className="muted">Drafts</div><div className="n">{drafts}</div></div>
      </div>
      <p className="muted">Financial year {fyOfDate(today)}. Amounts are in INR (exports at the invoice exchange rate).</p>
    </>
  );
}
