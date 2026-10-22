import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../AppContext.jsx';
import { db } from '../db/index.js';
import { loadSampleData } from '../db/seed.js';
import { MONTHS, addDays, fyDisplay, fyOfDate, fyStartYear, inRange, todayISO } from '../lib/dates.js';
import { fmtMoney } from '../lib/money.js';
import { isCounted } from '../lib/reports.js';
import { lutValidOn } from '../lib/rules.js';

// 1,50,000 -> ₹1.5L ; 2,50,00,000 -> ₹2.5Cr
function compactInr(minor) {
  const r = minor / 100;
  const f = (n) => String(+n.toFixed(2));
  if (r >= 1e7) return `₹${f(r / 1e7)}Cr`;
  if (r >= 1e5) return `₹${f(r / 1e5)}L`;
  if (r >= 1e3) return `₹${f(r / 1e3)}K`;
  return `₹${f(r)}`;
}

// Round the axis maximum up to 1, 2, 2.5, 5 or 10 times a power of ten.
function niceMax(v) {
  if (v <= 0) return 100000;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= v);
}

const monthIndex = (iso) => (Number(iso.slice(5, 7)) + 8) % 12; // Apr = 0 ... Mar = 11

function fyStats(invoices, start) {
  const inFy = invoices.filter((i) => i.date && fyStartYear(i.date) === start);
  const live = inFy.filter(isCounted);
  const months = Array(12).fill(0);
  live.forEach((i) => { months[monthIndex(i.date)] += i.calc.inr.total; });
  return {
    invoiced: live.reduce((s, i) => s + i.calc.inr.total, 0),
    received: inFy.filter((i) => i.status === 'paid').reduce((s, i) => s + i.calc.inr.total, 0),
    unpaid: inFy.filter((i) => i.status === 'issued').reduce((s, i) => s + i.calc.inr.total, 0),
    count: live.length,
    months,
  };
}

function MonthlyChart({ cur, prev, curStart, prevStart }) {
  const [hover, setHover] = useState(null);
  const W = 720, H = 260, L = 52, R = 8, T = 12, B = 28;
  const max = niceMax(Math.max(...cur.months, ...prev.months));
  const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i);
  const plotW = W - L - R, plotH = H - T - B;
  const slot = plotW / 12, bar = Math.min(22, slot / 2.4);
  const y = (v) => T + plotH - (v / max) * plotH;
  const todayMonth = monthIndex(todayISO());
  const readout = hover == null
    ? 'Hover a month for the exact amounts.'
    : `${MONTHS[hover]}: ${fmtMoney(cur.months[hover])} in FY ${fyOfDate(`${curStart}-04-01`)}, ${fmtMoney(prev.months[hover])} in FY ${fyOfDate(`${prevStart}-04-01`)}`;

  return (
    <div className="card">
      <div className="page-head" style={{ marginBottom: 8 }}>
        <h2>Invoiced by month</h2><div className="grow" />
        <span className="legend"><i style={{ background: 'var(--brand)' }} />{fyDisplay(curStart)}</span>
        <span className="legend"><i style={{ background: 'var(--faint)', opacity: .55 }} />{fyDisplay(prevStart)}</span>
      </div>
      <p className="muted mono" style={{ margin: '0 0 8px', minHeight: 20, fontSize: 12 }}>{readout}</p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Month-wise invoiced amount, current and previous financial year" style={{ width: '100%', height: 'auto', display: 'block' }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--faint)" fontFamily="var(--mono)">{compactInr(t)}</text>
          </g>
        ))}
        {MONTHS.map((m, i) => {
          const cx = L + slot * i + slot / 2;
          const bars = [[prev.months[i], cx - bar - 1, 'var(--faint)', .55], [cur.months[i], cx + 1, 'var(--brand)', 1]];
          return (
            <g key={m} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={L + slot * i} y={T} width={slot} height={plotH} fill={hover === i ? 'var(--raised)' : 'transparent'} opacity=".6" />
              {bars.map(([v, x, fill, op], k) => v > 0 && <rect key={k} x={x} y={y(v)} width={bar} height={Math.max(1, y(0) - y(v))} rx="2" fill={fill} opacity={op} />)}
              <text x={cx} y={H - 8} textAnchor="middle" fontSize="11" fill={i === todayMonth ? 'var(--ink)' : 'var(--muted)'} fontWeight={i === todayMonth ? 600 : 400}>{m}</text>
              <title>{`${m}: ${fmtMoney(cur.months[i])} (${fyDisplay(curStart)}) vs ${fmtMoney(prev.months[i])} (${fyDisplay(prevStart)})`}</title>
            </g>
          );
        })}
      </svg>
      <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>Issued and paid invoices, in INR including GST.</p>
    </div>
  );
}

