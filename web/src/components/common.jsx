/**
 * common.jsx — small shared pieces used across pages, so a tier badge (or a page
 * header, or an empty state) looks and reads the same everywhere it appears.
 */
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { IconAi, IconSign } from '@/components/icons';

const TIER_VARIANT = { LOW: 'low', MEDIUM: 'medium', HIGH: 'high' };

/** The risk tier — the first thing a lawyer looks for, so it never changes shape. */
export function TierBadge({ tier, className }) {
  if (!tier) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant={TIER_VARIANT[tier] || 'muted'} className={cn('font-semibold tracking-wide', className)}>
      {tier}
    </Badge>
  );
}

/** AI review state: done, still running, or failed. */
export function AiBadge({ status }) {
  if (status === 'AI review complete') {
    return (
      <span className="inline-flex items-center gap-1.5 text-risk-low" title={status}>
        <IconAi className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">Ready</span>
      </span>
    );
  }
  const failed = /failed|not valid|unreadable|refused/i.test(status || '');
  return (
    <span className={cn('text-xs', failed ? 'text-risk-high' : 'text-muted-foreground')} title={status || 'No AI review yet'}>
      {failed ? 'Failed' : status ? 'Running…' : '—'}
    </span>
  );
}

const DS_LABEL = {
  created: 'Draft', sent: 'Sent', delivered: 'Viewed',
  completed: 'Signed', declined: 'Declined', voided: 'Voided',
};

/** E-signature state. */
export function SignatureBadge({ status }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const variant = status === 'completed' ? 'low' : status === 'declined' || status === 'voided' ? 'high' : 'muted';
  return (
    <Badge variant={variant} className="gap-1 font-normal" title={`DocuSign: ${status}`}>
      <IconSign className="h-3 w-3" />
      {DS_LABEL[status] || status}
    </Badge>
  );
}

/** Page title + supporting line + optional actions on the right. */
export function PageHeader({ title, description, children, className }) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** A single headline number on the dashboard. */
export function StatTile({ label, value, hint, tone = 'default' }) {
  return (
    <Card className="p-4">
      <div className={cn(
        'tabular text-2xl font-semibold leading-none',
        tone === 'high' && 'text-risk-high',
        tone === 'muted' && 'text-muted-foreground',
      )}>
        {value}
      </div>
      <div className="mt-1.5 text-xs font-medium text-muted-foreground">{label}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground/80">{hint}</div>}
    </Card>
  );
}

/** Shown where a list would be, when the list is empty. */
export function EmptyState({ icon: Icon, title, description, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center', className)}>
      {Icon && <Icon className="mb-3 h-6 w-6 text-muted-foreground/60" />}
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

/** Label/value rows — used for intake details and envelope metadata. */
export function DataList({ rows, className }) {
  return (
    <dl className={cn('grid grid-cols-[minmax(120px,auto)_1fr] gap-x-4 gap-y-2.5 text-sm', className)}>
      {rows.map(([label, value, extra]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words">
            {value}
            {extra}
          </dd>
        </div>
      ))}
    </dl>
  );
}
