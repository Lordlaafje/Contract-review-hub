import { useEffect, useState } from 'react';

const OPEN_KEY = 'clause_metrics_open';
const readOpen = () => { try { return localStorage.getItem(OPEN_KEY) === '1'; } catch { return false; } };
import { getStats } from '../api.js';

// Dashboard overview: four stat tiles, open requests against SLA, and reviews per week. Live figures come from the store; the history is illustrative (flagged by
// the server as history.demo) and labelled as such here.

const SLA_ROWS = [
  { key: 'on_track', label: 'On track', icon: '✓', cls: 'good' },
  { key: 'at_risk', label: 'At risk', icon: '!', cls: 'warn' },
  { key: 'overdue', label: 'Overdue', icon: '✕', cls: 'bad' },
];

const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
function Tile({ label, value, note }) {
  return (
    <div className="ov-tile">
      <div className="ov-label">{label}</div>
      <div className="ov-value">{value ?? '—'}</div>
      {note && <div className="ov-note">{note}</div>}
    </div>
  );
}

function SlaBar({ sla, open }) {
  return (
    <div>
      {open > 0 ? (
        <div className="ov-seg" role="img" aria-label={SLA_ROWS.map((r) => `${r.label} ${sla[r.key]}`).join(', ')}>
          {SLA_ROWS.filter((r) => sla[r.key] > 0).map((r) => (
            <span key={r.key} className={`ov-seg-part ${r.cls}`} style={{ flexGrow: sla[r.key] }} title={`${r.label}: ${sla[r.key]}`} />
          ))}
        </div>
      ) : <p className="muted" style={{ fontSize: 13, margin: '6px 0' }}>Nothing open.</p>}
      <ul className="ov-legend">
        {SLA_ROWS.map((r) => (
          <li key={r.key}>
            <span className={`ov-status ${r.cls}`} aria-hidden="true">{r.icon}</span>
            <span>{r.label}</span>
            <strong>{sla[r.key]}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WeeklyBars({ weeks }) {
  const [hover, setHover] = useState(null);
  const W = 420, H = 150, padL = 26, padB = 22, padT = 18;
  const max = Math.max(5, ...weeks.map((w) => w.count));
  const top = Math.ceil(max / 5) * 5;
  const step = (W - padL) / weeks.length;
  const bw = Math.min(28, step - 10);
  const y = (v) => padT + (H - padT - padB) * (1 - v / top);
  const last = weeks.length - 1;

  return (
    <div className="ov-chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Reviews completed per week">
        {[0, top / 2, top].map((g) => (
          <g key={g}>
            <line x1={padL} x2={W} y1={y(g)} y2={y(g)} className="ov-grid" />
            <text x={padL - 6} y={y(g) + 4} className="ov-axis" textAnchor="end">{g}</text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const x = padL + i * step + (step - bw) / 2;
          const h = Math.max(0, y(0) - y(w.count));
          const r = Math.min(4, h);
          // Rounded top, square base on the baseline.
          const d = `M${x},${y(0)} V${y(w.count) + r} Q${x},${y(w.count)} ${x + r},${y(w.count)} H${x + bw - r} Q${x + bw},${y(w.count)} ${x + bw},${y(w.count) + r} V${y(0)} Z`;
          return (
            <g key={w.weekStart}>
              {h > 0 && <path d={d} className={i === last ? 'ov-bar current' : 'ov-bar'} />}
              {/* Hit area larger than the bar. */}
              <rect x={padL + i * step} y={padT} width={step} height={H - padT - padB} fill="transparent"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
              {(i === last || hover === i) && (
                <text x={x + bw / 2} y={y(w.count) - 5} textAnchor="middle" className="ov-val">{w.count}</text>
              )}
              {(i % 2 === 1 || i === last) && (
                <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="ov-axis">{i === last ? 'This wk' : fmtDate(w.weekStart)}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="ov-tip" style={{ left: `${((padL + hover * step + step / 2) / W) * 100}%` }}>
          Week of {fmtDate(weeks[hover].weekStart)}: <strong>{weeks[hover].count}</strong> reviewed
        </div>
      )}
    </div>
  );
}

export default function Overview({ refreshKey }) {
  const [open, setOpen] = useState(readOpen);
  const toggle = () => setOpen((o) => {
    try { localStorage.setItem(OPEN_KEY, o ? '0' : '1'); } catch { /* private mode: just don't remember */ }
    return !o;
  });
  return (
    <section aria-label="Metrics" className="ov">
      <button type="button" className="ov-toggle" aria-expanded={open} aria-controls="ov-body" onClick={toggle}>
        <span className={`ov-caret${open ? ' open' : ''}`} aria-hidden="true">▸</span> Metrics
      </button>
      {open && <div id="ov-body"><Metrics refreshKey={refreshKey} /></div>}
    </section>
  );
}

function Metrics({ refreshKey }) {
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const load = () => getStats().then((x) => { setS(x); setErr(''); }).catch((e) => setErr(e.message));
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [refreshKey]);

  if (err) return <div className="card muted" style={{ fontSize: 13 }}>Overview unavailable: {err}</div>;
  if (!s) return <div className="card muted" style={{ fontSize: 13 }}>Loading overview…</div>;

  const { pipeline: p, sla, history: hist } = s;
  const demoTag = hist.demo ? ' · demo' : '';

  return (
    <div style={{ marginTop: 10 }}>
      <div className="ov-tiles">
        <Tile label={`Reviewed, last 30 days${demoTag}`} value={hist.reviewed30d} note="Decisions recorded" />
        <Tile label="Open now" value={p.open} note={`${p.new} new · ${p.inProgress} in progress · ${p.moreInfo} waiting for info`} />
        <Tile label="Open within SLA" value={p.open ? `${sla.withinSla} of ${p.open}` : '—'}
          note={sla.overdue ? `${sla.overdue} overdue` : 'None overdue'} />
        <Tile label={`Avg. turnaround${demoTag}`} value={hist.avgTurnaroundDays != null ? `${hist.avgTurnaroundDays} days` : '—'}
          note={hist.withinSlaPct != null ? `${hist.withinSlaPct}% decided within SLA` : ''} />
      </div>

      <div className="ov-panels">
        <div className="card ov-panel">
          <h3 className="ov-h">Open requests against SLA</h3>
          <SlaBar sla={sla} open={p.open} />
          <p className="ov-foot">SLA from submission to decision: {Object.entries(s.slaDays).map(([t, d]) => `${t} ${d} days`).join(' · ')}.</p>
        </div>
        <div className="card ov-panel">
          <h3 className="ov-h">Reviews completed per week{hist.demo && <span className="pill" style={{ marginLeft: 8 }}>demo figures</span>}</h3>
          <WeeklyBars weeks={hist.weeks} />
          <details className="ov-foot">
            <summary>Show as table</summary>
            <table className="ov-table">
              <thead><tr><th>Week of</th><th>Reviewed</th></tr></thead>
              <tbody>{hist.weeks.map((w) => <tr key={w.weekStart}><td>{fmtDate(w.weekStart)}</td><td>{w.count}</td></tr>)}</tbody>
            </table>
          </details>
        </div>
      </div>
    </div>
  );
}
