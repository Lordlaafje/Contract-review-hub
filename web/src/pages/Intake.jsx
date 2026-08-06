import { useState } from 'react';
import { createRequest } from '../api.js';

// Mirrors OPTIONS/ORG in server/config.mjs — keep the two in step.
const SELECTS = {
  entity: ['Northside Legal Aid', 'Northside Legal Aid Foundation', 'Northside Advice Centre'],
  team: ['Casework', 'Housing', 'Immigration', 'Family Law', 'Welfare Benefits', 'Operations', 'Fundraising & Grants', 'IT & Data', 'People', 'Finance'],
  contractType: ['NDA', 'Service agreement', 'SaaS / software', 'DPA / data processing', 'Employment contract', 'Consultancy / freelance', 'Grant / funding agreement', 'Lease / premises', 'Partnership / MOU', 'Other'],
  counterpartyLocation: ['EU/EEA', 'Outside the EU'],
  relationship: ['No, new counterparty', 'Yes — renewal/extension of an existing contract', 'Yes — but a new/additional contract'],
  amountPerYear: ['None / Not applicable', 'Not yet known', '< €5k', '€5k–€25k', '€25k–€50k', '> €50k'],
  totalValue: ['None / not applicable', 'Not yet known', '< €25k', '€25k–€50k', '> €50k'],
  term: ['≤ 1 year', '1–3 years', '> 3 years'],
  personalData: ['No', 'Yes — staff/volunteer data only', 'Yes — also client data'],
  dataSubjects: ['< 100', '≥ 100'],
  criticalSystems: ['No', 'Yes — counterparty operates/accesses critical systems'],
  ip: ['No', 'Yes — new work is created under the agreement', 'Yes — we share existing IP or materials with the counterparty'],
  procurement: ['Yes', 'No'],
  internalApproval: ['Yes', 'Not yet'],
};

const HINTS = {
  entity: 'Which of our legal entities is party to this contract? Pick the one that will actually sign — it determines who is bound.',
  team: 'Your team, so Legal knows who to follow up with.',
  counterpartyName: 'The other party\u2019s full legal name including legal form (e.g. \u201cAcme Ltd\u201d). Check it against the contract, not just the brand name.',
  counterpartyLocation: 'Where is the counterparty legally established? \u201cOutside the EU\u201d can trigger extra data-transfer safeguards when personal data is involved.',
  relationship: 'Have we worked with this party before? A brand-new counterparty gets more scrutiny than a renewal.',
  contractType: 'Pick the closest type \u2014 it drives which standard positions and checks the review applies.',
  context: 'The single most useful field. In a few sentences: who does what, why we need it, and anything Legal should watch for (unusual terms, tight timing, client data, prior disputes).',
  deadline: 'When do you need this signed or reviewed by? This lets Legal prioritise.',
  term: 'How long does the contract run initially, before any renewal?',
  amountPerYear: 'Best estimate of what we pay (or receive) per year. A rough band is fine \u2014 the value drives prioritisation.',
  totalValue: 'Yearly amount \u00d7 number of years \u2014 the total committed over the full term.',
  personalData: 'Will the counterparty access personal data? Client data is the most sensitive category we hold \u2014 be honest here, it drives the confidentiality and GDPR checks.',
  dataSubjects: 'Roughly how many people\u2019s data is involved? 100 or more raises the risk level.',
  criticalSystems: 'Will they run, host, or access systems whose outage would seriously disrupt our services (e.g. the case management system)?',
  ip: 'Will new work be created for us (materials, designs, software, training content), or do we share existing materials? This determines who ends up owning the output.',
  procurement: 'Did a tender or competitive process take place? Informational \u2014 it tells Legal how the counterparty was chosen.',
  internalApproval: 'Has your budget holder or manager signed off on entering into this contract?',
  signerName: 'The person who will sign on the counterparty\u2019s side \u2014 the signature request goes to them.',
  signerEmail: 'The signatory\u2019s work email. The signature request goes here once Legal sends the envelope, so it must be correct.',
  contractFile: 'Upload the contract itself (PDF or DOCX). Without it, Legal has nothing to review.',
};

// Fields that must be filled before submit (nudge — no scrolling past).
const REQUIRED = ['entity', 'team', 'counterpartyName', 'counterpartyLocation', 'relationship',
  'contractType', 'context', 'term', 'amountPerYear', 'totalValue', 'personalData',
  'criticalSystems', 'ip', 'procurement', 'internalApproval', 'signerName', 'signerEmail'];

