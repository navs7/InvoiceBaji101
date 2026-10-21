import JSZip from 'jszip';
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { download } from '../components/ui.jsx';
import { posLabel } from '../config/gst.js';
import { db } from '../db/index.js';
import { MONTHS, QUARTERS, fyDisplay, fyStartYear, monthRange, quarterRange, todayISO } from '../lib/dates.js';
import { toCsv } from '../lib/csv.js';
import { fmtMoney } from '../lib/money.js';
import { buildComposition, buildExportRegister, buildGstr1, buildGstr3b, buildSalesRegister } from '../lib/reports.js';

function Dataset({ title, note, set, file }) {
  return (
    <div className="card">
      <div className="page-head" style={{ marginBottom: 8 }}>
        <h2>{title}</h2><span className="muted">{set.rows.length} row{set.rows.length === 1 ? '' : 's'}</span><div className="grow" />
        <button className="sm" disabled={!set.rows.length && false} onClick={() => download(file, toCsv(set.headers, set.rows))}>Download CSV</button>
      </div>
      {note && <p className="muted" style={{ marginTop: 0 }}>{note}</p>}
      {set.rows.length ? (
        <div className="table-wrap">
          <table>
            <thead><tr>{set.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{set.rows.slice(0, 50).map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{String(v)}</td>)}</tr>)}</tbody>
          </table>
          {set.rows.length > 50 && <p className="muted">Showing the first 50 rows. The CSV has all {set.rows.length}.</p>}
        </div>
      ) : <p className="muted">Nothing to report for this period.</p>}
    </div>
  );
}

const Row = ({ label, v }) => <tr><td>{label}</td>{v.map((x, i) => <td key={i} className="num">{fmtMoney(x)}</td>)}</tr>;

