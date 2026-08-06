import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getRequest, rerunReview, saveDecision, sendDocusign, docusignConfig, docusignSenderView, docusignRefresh, downloadSignedDoc, getAssignees, setStatus, assign, downloadFile } from '../api.js';
import Review from '../components/Review.jsx';

const INTAKE_ROWS = [
  ['contractType', 'Type'], ['entity', 'Our entity'], ['team', 'Team'],
  ['counterpartyLocation', 'Based'], ['relationship', 'Relationship'],
  ['amountPerYear', 'Amount/year'], ['totalValue', 'Total value'], ['term', 'Term'],
  ['personalData', 'Personal data'], ['dataSubjects', 'Data subjects'],
  ['criticalSystems', 'Critical systems'], ['ip', 'IP'], ['deadline', 'Needed by'],
  ['procurement', 'Procurement'], ['internalApproval', 'Internal approval'],
  ['contractFileName', 'Contract file'],
];
const STATUSES = ['New', 'In progress', 'More information requested', 'Done', 'Discarded'];

const DS_LABELS = {
  created: 'Draft — not yet sent', sent: 'Sent — awaiting signature', delivered: 'Viewed by signer',
  completed: 'Completed — signed', declined: 'Declined by signer', voided: 'Voided',
};

// Turn the deterministic engine triggers into a plain-language explanation.
const HIGH_LIST = 'high value (over €50k), long term (over 3 years), large-scale personal data (100+ people), data going outside the EU, sharing our existing IP, or a counterparty running critical systems';

function plainRisk(tier, triggers, mandatory) {
  // Clean the raw triggers: drop AI-focus + the generic default/low lines, strip codes/bullets.
  const reasons = (triggers || [])
    .filter((t) => !/^type red-flags/i.test(t.trim()))
    .map((t) => t.replace(/^[•\s]+/, '').replace(/^H\d+\s*/, '').trim())
    .filter((t) => t && !/^No HIGH trigger/i.test(t) && !/^Standard low-risk/i.test(t) && !/^Geen HIGH/i.test(t) && !/all LOW criteria/i.test(t));

  if (tier === 'HIGH') {
    return { headline: 'High risk — a full, in-depth review is needed. It triggers at least one high-risk factor:', reasons };
  }
  if (tier === 'LOW') {
    return { headline: 'Low risk — a light first-line check is enough.', reasons,
      note: 'It meets HF’s low-risk conditions: small value, short term, standard terms, no (or employee-only) personal data, no IP creation, EU-based and an existing supplier.' };
  }
  // MEDIUM
  return {
    headline: 'Medium risk — a standard review.',
    reasons,
    note: `Why medium: it does not qualify as low-risk${reasons.length ? ' because of the point(s) above' : ' (it doesn’t meet every low-risk condition — e.g. value, term or data)'}, and it is not high-risk because none of the high-risk triggers apply (${HIGH_LIST}).`,
  };
}