function Field({ label, name, form, set, err, type = 'select', required }) {
  const invalid = !!err;
  return (
    <div data-field={name}>
      <label>{label}{required && <span style={{ color: 'var(--red)' }}> *</span>}</label>
      {type === 'select' ? (
        <select value={form[name] || ''} onChange={(e) => set(name, e.target.value)} style={invalid ? { borderColor: 'var(--red)' } : undefined}>
          <option value="">— Select —</option>
          {(SELECTS[name] || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : type === 'textarea' ? (
        <textarea value={form[name] || ''} onChange={(e) => set(name, e.target.value)} style={invalid ? { borderColor: 'var(--red)' } : undefined} />
      ) : (
        <input type={type} value={form[name] || ''} onChange={(e) => set(name, e.target.value)} style={invalid ? { borderColor: 'var(--red)' } : undefined} />
      )}
      {HINTS[name] && <div className="hint">{HINTS[name]}</div>}
      {invalid && <div className="hint" style={{ color: 'var(--red)' }}>{err}</div>}
    </div>
  );
}

export default function Intake() {
  const [form, setForm] = useState({});
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  function validate() {
    const e = {};
    REQUIRED.forEach((k) => { if (!form[k] || !String(form[k]).trim()) e[k] = 'Please complete this field.'; });
    if (form.signerEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.signerEmail)) e.signerEmail = 'Enter a valid email address.';
    if (!file) e.contractFile = 'Please upload the contract.';
    return e;
  }

  async function submit(ev) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) {
      setErrors(e);
      const first = document.querySelector(`[data-field="${Object.keys(e)[0]}"]`);
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setBusy(true);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v));
    if (file) fd.append('contractFile', file);
    const res = await createRequest(fd);
    setBusy(false);
    if (res && res.id) setDone(res);
  }

  if (done) {
    return (
      <div className="container narrow" style={{ marginTop: 40 }}>
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40 }}>✅</div>
          <h1>Request submitted</h1>
          <p className="sub">Thanks — your contract has been sent to the Legal team for review. You’ll hear back from them, and if it’s approved they’ll prepare the signature request for the signer you provided.</p>
          <p className="muted" style={{ fontSize: 13 }}>Reference: {done.id.slice(0, 8)}</p>
          <button className="btn secondary" style={{ marginTop: 16 }} onClick={() => { setDone(null); setForm({}); setFile(null); setErrors({}); }}>Submit another</button>
        </div>
      </div>
    );
  }

  const f = { form, set };
  const has = Object.keys(errors).some((k) => errors[k]);

  return (
    <div className="container narrow">
      <h1>Request a contract review</h1>
      <p className="sub">The more accurately you fill this in, the faster Legal can review it. All starred fields are required — please answer them rather than skipping.</p>
      <form onSubmit={submit}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>1 · About you & the counterparty</h2>
          <Field label="Our entity" name="entity" {...f} err={errors.entity} required />
          <Field label="Your team" name="team" {...f} err={errors.team} required />
          <Field label="Counterparty name" name="counterpartyName" {...f} err={errors.counterpartyName} type="text" required />
          <Field label="Where is the counterparty based?" name="counterpartyLocation" {...f} err={errors.counterpartyLocation} required />
          <Field label="Have we worked with this party before?" name="relationship" {...f} err={errors.relationship} required />
        </div>

        <div className="card" style={{ borderColor: 'var(--brand)' }}>
          <h2 style={{ marginTop: 0 }}>2 · Signature details (DocuSign)</h2>
          <p className="hint" style={{ marginTop: 0, marginBottom: 4 }}>Once Legal approves, they prepare the e-signature request in DocuSign — so we need the exact person who signs on the counterparty’s side.</p>
          <div className="grid2">
            <Field label="Signer name" name="signerName" {...f} err={errors.signerName} type="text" required />
            <Field label="Signer email" name="signerEmail" {...f} err={errors.signerEmail} type="email" required />
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>3 · The contract</h2>
          <Field label="Type of contract" name="contractType" {...f} err={errors.contractType} required />
          <Field label="Context — what is it about and why do we need it?" name="context" {...f} err={errors.context} type="textarea" required />
          <div className="grid2">
            <Field label="By when do you need this? (deadline)" name="deadline" {...f} type="date" />
            <Field label="Term (initial period)" name="term" {...f} err={errors.term} required />
          </div>
          <div className="grid2">
            <Field label="Amount per year" name="amountPerYear" {...f} err={errors.amountPerYear} required />
            <Field label="Total value over the full term" name="totalValue" {...f} err={errors.totalValue} required />
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>4 · Data, IP & process</h2>
          <Field label="Will the counterparty access personal data?" name="personalData" {...f} err={errors.personalData} required />
          <Field label="Roughly how many people? (if personal data)" name="dataSubjects" {...f} />
          <Field label="Operates/accesses critical systems?" name="criticalSystems" {...f} err={errors.criticalSystems} required />
          <Field label="New work created or existing IP shared?" name="ip" {...f} err={errors.ip} required />
          <div className="grid2">
            <Field label="Procurement/tender involved?" name="procurement" {...f} err={errors.procurement} required />
            <Field label="Internal business approval obtained?" name="internalApproval" {...f} err={errors.internalApproval} required />
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>5 · The document</h2>
          <div data-field="contractFile">
            <label>Upload the contract (PDF / DOCX)<span style={{ color: 'var(--red)' }}> *</span></label>
            <input type="file" accept=".pdf,.docx,.txt" onChange={(e) => { setFile(e.target.files[0]); setErrors((x) => ({ ...x, contractFile: undefined })); }} />
            <div className="hint">{HINTS.contractFile}</div>
            {errors.contractFile && <div className="hint" style={{ color: 'var(--red)' }}>{errors.contractFile}</div>}
          </div>
        </div>

        {has && <div className="banner warn">Please complete the highlighted fields before submitting.</div>}
        <button className="btn" disabled={busy}>{busy ? 'Submitting…' : 'Submit for review'}</button>
      </form>
    </div>
  );
}
