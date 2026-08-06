import { useState } from 'react';

const DOT = { GREEN: '🟢', ORANGE: '🟠', RED: '🔴' };
const GROUPS = [
  { status: 'RED', title: 'Outside band — needs attention', open: true },
  { status: 'ORANGE', title: 'Counsel check — deal-dependent', open: true },
];

function truncate(s, n = 100) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n).trimEnd() + '…' : s;
}
function splitUnverified(text) {
  const t = String(text || '');
  if (t.startsWith('[UNVERIFIED CITATION]')) return { text: t.replace('[UNVERIFIED CITATION]', '').trim(), unverified: true };
  return { text: t, unverified: false };
}
const sevCircle = (sev) => (String(sev).toLowerCase() === 'high' ? '🔴' : '🟠');

function Issue({ f }) {
  const { text, unverified } = splitUnverified(f.issue);
  const title = f.title || f.category || 'Issue';
  return (
    <li className="issue">
      <span className="issue-circle">{sevCircle(f.severity)}</span>
      <div>
        <strong>{title}</strong> — {text}
        {f.location && f.location !== 'not found in document' && <span className="loc"> ({f.location})</span>}
        {unverified && <span className="loc"> · citation unverified</span>}
        {f.recommendation && <div className="issue-rec">→ {f.recommendation}</div>}
      </div>
    </li>
  );
}

function Topic({ t, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`acc ${t.status}`}>
      <button className="acc-head" onClick={() => setOpen((o) => !o)}>
        <span className="acc-dot">{DOT[t.status] || '⚪'}</span>
        <span className="acc-name">{t.topic}</span>
        <span className="acc-quick">{truncate(t.summary)}</span>
        <span className="acc-chev">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="acc-body">
          <div><span className="k">What the contract says</span><div>{t.summary} {t.location && <span className="loc">({t.location})</span>}</div></div>
          {t.proposal && t.status !== 'GREEN' && (
            <div className="proposal"><strong>Proposed position:</strong> {t.proposal}</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Review({ review, grounding }) {
  if (!review) return null;
  const topics = review.reviewed_topics || [];
  const flags = [...(review.red_flags || []), ...(review.red_flags_beyond_scope || [])];
  const missing = review.missing_clauses || [];
  const g = review.gdpr || {};
  const count = (s) => topics.filter((t) => t.status === s).length;
  const red = flags.filter((f) => String(f.severity).toLowerCase() === 'high').length;
  const amber = flags.length - red;
  const recClass = /do not proceed|escalate/i.test(review.recommendation) ? 'RED'
    : /amendments/i.test(review.recommendation) ? 'ORANGE' : 'GREEN';

  return (
    <div>
      {/* At a glance — short: recommendation + red/amber flag counts */}
      <div className={`glance ${recClass}`}>
        <div className="glance-rec">{review.recommendation}</div>
        <div className="glance-counts">
          <span>🔴 {red} red</span>
          <span>🟠 {amber} amber</span>
          <span className="muted">· {count('GREEN')} topics within band</span>
        </div>
      </div>

      {/* Key issues — circle + bold topic + finding + recommendation */}
      {flags.length > 0 && (
        <>
          <h2>Key issues</h2>
          <div className="card">
            <ul className="issue-list">
              {flags.map((f, i) => <Issue key={i} f={f} />)}
            </ul>
          </div>
        </>
      )}

      {/* Topics needing attention — only RED and ORANGE listed */}
      <h2>Topics to check</h2>
      {count('RED') + count('ORANGE') === 0 ? (
        <div className="banner ok">No topics outside the acceptable band.</div>
      ) : GROUPS.map((grp) => {
        const list = topics.filter((t) => t.status === grp.status);
        if (!list.length) return null;
        return (
          <div key={grp.status} className="acc-group">
            <div className="acc-group-head"><span className={`dot-${grp.status.toLowerCase()}`}>{DOT[grp.status]}</span> {grp.title} <span className="pill">{list.length}</span></div>
            {list.map((t, i) => <Topic key={i} t={t} defaultOpen={grp.open} />)}
          </div>
        );
      })}
      {count('GREEN') > 0 && (
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>🟢 {count('GREEN')} further topic{count('GREEN') > 1 ? 's' : ''} reviewed and within band (OK).</p>
      )}

      <div className="grid2" style={{ alignItems: 'start', marginTop: 16 }}>
        {missing.length > 0 && (
          <div>
            <h2>Other clauses not found (lower impact)</h2>
            <div className="card"><ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>{missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
            <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>Materially risky omissions appear above in Key issues.</p></div>
          </div>
        )}
        <div>
          <h2>GDPR</h2>
          <div className="card"><div className="kv">
            <div className="k">DPA present</div><div>{g.dpa_present || '—'}</div>
            <div className="k">Note</div><div>{g.note || '—'}</div>
          </div></div>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        Confidence: {review.confidence || '—'}
        {grounding && <> · citations verified {grounding.verified}, downgraded {grounding.downgraded}</>}
        {' '}· AI is first-line support, not legal advice — a lawyer decides.
      </p>
    </div>
  );
}
