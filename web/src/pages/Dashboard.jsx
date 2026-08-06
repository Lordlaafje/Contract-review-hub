import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listRequests, getAssignees, assign, setStatus } from '../api.js';

const STATUSES = ['New', 'In progress', 'More information requested', 'Done', 'Discarded'];
const DS_SHORT = { created: 'draft', sent: 'sent', delivered: 'viewed', completed: 'signed', declined: 'declined', voided: 'voided' };

export default function Dashboard() {
  const [items, setItems] = useState(null);
  const [assignees, setAssignees] = useState([]);
  const [fTier, setFTier] = useState('all');
  const [fStatus, setFStatus] = useState('all');
  const [fAssignee, setFAssignee] = useState('all');
  const [q, setQ] = useState('');
  const nav = useNavigate();

  useEffect(() => { listRequests().then(setItems); getAssignees().then(setAssignees); }, []);

  const update = (id, patch) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  async function doAssign(id, v) { update(id, { assignedTo: v }); await assign(id, v); }
  async function doStatus(id, v) {
    let reason;
    if (v === 'Discarded') {
      reason = window.prompt('Reason for discarding this contract?');
      if (!reason || !reason.trim()) return; // cancelled / empty → keep current status
    }
    update(id, { status: v, ...(reason ? { discardReason: reason.trim() } : {}) });
    await setStatus(id, v, reason);
  }

  if (!items) return <div className="container"><p className="muted">Loading…</p></div>;

  const filtered = items.filter((r) => {
    const tier = r.tier || '';
    const status = r.status || 'New';
    if (fTier !== 'all' && tier !== fTier) return false;
    if (fAssignee !== 'all' && (r.assignedTo || '') !== fAssignee) return false;
    if (q && !(`${r.counterpartyName} ${r.contractType} ${r.team}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return STATUSES.includes(status) || status === 'Closed';
  });
  const norm = (s) => (s === 'Closed' ? 'Done' : (s || 'New'));

  return (
    <div className="container">
      <div className="row-between">
        <h1>Contract review dashboard</h1>
        <a className="btn" href="/" target="_blank" rel="noopener" style={{ display: 'inline-block', textDecoration: 'none' }}>↗ Open intake form</a>
      </div>
      <p className="sub">Requests arrive via the public intake form (share that link with requesters). Assign, set status, and open a request for its AI recommendation.</p>

      {/* Filters */}
      <div className="card" style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 150 }}>
          <label style={{ marginTop: 0 }}>Risk tier</label>
          <select value={fTier} onChange={(e) => setFTier(e.target.value)}>
            <option value="all">All</option>{['LOW', 'MEDIUM', 'HIGH'].map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 180 }}>
          <label style={{ marginTop: 0 }}>Status</label>
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="all">All</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 180 }}>
          <label style={{ marginTop: 0 }}>Assignee</label>
          <select value={fAssignee} onChange={(e) => setFAssignee(e.target.value)}>
            <option value="all">All</option><option value="">Unassigned</option>
            {assignees.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ marginTop: 0 }}>Search</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="counterparty, type, team…" />
        </div>
      </div>

      {STATUSES.filter((s) => fStatus === 'all' || s === fStatus).map((section) => {
        const rows = filtered.filter((r) => norm(r.status) === section);
        return (
          <div key={section} style={{ marginTop: 22 }}>
            <div className="row-between" style={{ marginBottom: 8 }}>
              <h2 style={{ margin: 0 }}>{section} <span className="pill">{rows.length}</span></h2>
            </div>
            {rows.length === 0 ? <p className="muted" style={{ fontSize: 13 }}>None.</p> : (
              <table>
                <thead>
                  <tr><th>Counterparty</th><th>Type</th><th>Tier</th><th>AI</th><th>Signature</th><th>Assigned to</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="clickable" onClick={() => nav(`/legal/requests/${r.id}`)}>
                      <td><strong>{r.counterpartyName || '(unnamed)'}</strong>{r.mandatoryReview && <span className="pill" style={{ marginLeft: 8 }}>mandatory</span>}
                        {norm(r.status) === 'Discarded' && r.discardReason && <div className="mismatch" style={{ marginTop: 4 }}>Discarded: {r.discardReason}</div>}
                      </td>
                      <td>{r.contractType}</td>
                      <td><span className={`tier ${r.tier}`}>{r.tier}</span></td>
                      <td>{r.aiStatus === 'AI review complete' ? '✅' : <span className="muted" title={r.aiStatus}>…</span>}</td>
                      <td>{r.docusignStatus ? <span className="pill" title={`DocuSign: ${r.docusignStatus}`}>{DS_SHORT[r.docusignStatus] || r.docusignStatus}</span> : <span className="muted">—</span>}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <select value={r.assignedTo || ''} onChange={(e) => doAssign(r.id, e.target.value)}>
                          <option value="">— unassigned —</option>
                          {assignees.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
                        </select>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <select value={norm(r.status)} onChange={(e) => doStatus(r.id, e.target.value)}>
                          {STATUSES.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}