export default function Detail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [r, setR] = useState(null);
  const [assignees, setAssignees] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dec, setDec] = useState({ decision: '', decisionNotes: '', reviewer: '' });
  const [dsBusy, setDsBusy] = useState('');
  const [dsMsg, setDsMsg] = useState('');
  const [dsCfg, setDsCfg] = useState(null);

  const load = () => getRequest(id).then((data) => {
    setR(data);
    setDec({ decision: data.decision || '', decisionNotes: data.decisionNotes || '', reviewer: data.reviewer || '' });
  });
  useEffect(() => { load(); getAssignees().then(setAssignees); docusignConfig().then(setDsCfg).catch(() => {}); }, [id]);

  if (!r) return <div className="container"><p className="muted">Loading…</p></div>;

  async function rerun() { setBusy(true); await rerunReview(id); await load(); setBusy(false); }
  async function save() { await saveDecision(id, { ...dec, status: r.status }); await load(); }
  async function dsCreateDraft() {
    setDsBusy('create'); setDsMsg('');
    const res = await sendDocusign(id);
    setDsBusy('');
    if (!res.ok) setDsMsg(res.message || 'DocuSign is not connected in this demo — see the README to wire it up.');
    await load();
  }
  async function dsOpen() {
    setDsBusy('open'); setDsMsg('');
    const res = await docusignSenderView(id);
    setDsBusy('');
    if (res.ok && res.url) window.open(res.url, '_blank', 'noopener');
    else setDsMsg(res.message || 'Could not open DocuSign.');
  }
  async function dsRefresh() {
    setDsBusy('refresh'); setDsMsg('');
    const res = await docusignRefresh(id);
    setDsBusy('');
    if (!res.ok) setDsMsg(res.message || 'Could not refresh the DocuSign status.');
    await load();
  }
  async function dsDownloadSigned() {
    setDsBusy('download'); setDsMsg('');
    try { await downloadSignedDoc(id, `signed-${r.counterpartyName || 'contract'}.pdf`); }
    catch (e) { setDsMsg(e.message); }
    setDsBusy('');
  }
  async function changeStatus(s) {
    let reason;
    if (s === 'Discarded') {
      reason = window.prompt('Reason for discarding this contract?');
      if (!reason || !reason.trim()) return;
    }
    setR({ ...r, status: s, ...(reason ? { discardReason: reason.trim() } : {}) });
    await setStatus(id, s, reason);
    await load();
  }
  async function changeAssignee(a) { setR({ ...r, assignedTo: a }); await assign(id, a); }

  const reviewReady = r.aiStatus === 'AI review complete' && r.review;

  // Map the AI's "intake mismatch" flags onto the intake rows they contradict.
  function intakeMismatches() {
    if (!reviewReady) return {};
    const flags = [...(r.review.red_flags || []), ...(r.review.red_flags_beyond_scope || [])];
    const map = {};
    for (const f of flags) {
      const title = (f.title || '').toLowerCase();
      const text = ((f.title || '') + ' ' + (f.issue || '')).toLowerCase();
      if (!/intake|mismatch|estimate/.test(text)) continue;
      let key = null;
      if (/term|month|duration/.test(title) || (/term/.test(text) && !/value/.test(title))) key = 'term';
      else if (/type/.test(title)) key = 'contractType';
      else if (/annual|per ?year|\/year/.test(text)) key = 'amountPerYear';
      else if (/value|price|fee|amount|€|eur/.test(text)) key = 'totalValue';
      if (key && !map[key]) map[key] = f.issue;
    }
    return map;
  }
  const mismatch = intakeMismatches();

  return (
    <div className="container">
      <Link to="/legal" className="muted" style={{ fontSize: 13 }}>← Dashboard</Link>
      <div className="row-between" style={{ marginTop: 8 }}>
        <div>
          <h1>{r.counterpartyName || '(unnamed)'} <span className={`tier ${r.tier}`}>{r.tier}</span></h1>
          <p className="sub">{r.contractType} · submitted {(r.createdAt || '').slice(0, 10)} {r.mandatoryReview && <span className="pill">mandatory review</span>}</p>
        </div>
      </div>

      {/* Workflow bar — assign + status toggle (all act instantly) */}
      <div className="card">
        <div className="workflow">
          <div className="field">
            <label style={{ marginTop: 0 }}>Assigned to</label>
            <select value={r.assignedTo || ''} onChange={(e) => changeAssignee(e.target.value)}>
              <option value="">— unassigned —</option>
              {assignees.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label style={{ marginTop: 0 }}>Status</label>
            <div className="seg">
              {STATUSES.map((s) => (
                <button key={s} className={r.status === s ? 'on' : ''} onClick={() => changeStatus(s)}>{s}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {r.status === 'Discarded' && r.discardReason && (
        <div className="banner warn"><strong>Discarded.</strong> {r.discardReason}</div>
      )}

      {/* Contract documents — easily retrievable for Legal */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>📄 Contract document:</strong>
        {r.contractFileName ? (
          <a onClick={() => downloadFile(r.id, r.contractFileName)} style={{ cursor: 'pointer' }}>{r.contractFileName}</a>
        ) : <span className="muted">No document uploaded</span>}
      </div>

      {/* E-signature (DocuSign) — draft-only: create a draft, then review & send it in DocuSign */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 14 }}>✍️ E-signature (DocuSign):</strong>
          {r.docusign?.envelopeId ? (
            <>
              <span className="pill">{DS_LABELS[r.docusign.status] || r.docusign.status}</span>
              <span className="muted" style={{ fontSize: 12 }}>
                signer {r.docusign.sentTo || r.signerEmail}
                {r.docusign.completedAt ? ` · signed ${r.docusign.completedAt.slice(0, 10)}` : ''}
              </span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                {r.docusign.status !== 'completed' && r.docusign.status !== 'voided' && (
                  <button className="btn" onClick={dsOpen} disabled={!!dsBusy}>
                    {dsBusy === 'open' ? <><span className="spinner" /> Opening…</> : '↗ Open in DocuSign'}
                  </button>
                )}
                <button className="btn ghost" onClick={dsRefresh} disabled={!!dsBusy}>
                  {dsBusy === 'refresh' ? <><span className="spinner" /> Refreshing…</> : '↻ Refresh status'}
                </button>
                {r.docusign.status === 'completed' && (
                  <button className="btn" onClick={dsDownloadSigned} disabled={!!dsBusy}>
                    {dsBusy === 'download' ? <><span className="spinner" /> Downloading…</> : '⬇ Signed PDF'}
                  </button>
                )}
              </span>
            </>
          ) : (
            <>
              <span className="muted" style={{ fontSize: 13 }}>
                Creates a <strong>draft</strong> in DocuSign for {r.signerName || 'the signer'} — a lawyer reviews,
                places the fields and sends it from there. Nothing is ever emailed automatically.
                <em className="not-italic text-muted-foreground"> E-signature is not connected in this demo;
                the button returns a “not configured” message.</em>
              </span>
              <span style={{ marginLeft: 'auto' }}>
                <button className="btn" onClick={dsCreateDraft} disabled={!!dsBusy || !r.contractFileName}>
                  {dsBusy === 'create' ? <><span className="spinner" /> Creating draft…</> : 'Create DocuSign draft'}
                </button>
              </span>
            </>
          )}
        </div>
        {dsMsg && <div className="banner warn" style={{ marginTop: 12, marginBottom: 0 }}>{dsMsg}</div>}
        {dsCfg?.ok && (
          <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
            Envelopes are created in <strong>{dsCfg.accountName}</strong> as {dsCfg.userEmail}
            {dsCfg.environment === 'sandbox' ? ' — sandbox (demo watermark)' : ''}.
          </p>
        )}
      </div>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <div>
          <h2>Intake</h2>
          <div className="card"><div className="kv">
            {INTAKE_ROWS.map(([k, label]) => r[k] ? [
              <div className="k" key={k + 'k'}>{label}</div>,
              <div key={k + 'v'}>
                {r[k]}
                {mismatch[k] && <div className="mismatch">⚠ Contract says: {mismatch[k].split(/\s[—–-]\s/)[0]}</div>}
              </div>,
            ] : null)}
          </div>
          {r.context && <p style={{ fontSize: 14, marginTop: 12 }}><strong>Context:</strong> {r.context}</p>}
          </div>
        </div>
        <div>
          <h2>Risk level</h2>
          <div className="card">
            <div style={{ marginBottom: 8 }}><span className={`tier ${r.tier}`}>{r.tier}</span> {r.mandatoryReview && <span className="pill" style={{ marginLeft: 6 }}>mandatory review</span>}</div>
            {(() => {
              const p = plainRisk(r.tier, r.triggers, r.mandatoryReview);
              return (
                <>
                  <p style={{ fontSize: 14, margin: '0 0 8px' }}>{p.headline}</p>
                  {p.reasons.length > 0 && (
                    <ul style={{ margin: '0 0 8px', paddingLeft: 18, fontSize: 14 }}>
                      {p.reasons.map((t, i) => <li key={i} style={{ marginBottom: 4 }}>{t}</li>)}
                    </ul>
                  )}
                  {p.note && <p style={{ fontSize: 13, margin: '0 0 4px', color: '#374151' }}>{p.note}</p>}
                  {r.mandatoryReview && <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>Also flagged for <strong>mandatory legal review</strong> — the value is €25k or more and/or the term is longer than a year, so Legal must look at it regardless of the risk level.</p>}
                  <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>This level is set by fixed rules from the intake answers (no AI) — it decides how deep the review goes.</p>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      <div className="row-between">
        <h2 style={{ marginBottom: 0 }}>AI recommendation</h2>
        <button className="btn ghost" onClick={rerun} disabled={busy}>{busy ? <><span className="spinner" /> running…</> : '↻ Re-run'}</button>
      </div>
      {!reviewReady ? (
        <div className="banner warn">{r.aiStatus || 'No AI review yet.'} {r.aiError ? '— ' + r.aiError : ''}</div>
      ) : (
        <Review review={r.review} grounding={r.grounding} />
      )}

      <h2>Counsel decision</h2>
      <div className="card">
        <div className="grid2">
          <div>
            <label style={{ marginTop: 0 }}>Decision</label>
            <select value={dec.decision} onChange={(e) => setDec({ ...dec, decision: e.target.value })}>
              {['', 'Proceed', 'Proceed with amendments', 'Escalate', 'Do not proceed'].map((s) => <option key={s} value={s}>{s || '—'}</option>)}
            </select>
          </div>
          <div>
            <label style={{ marginTop: 0 }}>Reviewer</label>
            <input value={dec.reviewer} onChange={(e) => setDec({ ...dec, reviewer: e.target.value })} placeholder="your name" />
          </div>
        </div>
        <label>Notes</label>
        <textarea value={dec.decisionNotes} onChange={(e) => setDec({ ...dec, decisionNotes: e.target.value })} />
        <div style={{ marginTop: 14 }}>
          <button className="btn" onClick={save}>Save decision</button>
        </div>
      </div>
    </div>
  );
}