export default function Dashboard() {
  const { settings, configured, reload, notify } = useApp();
  const [invoices, setInvoices] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { db.list('invoices').then(setInvoices); }, []);
  const today = todayISO();
  const curStart = fyStartYear(today);
  const prevStart = curStart - 1;
  const cur = useMemo(() => invoices && fyStats(invoices, curStart), [invoices, curStart]);
  const prev = useMemo(() => invoices && fyStats(invoices, prevStart), [invoices, prevStart]);
  if (!invoices) return <div className="muted">Loading…</div>;

  const month = { from: `${today.slice(0, 7)}-01`, to: `${today.slice(0, 7)}-31` };
  const invoiced = invoices.filter(isCounted).filter((i) => inRange(i.date, month)).reduce((s, i) => s + i.calc.inr.total, 0);
  const unpaid = invoices.filter((i) => i.status === 'issued').reduce((s, i) => s + i.calc.inr.total, 0);
  const drafts = invoices.filter((i) => i.status === 'draft').length;

  const lut = settings.lut || {};
  const warnLut = settings.regType === 'regular' && (!lutValidOn(settings, today) ? true : lut.validTo < addDays(today, 30));
  const lutText = !lut.arn
    ? `No LUT is recorded for ${fyDisplay(curStart)}. Add your LUT details in Settings before invoicing exports without IGST.`
    : !lutValidOn(settings, today)
      ? `Your LUT (${lut.arn}) is not valid today. It covers ${lut.validFrom} to ${lut.validTo}. Renew it before invoicing exports without IGST.`
      : `Your LUT (${lut.arn}) expires on ${lut.validTo}. Renew it soon.`;

  const sample = async () => {
    if (!confirm('This replaces your settings with sample data and adds sample clients and invoices. Continue?')) return;
    setBusy(true);
    try { await loadSampleData(); await reload(); setInvoices(await db.list('invoices')); notify('Sample data loaded.'); } catch (e) { notify(e.message, 'error'); } finally { setBusy(false); }
  };

  const change = prev.invoiced ? Math.round(((cur.invoiced - prev.invoiced) / prev.invoiced) * 100) : null;
  const rows = [[fyDisplay(curStart), cur, true], [fyDisplay(prevStart), prev, false]];

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
        <div className="stat"><div className="muted">Unpaid (all time)</div><div className="n">{fmtMoney(unpaid)}</div></div>
        <div className="stat"><div className="muted">Drafts</div><div className="n">{drafts}</div></div>
      </div>

      <div className="card table-wrap">
        <table>
          <thead><tr><th>Financial year</th><th className="num">Invoiced</th><th className="num">Received</th><th className="num">Unpaid</th><th className="num">Invoices</th></tr></thead>
          <tbody>
            {rows.map(([label, s, isCur]) => (
              <tr key={label}>
                <td><strong>{label}</strong> {isCur && <span className="badge issued">current</span>}</td>
                <td className="num mono">{fmtMoney(s.invoiced)}</td>
                <td className="num mono">{fmtMoney(s.received)}</td>
                <td className="num mono">{fmtMoney(s.unpaid)}</td>
                <td className="num mono">{s.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {change != null && <p className="muted" style={{ marginTop: -4 }}>Invoiced so far is {change >= 0 ? 'up' : 'down'} {Math.abs(change)}% on the whole of the previous financial year.</p>}

      <MonthlyChart cur={cur} prev={prev} curStart={curStart} prevStart={prevStart} />
    </>
  );
}
