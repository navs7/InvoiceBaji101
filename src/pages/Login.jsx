import { useState } from 'react';
import { db } from '../db/index.js';
import { Field } from '../components/ui.jsx';

export default function Login() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await db.auth.signIn(email.trim(), pw); } catch (ex) {
      setErr(/invalid|wrong|user-not-found|credential/i.test(ex.code + ex.message) ? 'Email or password is incorrect.' : ex.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <h1>Pixel Solutions</h1>
        <p className="muted">Sign in to continue.</p>
        <Field label="Email"><input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password"><input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        {err && <div className="alert error">{err}</div>}
        <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
