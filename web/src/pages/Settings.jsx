import { useEffect, useState } from 'react';
import { getSettings } from '../api.js';

// DEMO: shows the real configuration (intake form, risk rules, playbook, AI focus,
// counsels) and lets you edit it on screen. Nothing is saved — "Save" only says so.

const TABS = [
  ['intake', 'Intake form'],
  ['risk', 'Risk rules'],
  ['playbook', 'Playbook'],
  ['focus', 'AI focus per type'],
  ['counsels', 'Legal counsels'],
];
const TYPE_LABEL = { select: 'Choice', text: 'Short text', email: 'Email', textarea: 'Long text', date: 'Date', file: 'File upload' };

const lines = (arr) => (arr || []).join('\n');
const unlines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);

function Row({ label, hint, children }) {
  return (
    <div className="st-row">
      <div><div className="st-label">{label}</div>{hint && <div className="hint">{hint}</div>}</div>
      <div>{children}</div>
    </div>
  );
}

function Pick({ value, choices, onChange }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)}>{choices.map((c) => <option key={c}>{c}</option>)}</select>;
}

function Intake({ cfg, set }) {
  const update = (si, fi, patch) => set((c) => {
    const intake = structuredClone(c.intake);
    Object.assign(intake[si].fields[fi], patch);
    return { ...c, intake };
  });
  const remove = (si, fi) => set((c) => {
    const intake = structuredClone(c.intake);
    intake[si].fields.splice(fi, 1);
    return { ...c, intake };
  });
  const add = (si) => set((c) => {
    const intake = structuredClone(c.intake);
    intake[si].fields.push({ name: `custom${Date.now()}`, label: 'New question', type: 'select', required: false, options: ['Yes', 'No'] });
    return { ...c, intake };
  });
  return (
    <>
      <p className="sub">The questions a colleague answers when they submit a contract. Choice answers also drive the risk rules, so changing an answer's wording would need the rules updated too.</p>
      {cfg.intake.map((s, si) => (
        <div className="card" key={s.title}>
          <h2 style={{ marginTop: 0 }}>{si + 1} · {s.title}</h2>
          {s.fields.map((f, fi) => (
            <div className="st-q" key={f.name}>
              <div className="st-q-head">
                <input value={f.label} onChange={(e) => update(si, fi, { label: e.target.value })} aria-label="Question" />
                <select value={f.type} onChange={(e) => update(si, fi, { type: e.target.value })} aria-label="Answer type" style={{ width: 140 }}>
                  {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <label className="st-check"><input type="checkbox" checked={f.required} onChange={(e) => update(si, fi, { required: e.target.checked })} /> Required</label>
                <button type="button" className="btn ghost st-x" onClick={() => remove(si, fi)} aria-label={`Remove “${f.label}”`}>✕</button>
              </div>
              {f.type === 'select' && (
                <textarea className="st-opts" value={lines(f.options)} rows={Math.min(8, Math.max(2, f.options.length))}
                  onChange={(e) => update(si, fi, { options: e.target.value.split('\n') })} aria-label="Answer options, one per line" />
              )}
            </div>
          ))}
          <button type="button" className="btn ghost" onClick={() => add(si)} style={{ marginTop: 8 }}>+ Add question</button>
        </div>
      ))}
    </>
  );
}

function Risk({ cfg, set }) {
  const r = cfg.risk;
  const put = (k, v) => set((c) => ({ ...c, risk: { ...c.risk, [k]: v } }));
  return (
    <>
      <p className="sub">Fixed rules, no AI: they set each contract's risk tier from the intake answers, and decide when Legal must review regardless of tier.</p>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>HIGH risk if any of these apply</h2>
        <Row label="Total value at or above"><Pick value={r.valueHigh} choices={r.choices.value} onChange={(v) => put('valueHigh', v)} /></Row>
        <Row label="Term at or above"><Pick value={r.termHigh} choices={r.choices.term} onChange={(v) => put('termHigh', v)} /></Row>
        <Row label="People whose data is shared"><Pick value={r.subjectsHigh} choices={r.choices.subjects} onChange={(v) => put('subjectsHigh', v)} /></Row>
        <Row label="Countries treated as safe for data" hint="One per line. Anything else counts as a transfer outside the EU.">
          <textarea value={lines(r.adequateCountries)} rows={2} onChange={(e) => put('adequateCountries', unlines(e.target.value))} />
        </Row>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Mandatory legal review</h2>
        <Row label="Total value bands" hint="One per line."><textarea value={lines(r.valueMandatory)} rows={2} onChange={(e) => put('valueMandatory', unlines(e.target.value))} /></Row>
        <Row label="Term bands" hint="One per line."><textarea value={lines(r.termMandatory)} rows={2} onChange={(e) => put('termMandatory', unlines(e.target.value))} /></Row>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>LOW risk only if all of these apply</h2>
        <Row label="Total value"><Pick value={r.lowTotalValue} choices={r.choices.value} onChange={(v) => put('lowTotalValue', v)} /></Row>
        <Row label="Amount per year"><Pick value={r.lowAnnualValue} choices={r.choices.annual} onChange={(v) => put('lowAnnualValue', v)} /></Row>
        <Row label="Term"><Pick value={r.lowTerm} choices={r.choices.term} onChange={(v) => put('lowTerm', v)} /></Row>
      </div>
    </>
  );
}

function Playbook({ cfg, set }) {
  const put = (k, v) => set((c) => ({ ...c, playbook: { ...c.playbook, [k]: v } }));
  return (
    <>
      <p className="sub">Your standard positions. The AI reviews every contract against them and marks each topic green, amber or red.</p>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>General positions</h2>
        <p className="hint" style={{ marginTop: -4 }}>One per line. Included in every review.</p>
        <textarea className="st-big" value={lines(cfg.playbook.general)} rows={12} onChange={(e) => put('general', e.target.value.split('\n'))} />
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Acceptable range per topic</h2>
        <p className="hint" style={{ marginTop: -4 }}>What counts as green, amber (orange) and red for each topic.</p>
        <textarea className="st-big" value={cfg.playbook.bands} rows={16} onChange={(e) => put('bands', e.target.value)} />
      </div>
    </>
  );
}

function Focus({ cfg, set }) {
  const put = (i, k, v) => set((c) => {
    const typeProfiles = structuredClone(c.typeProfiles);
    typeProfiles[i][k] = v;
    return { ...c, typeProfiles };
  });
  return (
    <>
      <p className="sub">What the AI looks for in each type of contract, on top of the playbook.</p>
      {cfg.typeProfiles.map((p, i) => (
        <details className="card st-type" key={p.type} open={i === 0}>
          <summary><strong>{p.type}</strong>{p.cap !== 'NONE' && <span className="pill" style={{ marginLeft: 8 }}>risk capped at {p.cap}</span>}</summary>
          <Row label="Red flags to look for"><textarea value={p.redflags} rows={3} onChange={(e) => put(i, 'redflags', e.target.value)} /></Row>
          <Row label="Checklist"><input value={p.checklist} onChange={(e) => put(i, 'checklist', e.target.value)} /></Row>
        </details>
      ))}
    </>
  );
}

function Counsels({ cfg, set }) {
  const put = (i, k, v) => set((c) => {
    const assignees = structuredClone(c.assignees);
    assignees[i][k] = v;
    return { ...c, assignees };
  });
  return (
    <>
      <p className="sub">The lawyers a request can be assigned to. The email is used for Slack notifications.</p>
      <div className="card">
        {cfg.assignees.map((a, i) => (
          <div className="st-q-head" key={i} style={{ marginBottom: 8 }}>
            <input value={a.name} onChange={(e) => put(i, 'name', e.target.value)} aria-label="Name" />
            <input value={a.email} onChange={(e) => put(i, 'email', e.target.value)} aria-label="Email" />
            <button type="button" className="btn ghost st-x" aria-label={`Remove ${a.name}`}
              onClick={() => set((c) => ({ ...c, assignees: c.assignees.filter((_, j) => j !== i) }))}>✕</button>
          </div>
        ))}
        <button type="button" className="btn ghost" style={{ marginTop: 4 }}
          onClick={() => set((c) => ({ ...c, assignees: [...c.assignees, { name: '', email: '' }] }))}>+ Add counsel</button>
      </div>
    </>
  );
}

export default function Settings() {
  const [original, setOriginal] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [tab, setTab] = useState('intake');
  const [notice, setNotice] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    getSettings().then((s) => { setOriginal(s); setCfg(structuredClone(s)); }).catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="container"><p className="muted">Settings unavailable: {err}</p></div>;
  if (!cfg) return <div className="container"><p className="muted">Loading…</p></div>;

  const dirty = JSON.stringify(cfg) !== JSON.stringify(original);
  const set = (fn) => { setNotice(''); setCfg(fn); };
  const Tab = { intake: Intake, risk: Risk, playbook: Playbook, focus: Focus, counsels: Counsels }[tab];

  return (
    <div className="container">
      <div className="row-between">
        <h1>Settings</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn ghost" disabled={!dirty} onClick={() => { setCfg(structuredClone(original)); setNotice(''); }}>Discard changes</button>
          <button type="button" className="btn" disabled={!dirty}
            onClick={() => setNotice('Demo only: changes are not saved. Clause keeps using its current settings.')}>Save</button>
        </div>
      </div>
      <p className="sub">How {cfg.org.name} reviews contracts: the intake form, the risk rules, your playbook and who reviews.</p>

      <div className="banner warn st-banner" role="status">
        <strong>Demo settings.</strong> You can edit everything here, but nothing is saved — the app keeps running on its built-in settings.
      </div>
      {notice && <div className="banner warn st-banner" role="status">{notice}</div>}

      <div className="st-tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      <Tab cfg={cfg} set={set} />
    </div>
  );
}