export default function Reports() {
  const { settings } = useApp();
  const comp = settings.regType === 'composition';
  const [invoices, setInvoices] = useState(null);
  const today = todayISO();
  const [fy, setFy] = useState(fyStartYear(today));
  const [period, setPeriod] = useState(comp ? Math.floor(((Number(today.slice(5, 7)) + 8) % 12) / 3) : (Number(today.slice(5, 7)) + 8) % 12);
  const [tab, setTab] = useState(comp ? 'comp' : 'gstr1');

  useEffect(() => { db.list('invoices').then(setInvoices); }, []);
  const years = useMemo(() => {
    const ys = new Set([fyStartYear(today)]);
    (invoices || []).forEach((i) => i.date && ys.add(fyStartYear(i.date)));
    return [...ys].sort((a, b) => b - a);
  }, [invoices, today]);

  const range = comp ? quarterRange(fy, period) : monthRange(fy, period);
  const gstr1 = useMemo(() => invoices && buildGstr1(invoices, settings, range), [invoices, settings, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!invoices) return <div className="muted">Loading…</div>;

  const g3b = buildGstr3b(invoices, settings, range);
  const periodLabel = comp ? `${QUARTERS[period]} ${fyDisplay(fy)}` : `${MONTHS[period]} ${fyDisplay(fy)}`;
  const tag = `${range.from.slice(0, 7)}`;

  const zip = async () => {
    const z = new JSZip();
    Object.entries(gstr1).forEach(([k, v]) => z.file(`${k}.csv`, toCsv(v.headers, v.rows)));
    download(`gstr1-${tag}.zip`, await z.generateAsync({ type: 'blob' }));
  };

  const tabs = comp
    ? [['comp', 'Composition (CMP-08 / GSTR-4)'], ['reg', 'Registers']]
    : [['gstr1', 'GSTR-1'], ['gstr3b', 'GSTR-3B'], ['reg', 'Registers']];

  return (
    <>
      <div className="page-head">
        <h1>Reports</h1><div className="grow" />
        <select style={{ width: 150 }} value={fy} onChange={(e) => setFy(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{fyDisplay(y)}</option>)}</select>
        <select style={{ width: 150 }} value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
          {(comp ? QUARTERS : MONTHS).map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
      </div>
      <p className="muted">Period: {periodLabel} ({range.from} to {range.to}). Only issued and paid invoices count; cancelled ones appear in the documents table and registers. All amounts are in INR.</p>
      <div className="tabs">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>

      {tab === 'gstr1' && (
        <>
          <div className="row" style={{ marginBottom: 12 }}><button className="primary" onClick={zip}>Download all (ZIP)</button><span className="muted">b2b, b2cl, b2cs, exp, hsn_b2b, hsn_b2c and docs</span></div>
          <Dataset title="B2B (Table 4A)" set={gstr1.b2b} file={`b2b-${tag}.csv`} />
          <Dataset title="B2C Large (Table 5)" note="Inter-state supplies to unregistered clients with invoice value above ₹1,00,000." set={gstr1.b2cl} file={`b2cl-${tag}.csv`} />
          <Dataset title="B2C Small (Table 7)" note="All other unregistered supplies, aggregated by place of supply and rate." set={gstr1.b2cs} file={`b2cs-${tag}.csv`} />
          <Dataset title="Exports (Table 6A)" note="Under LUT the rate is 0 and the export type is WOPAY; with IGST payment it is WPAY." set={gstr1.exp} file={`exp-${tag}.csv`} />
          <Dataset title="HSN/SAC summary: B2B (Table 12)" set={gstr1.hsn_b2b} file={`hsn_b2b-${tag}.csv`} />
          <Dataset title="HSN/SAC summary: B2C incl. exports (Table 12)" set={gstr1.hsn_b2c} file={`hsn_b2c-${tag}.csv`} />
          <Dataset title="Documents issued (Table 13)" set={gstr1.docs} file={`docs-${tag}.csv`} />
        </>
      )}

      {tab === 'gstr3b' && (
        <div className="card table-wrap">
          <h2>GSTR-3B helper</h2>
          <table>
            <thead><tr><th /><th className="num">Taxable value</th><th className="num">IGST</th><th className="num">CGST</th><th className="num">SGST</th></tr></thead>
            <tbody>
              <tr><td colSpan="5"><strong>3.1(a) Outward taxable supplies (other than zero-rated)</strong></td></tr>
              <Row label="Total" v={[g3b.a31a.taxable, g3b.a31a.igst, g3b.a31a.cgst, g3b.a31a.sgst]} />
              <tr><td colSpan="5"><strong>3.1(b) Zero-rated supplies (exports)</strong></td></tr>
              <Row label="Total" v={[g3b.a31b.taxable, g3b.a31b.igst, 0, 0]} />
              <tr><td colSpan="5"><strong>3.2 Inter-state supplies to unregistered persons, by place of supply</strong></td></tr>
              {g3b.s32.map((r) => <Row key={r.pos} label={posLabel(r.pos)} v={[r.taxable, r.igst, 0, 0]} />)}
              {!g3b.s32.length && <tr><td colSpan="5" className="muted">None in this period.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'comp' && <Composition invoices={invoices} settings={settings} fy={fy} period={period} />}

      {tab === 'reg' && (
        <>
          <Dataset title="Sales register" set={buildSalesRegister(invoices, range)} file={`sales-register-${tag}.csv`} />
          <Dataset title="Export register" set={buildExportRegister(invoices, range)} file={`export-register-${tag}.csv`} />
        </>
      )}
    </>
  );
}

function Composition({ invoices, settings, fy, period }) {
  const q = buildComposition(invoices, settings, quarterRange(fy, period));
  const quarters = QUARTERS.map((name, i) => ({ name, ...buildComposition(invoices, settings, quarterRange(fy, i)) }));
  const total = quarters.reduce((a, x) => ({ turnover: a.turnover + x.turnover, total: a.total + x.total, cgst: a.cgst + x.cgst, sgst: a.sgst + x.sgst }), { turnover: 0, total: 0, cgst: 0, sgst: 0 });
  const rows = [...quarters, { name: `${fyDisplay(fy)} total`, ...total }];
  return (
    <>
      <div className="card">
        <h2>CMP-08 quarterly summary: {QUARTERS[period]}</h2>
        <div className="stats">
          <div className="stat"><div className="muted">Outward turnover</div><div className="n">{fmtMoney(q.turnover)}</div></div>
          <div className="stat"><div className="muted">Tax at {q.rate}%</div><div className="n">{fmtMoney(q.total)}</div></div>
          <div className="stat"><div className="muted">CGST / SGST</div><div className="n">{fmtMoney(q.cgst)} / {fmtMoney(q.sgst)}</div></div>
        </div>
        <p className="muted">This tax is paid from your own pocket and never appears on the bills.</p>
      </div>
      <div className="card table-wrap">
        <div className="page-head" style={{ marginBottom: 8 }}>
          <h2>Annual view (GSTR-4)</h2><div className="grow" />
          <button className="sm" onClick={() => download(`gstr4-${fy}-${fy + 1}.csv`, toCsv(['Period', 'Turnover', 'Rate %', 'CGST', 'SGST', 'Total tax'], rows.map((r) => [r.name, (r.turnover / 100).toFixed(2), settings.compositionRate, (r.cgst / 100).toFixed(2), (r.sgst / 100).toFixed(2), (r.total / 100).toFixed(2)])))}>Download CSV</button>
        </div>
        <table>
          <thead><tr><th>Period</th><th className="num">Turnover</th><th className="num">CGST</th><th className="num">SGST</th><th className="num">Total tax</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.name}><td>{r.name}</td><td className="num">{fmtMoney(r.turnover)}</td><td className="num">{fmtMoney(r.cgst)}</td><td className="num">{fmtMoney(r.sgst)}</td><td className="num">{fmtMoney(r.total)}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}
