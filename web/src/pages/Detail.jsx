import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getRequest, rerunReview, saveDecision, sendDocusign, docusignConfig, docusignSenderView,
  docusignRefresh, downloadSignedDoc, getAssignees, setStatus, assign, downloadFile,
} from '../api.js';
import Review from '../components/Review.jsx';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { TierBadge, DataList } from '@/components/common';
import {
  IconBack, IconDocument, IconSign, IconRefresh, IconDownload, IconExternal, IconAi,
  IconWarning, IconRisk, IconCheck, IconInfo,
} from '@/components/icons';

const INTAKE_ROWS = [
  ['contractType', 'Type'], ['entity', 'Our entity'], ['team', 'Team'],
  ['counterpartyLocation', 'Based'], ['relationship', 'Relationship'],
  ['amountPerYear', 'Amount/year'], ['totalValue', 'Total value'], ['term', 'Term'],
  ['personalData', 'Personal data'], ['dataSubjects', 'Data subjects'],
  ['criticalSystems', 'Critical systems'], ['ip', 'IP'], ['deadline', 'Needed by'],
  ['procurement', 'Procurement'], ['internalApproval', 'Internal approval'],
];
const STATUSES = ['New', 'In progress', 'More information requested', 'Done', 'Discarded'];
const DECISIONS = ['Proceed', 'Proceed with amendments', 'Escalate', 'Do not proceed'];
const NO_DECISION = '__none__';
const UNASSIGNED = '__unassigned__';

const DS_LABELS = {
  created: 'Draft — not yet sent', sent: 'Sent — awaiting signature', delivered: 'Viewed by signer',
  completed: 'Completed — signed', declined: 'Declined by signer', voided: 'Voided',
};

// Turn the deterministic engine triggers into a plain-language explanation.
const HIGH_LIST = 'high value (over €50k), long term (over 3 years), large-scale personal data (100+ people), data going outside the EU, sharing our existing IP, or a counterparty running critical systems';

function plainRisk(tier, triggers) {
  const reasons = (triggers || [])
    .filter((t) => !/^type red-flags/i.test(t.trim()))
    .map((t) => t.replace(/^[•\s]+/, '').replace(/^H\d+\s*/, '').trim())
    .filter((t) => t && !/^No HIGH trigger/i.test(t) && !/^Standard low-risk/i.test(t) && !/^Geen HIGH/i.test(t) && !/all LOW criteria/i.test(t));

  if (tier === 'HIGH') {
    return { headline: 'High risk — a full, in-depth review is needed. It triggers at least one high-risk factor:', reasons };
  }
  if (tier === 'LOW') {
    return {
      headline: 'Low risk — a light first-line check is enough.', reasons,
      note: 'It meets our low-risk conditions: small value, short term, standard terms, no (or staff-only) personal data, no IP creation, EU-based and an existing counterparty.',
    };
  }
  return {
    headline: 'Medium risk — a standard review.',
    reasons,
    note: `Why medium: it does not qualify as low-risk${reasons.length ? ' because of the point(s) above' : ' (it doesn’t meet every low-risk condition — e.g. value, term or data)'}, and it is not high-risk because none of the high-risk triggers apply (${HIGH_LIST}).`,
  };
}

