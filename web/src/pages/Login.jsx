import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api.js';

export default function Login() {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    const res = await login(pw);
    setBusy(false);
    if (res.ok) nav('/legal');
    else setErr(res.message);
  }

  return (
    <div className="container narrow" style={{ maxWidth: 420, marginTop: 60 }}>
      <div className="card">
        <h1>Legal sign-in</h1>
        <p className="sub">Access to the review dashboard is restricted to the Legal team.</p>
        <form onSubmit={submit}>
          <label>Password</label>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
          {err && <div className="banner warn" style={{ marginTop: 12 }}>{err}</div>}
          <button className="btn" style={{ marginTop: 16 }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p className="hint" style={{ marginTop: 16 }}>Demo sign-in. In a real deployment this is your organisation’s single sign-on.</p>
      </div>
    </div>
  );
}
