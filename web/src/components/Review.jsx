import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { IconOk, IconIssue, IconWarning, IconData } from '@/components/icons';

const STATUS_STYLES = {
  RED: { dot: 'bg-risk-high', border: 'border-l-risk-high' },
  ORANGE: { dot: 'bg-risk-med', border: 'border-l-risk-med' },
  GREEN: { dot: 'bg-risk-low', border: 'border-l-risk-low' },
};

const truncate = (s, n = 110) => {
  s = String(s || '');
  return s.length > n ? `${s.slice(0, n).trimEnd()}…` : s;
};

function splitUnverified(text) {
  const t = String(text || '');
  if (t.startsWith('[UNVERIFIED CITATION]')) return { text: t.replace('[UNVERIFIED CITATION]', '').trim(), unverified: true };
  return { text: t, unverified: false };
}

/** One red/amber finding: what is wrong, where, and what to do about it. */
function Issue({ f }) {
  const { text, unverified } = splitUnverified(f.issue);
  const high = String(f.severity).toLowerCase() === 'high';
  return (
    <li className="flex gap-3 py-3.5 first:pt-0 last:pb-0">
      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', high ? 'bg-risk-high' : 'bg-risk-med')} />
      <div className="min-w-0 space-y-1">
        <p className="text-sm leading-relaxed">
          <span className="font-semibold">{f.title || f.category || 'Issue'}</span>
          <span className="text-muted-foreground"> — </span>
          {text}
          {f.location && f.location !== 'not found in document' && (
            <span className="text-muted-foreground"> ({f.location})</span>
          )}
          {unverified && (
            <Badge variant="outline" className="ml-2 align-middle font-normal text-muted-foreground">citation unverified</Badge>
          )}
        </p>
        {f.recommendation && (
          <p className="flex gap-1.5 text-sm text-muted-foreground">
            <span aria-hidden className="select-none">→</span>
            <span>{f.recommendation}</span>
          </p>
        )}
      </div>
    </li>
  );
}

/** A reviewed topic: what the contract says, and the proposed position if it is off-band. */
function Topic({ t, value }) {
  const s = STATUS_STYLES[t.status] || STATUS_STYLES.GREEN;
  return (
    <AccordionItem value={value} className={cn('border-b-0 border-l-2 pl-3', s.border)}>
      <AccordionTrigger className="py-3 hover:no-underline">
        <span className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <span className={cn('h-2 w-2 shrink-0 rounded-full', s.dot)} />
          <span className="shrink-0 font-semibold">{t.topic}</span>
          <span className="hidden truncate text-xs font-normal text-muted-foreground sm:inline">{truncate(t.summary)}</span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-3 pl-[18px]">
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">What the contract says</p>
          <p className="text-sm leading-relaxed">
            {t.summary}
            {t.location && <span className="text-muted-foreground"> ({t.location})</span>}
          </p>
        </div>
        {t.proposal && t.status !== 'GREEN' && (
          <div className="rounded-lg bg-muted p-3">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Proposed position</p>
            <p className="text-sm leading-relaxed">{t.proposal}</p>
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

export default function Review({ review, grounding }) {
  if (!review) return null;

  const topics = review.reviewed_topics || [];
  const flags = [...(review.red_flags || []), ...(review.red_flags_beyond_scope || [])];
  const missing = review.missing_clauses || [];
  const gdpr = review.gdpr || {};
  const count = (s) => topics.filter((t) => t.status === s).length;
  const red = flags.filter((f) => String(f.severity).toLowerCase() === 'high').length;
  const amber = flags.length - red;

  const verdict = /do not proceed|escalate/i.test(review.recommendation) ? 'RED'
    : /amendments/i.test(review.recommendation) ? 'ORANGE' : 'GREEN';
  const verdictStyle = {
    RED: 'bg-risk-highbg text-risk-high',
    ORANGE: 'bg-risk-medbg text-risk-med',
    GREEN: 'bg-risk-lowbg text-risk-low',
  }[verdict];

  const offBand = topics.filter((t) => t.status === 'RED' || t.status === 'ORANGE');

  return (
    <div className="space-y-6">
      {/* The verdict, and how much is off-band */}
      <Card className="overflow-hidden">
        <div className={cn('flex flex-wrap items-center justify-between gap-4 px-5 py-4', verdictStyle)}>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">Recommendation</p>
            <p className="text-xl font-semibold leading-tight">{review.recommendation}</p>
          </div>
          <div className="tabular flex items-center gap-4 text-sm font-medium">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-risk-high" />{red} red</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-risk-med" />{amber} amber</span>
            <span className="flex items-center gap-1.5 opacity-70"><span className="h-2 w-2 rounded-full bg-risk-low" />{count('GREEN')} within band</span>
          </div>
        </div>
        {review.recommendation_reason && (
          <CardContent className="pt-4">
            <p className="text-sm leading-relaxed text-muted-foreground">{review.recommendation_reason}</p>
          </CardContent>
        )}
      </Card>

      {/* Summary bullets */}
      {(review.summary || []).length > 0 && (
        <Card>
          <CardContent className="p-5">
            <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">In short</p>
            <ul className="space-y-2">
              {review.summary.map((s, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Key issues — the part a counsel acts on */}
      {flags.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <IconIssue className="h-4 w-4 text-risk-high" />
            Key issues
            <Badge variant="muted" className="tabular font-normal">{flags.length}</Badge>
          </h3>
          <Card>
            <CardContent className="p-5">
              <ul className="divide-y">{flags.map((f, i) => <Issue key={i} f={f} />)}</ul>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Topics */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Topics to check</h3>
        {offBand.length === 0 ? (
          <Card>
            <CardContent className="flex items-center gap-2 p-5 text-sm text-risk-low">
              <IconOk className="h-4 w-4" />
              No topics outside the acceptable band.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-5">
              <Accordion type="multiple" defaultValue={offBand.map((_, i) => `t${i}`)} className="space-y-1">
                {offBand.map((t, i) => <Topic key={i} t={t} value={`t${i}`} />)}
              </Accordion>
            </CardContent>
          </Card>
        )}
        {count('GREEN') > 0 && (
          <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
            <IconOk className="h-3.5 w-3.5 text-risk-low" />
            {count('GREEN')} further topic{count('GREEN') > 1 ? 's' : ''} reviewed and within band.
          </p>
        )}
      </div>

      {/* Missing clauses + GDPR */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {missing.length > 0 && (
          <Card>
            <CardContent className="p-5">
              <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Other clauses not found (lower impact)
              </p>
              <ul className="space-y-1.5">
                {missing.map((m, i) => (
                  <li key={i} className="flex gap-2.5 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">Materially risky omissions appear above in Key issues.</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-5">
            <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <IconData className="h-3.5 w-3.5" />
              GDPR
            </p>
            <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">DPA present</dt>
              <dd className="capitalize">{gdpr.dpa_present || '—'}</dd>
              <dt className="text-muted-foreground">Note</dt>
              <dd className="leading-relaxed">{gdpr.note || '—'}</dd>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Separator />
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <IconWarning className="h-3.5 w-3.5" />
        <span>Confidence: {review.confidence || '—'}</span>
        {grounding && <span>· citations verified {grounding.verified}, downgraded {grounding.downgraded}</span>}
        <span>· AI is first-line support, not legal advice — a lawyer decides.</span>
      </p>
    </div>
  );
}