/** One labelled section, so the page reads as a sequence rather than a wall of cards. */
function Section({ title, icon: Icon, action, children, className }) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {Icon && <Icon className="h-4 w-4" />}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function Detail() {
  const { id } = useParams();
  const [r, setR] = useState(null);
  const [assignees, setAssignees] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dec, setDec] = useState({ decision: '', decisionNotes: '', reviewer: '' });
  const [dsBusy, setDsBusy] = useState('');
  const [dsMsg, setDsMsg] = useState('');
  const [dsCfg, setDsCfg] = useState(null);
  const [savedNote, setSavedNote] = useState('');

  const load = () => getRequest(id).then((data) => {
    setR(data);
    setDec({ decision: data.decision || '', decisionNotes: data.decisionNotes || '', reviewer: data.reviewer || '' });
  });
  useEffect(() => { load(); getAssignees().then(setAssignees); docusignConfig().then(setDsCfg).catch(() => {}); }, [id]);

  if (!r) {
    return (
      <div className="mx-auto max-w-[1280px] space-y-6 px-6 py-8">
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-20" />
        <div className="grid gap-6 lg:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
      </div>
    );
  }

  async function rerun() { setBusy(true); await rerunReview(id); await load(); setBusy(false); }
  async function save() {
    await saveDecision(id, { ...dec, status: r.status });
    await load();
    setSavedNote('Decision saved.');
    setTimeout(() => setSavedNote(''), 3000);
  }
  async function dsCreateDraft() {
    setDsBusy('create'); setDsMsg('');
    const res = await sendDocusign(id);
    setDsBusy('');
    if (!res.ok) setDsMsg(res.message || 'DocuSign is not configured — see docs/06-docusign-setup.md.');
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
  const aiFailed = /failed|not valid|unreadable|refused/i.test(r.aiStatus || '');

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
  const risk = plainRisk(r.tier, r.triggers);
  const docs = (r.documents && r.documents.length)
    ? r.documents
    : (r.contractFileName ? [{ index: 0, name: r.contractFileName }] : []);

  return (
    <div className="mx-auto max-w-[1280px] space-y-8 px-6 py-8">
      {/* Header */}
      <div className="space-y-4">
        <Link to="/legal" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <IconBack className="h-4 w-4" />
          Dashboard
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{r.counterpartyName || '(unnamed)'}</h1>
              <TierBadge tier={r.tier} />
              {r.mandatoryReview && <Badge variant="outline" className="font-normal">mandatory review</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {r.contractType} · submitted {(r.createdAt || '').slice(0, 10)}
              {r.team ? ` · ${r.team}` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Workflow bar */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-x-6 gap-y-4 p-4">
          <div className="min-w-[200px] space-y-1.5">
            <Label className="text-xs text-muted-foreground">Assigned to</Label>
            <Select value={r.assignedTo || UNASSIGNED} onValueChange={(v) => changeAssignee(v === UNASSIGNED ? '' : v)}>
              <SelectTrigger className="w-full sm:w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {assignees.map((a) => <SelectItem key={a.name} value={a.name}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => changeStatus(s)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    r.status === s ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {r.status === 'Discarded' && r.discardReason && (
        <Alert variant="warning">
          <IconWarning />
          <AlertTitle>Discarded</AlertTitle>
          <AlertDescription>{r.discardReason}</AlertDescription>
        </Alert>
      )}

      {/* Documents + e-signature */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <IconDocument className="h-4 w-4 text-muted-foreground" />
              Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            {docs.length ? (
              <ul className="space-y-1.5 text-sm">
                {docs.map((d) => (
                  <li key={d.index} className="flex items-center gap-2">
                    <button
                      onClick={() => downloadFile(r.id, d.name, d.index)}
                      className="text-left font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {d.name}
                    </button>
                    {d.index === 0 && docs.length > 1 && <Badge variant="muted" className="font-normal">main</Badge>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No document uploaded.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <IconSign className="h-4 w-4 text-muted-foreground" />
              E-signature
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {r.docusign?.envelopeId ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={r.docusign.status === 'completed' ? 'low' : 'muted'} className="font-normal">
                    {DS_LABELS[r.docusign.status] || r.docusign.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {r.docusign.sentTo || r.signerEmail}
                    {r.docusign.completedAt ? ` · signed ${r.docusign.completedAt.slice(0, 10)}` : ''}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {r.docusign.status !== 'completed' && r.docusign.status !== 'voided' && (
                    <Button size="sm" onClick={dsOpen} disabled={!!dsBusy}>
                      <IconExternal />
                      {dsBusy === 'open' ? 'Opening…' : 'Open in DocuSign'}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={dsRefresh} disabled={!!dsBusy}>
                    <IconRefresh className={cn(dsBusy === 'refresh' && 'animate-spin')} />
                    {dsBusy === 'refresh' ? 'Refreshing…' : 'Refresh status'}
                  </Button>
                  {r.docusign.status === 'completed' && (
                    <Button size="sm" onClick={dsDownloadSigned} disabled={!!dsBusy}>
                      <IconDownload />
                      {dsBusy === 'download' ? 'Downloading…' : 'Signed PDF'}
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Creates a <strong className="font-medium text-foreground">draft</strong> in DocuSign for{' '}
                  {r.signerName || 'the signer'} — you review, place tabs and send it there. Nothing is emailed
                  automatically.
                </p>
                <Button size="sm" onClick={dsCreateDraft} disabled={!!dsBusy || docs.length === 0}>
                  <IconSign />
                  {dsBusy === 'create' ? 'Creating draft…' : 'Create DocuSign draft'}
                </Button>
              </>
            )}

            {dsMsg && (
              <Alert variant="warning">
                <IconWarning />
                <AlertDescription>{dsMsg}</AlertDescription>
              </Alert>
            )}
            {dsCfg?.ok && (
              <p className="text-xs text-muted-foreground">
                Envelopes are created in <strong className="font-medium">{dsCfg.accountName}</strong> as {dsCfg.userEmail}
                {dsCfg.environment === 'sandbox' ? ' — sandbox (demo watermark)' : ''}.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Intake + risk */}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Section title="Intake" icon={IconInfo}>
          <Card>
            <CardContent className="p-5">
              <DataList
                rows={INTAKE_ROWS.filter(([k]) => r[k]).map(([k, label]) => [
                  label,
                  r[k],
                  mismatch[k] ? (
                    <span key="m" className="mt-1 flex items-start gap-1.5 rounded-md bg-risk-medbg px-2 py-1 text-xs text-risk-med">
                      <IconWarning className="mt-0.5 h-3 w-3 shrink-0" />
                      Contract says: {mismatch[k].split(/\s[—–-]\s/)[0]}
                    </span>
                  ) : null,
                ])}
              />
              {r.context && (
                <>
                  <Separator className="my-4" />
                  <p className="text-sm"><span className="font-medium">Context:</span> {r.context}</p>
                </>
              )}
            </CardContent>
          </Card>
        </Section>

        <Section title="Risk level" icon={IconRisk}>
          <Card>
            <CardContent className="space-y-3 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <TierBadge tier={r.tier} />
                {r.mandatoryReview && <Badge variant="outline" className="font-normal">mandatory review</Badge>}
              </div>
              <p className="text-sm">{risk.headline}</p>
              {risk.reasons.length > 0 && (
                <ul className="space-y-1.5 text-sm">
                  {risk.reasons.map((t, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              )}
              {risk.note && <p className="text-sm text-muted-foreground">{risk.note}</p>}
              {r.mandatoryReview && (
                <p className="text-sm text-muted-foreground">
                  Also flagged for <strong className="font-medium">mandatory legal review</strong> — the value is €25k
                  or more and/or the term is longer than a year, so Legal must look at it regardless of the risk level.
                </p>
              )}
              <Separator />
              <p className="text-xs text-muted-foreground">
                This level is set by fixed rules from the intake answers (no AI) — it decides how deep the review goes.
              </p>
            </CardContent>
          </Card>
        </Section>
      </div>

      {/* AI review */}
      <Section
        title="AI recommendation"
        icon={IconAi}
        action={
          <Button variant="outline" size="sm" onClick={rerun} disabled={busy}>
            <IconRefresh className={cn(busy && 'animate-spin')} />
            {busy ? 'Running…' : 'Re-run'}
          </Button>
        }
      >
        {!reviewReady ? (
          <Alert variant={aiFailed ? 'destructive' : 'info'}>
            {aiFailed ? <IconWarning /> : <IconAi />}
            <AlertTitle>{aiFailed ? 'The AI review did not complete' : r.aiStatus || 'No AI review yet'}</AlertTitle>
            <AlertDescription>
              {aiFailed
                ? <>{String(r.aiStatus || '').replace(/\.$/, '')}{r.aiError ? ` — ${r.aiError}` : ''}. The risk level above is unaffected — review manually or try again.</>
                : 'The review runs in the background — this updates when it is ready.'}
            </AlertDescription>
          </Alert>
        ) : (
          <Review review={r.review} grounding={r.grounding} />
        )}
      </Section>

      {/* Decision */}
      <Section title="Counsel decision" icon={IconCheck}>
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Decision</Label>
                <Select
                  value={dec.decision || NO_DECISION}
                  onValueChange={(v) => setDec({ ...dec, decision: v === NO_DECISION ? '' : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_DECISION}>— not decided —</SelectItem>
                    {DECISIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reviewer">Reviewer</Label>
                <Input id="reviewer" value={dec.reviewer} placeholder="your name"
                  onChange={(e) => setDec({ ...dec, reviewer: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={dec.decisionNotes}
                placeholder="What was agreed, what still needs to change, who signed off…"
                onChange={(e) => setDec({ ...dec, decisionNotes: e.target.value })} />
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={save}>Save decision</Button>
              {savedNote && (
                <span className="flex items-center gap-1.5 text-sm text-risk-low">
                  <IconCheck className="h-4 w-4" />
                  {savedNote}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </Section>
    </div>
  );
}
