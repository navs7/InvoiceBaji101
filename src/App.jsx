import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider, useApp } from './AppContext.jsx';
import { db } from './db/index.js';
import Clients from './pages/Clients.jsx';
import Dashboard from './pages/Dashboard.jsx';
import InvoiceEditor from './pages/InvoiceEditor.jsx';
import Invoices from './pages/Invoices.jsx';
import Login from './pages/Login.jsx';
import Reports from './pages/Reports.jsx';
import Settings from './pages/Settings.jsx';
import { getTheme, setTheme } from './theme.js';

function ThemeToggle() {
  const [theme, set] = useState(getTheme());
  const pick = (t) => { setTheme(t); set(t); };
  return (
    <div className="theme" role="group" aria-label="Theme">
      {[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => (
        <button key={k} className={theme === k ? 'on' : ''} aria-pressed={theme === k} onClick={() => pick(k)}>{l}</button>
      ))}
    </div>
  );
}

const NAV = [
  ['/', 'Dashboard'],
  ['/invoices', 'Invoices'],
  ['/clients', 'Clients'],
  ['/reports', 'Reports'],
  ['/settings', 'Settings'],
];

function Shell() {
  const { user, settings, toast, signOut } = useApp();
  // "/" jumps to the search box, as in most keyboard-first tools.
  useEffect(() => {
    const h = (e) => {
      if (e.key !== '/' || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const el = document.querySelector('input[placeholder^="Search"]');
      if (el) { e.preventDefault(); el.focus(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  if (user === undefined) return <div className="center muted">Loading…</div>;
  if (!user) return <Login />;
  if (!settings) return <div className="center muted">Loading…</div>;
  return (
    <div className="shell">
      <nav className="nav">
        <div className="brand">Pixel Solutions</div>
        {NAV.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>{label}</NavLink>
        ))}
        <div className="grow" />
        <ThemeToggle />
        {db.mode === 'local' && <div className="nav-note">Demo mode: data stays in this browser. Add Firebase details to sync.</div>}
        {db.mode === 'firebase' && <button className="link" onClick={signOut}>Sign out</button>}
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/invoices/:id" element={<InvoiceEditor />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
      {toast && <div className={`toast ${toast.kind}`}>{toast.message}</div>}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
