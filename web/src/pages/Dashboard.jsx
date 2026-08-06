import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listRequests, getAssignees, assign, setStatus, getStats, deleteRequest } from '../api.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TierBadge, AiBadge, SignatureBadge, PageHeader, StatTile, EmptyState } from '@/components/common';
import { IconExternal, IconSearch, IconDiscard, IconDocument, IconChevronRight } from '@/components/icons';

const STATUSES = ['New', 'In progress', 'More information requested', 'Done', 'Discarded'];
const UNASSIGNED = '__unassigned__';
const ALL = '__all__';

export default function Dashboard() {
  const [items, setItems] = useState(null);
  const [stats, setStats] = useState(null);
  const [assignees, setAssignees] = useState([]);
  const [fTier, setFTier] = useState(ALL);
  const [fStatus, setFStatus] = useState(ALL);
  const [fAssignee, setFAssignee] = useState(ALL);
  const [q, setQ] = useState('');
  const nav = useNavigate();

  const refreshStats = () => getStats().then(setStats);
  useEffect(() => { listRequests().then(setItems); getAssignees().then(setAssignees); refreshStats(); }, []);

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
    refreshStats();
  }
  async function doDelete(id, name) {
    if (!window.confirm(`Permanently delete the request for "${name || 'this contract'}"? This cannot be undone.`)) return;
    setItems((xs) => xs.filter((x) => x.id !== id));
    await deleteRequest(id);
    refreshStats();
  }

  if (!items) {
    return (
      <div className="mx-auto max-w-[1280px] space-y-6 px-6 py-8">
        <Skeleton className="h-9 w-72" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[86px]" />)}
        </div>
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const norm = (s) => (s === 'Closed' ? 'Done' : (s || 'New'));
  const filtered = items.filter((r) => {
    if (fTier !== ALL && (r.tier || '') !== fTier) return false;
    if (fAssignee !== ALL) {
      const want = fAssignee === UNASSIGNED ? '' : fAssignee;
      if ((r.assignedTo || '') !== want) return false;
    }
    if (q && !(`${r.counterpartyName} ${r.contractType} ${r.team}`.toLowerCase().includes(q.toLowerCase()))) return false;
    const status = r.status || 'New';
    return STATUSES.includes(status) || status === 'Closed';
  });

  const activeFilters = (fTier !== ALL) + (fStatus !== ALL) + (fAssignee !== ALL) + (q ? 1 : 0);

  return (
    <div className="mx-auto max-w-[1280px] space-y-6 px-6 py-8">
      <PageHeader
        title="Contract review dashboard"
        description="Requests arrive through the public intake form. Assign a counsel, set a status, and open a request for its risk level and AI recommendation."
      >
        <Button variant="outline" asChild>
          <a href="/" target="_blank" rel="noopener">
            <IconExternal />
            Open intake form
          </a>
        </Button>
      </PageHeader>

      {/* Headline numbers */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Received" value={stats.total} />
          <StatTile label="Open" value={stats.open} />
          <StatTile label="In progress" value={stats.byStatus?.['In progress'] || 0} />
          <StatTile label="Done" value={stats.byStatus?.Done || 0} />
          <StatTile label="Avg. completion" value={stats.avgCompletion || '—'} tone="muted" />
          <Card className="p-4">
            <div className="tabular flex items-baseline gap-1.5 text-2xl font-semibold leading-none">
              <span className="text-risk-high">{stats.byTier?.HIGH || 0}</span>
              <span className="text-sm text-muted-foreground">/</span>
              <span className="text-risk-med">{stats.byTier?.MEDIUM || 0}</span>
              <span className="text-sm text-muted-foreground">/</span>
              <span className="text-risk-low">{stats.byTier?.LOW || 0}</span>
            </div>
            <div className="mt-1.5 text-xs font-medium text-muted-foreground">High / Medium / Low</div>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[140px] flex-1 space-y-1.5 sm:flex-none">
            <Label className="text-xs text-muted-foreground">Risk tier</Label>
            <Select value={fTier} onValueChange={setFTier}>
              <SelectTrigger className="w-full sm:w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All tiers</SelectItem>
                {['HIGH', 'MEDIUM', 'LOW'].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[160px] flex-1 space-y-1.5 sm:flex-none">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger className="w-full sm:w-[190px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[160px] flex-1 space-y-1.5 sm:flex-none">
            <Label className="text-xs text-muted-foreground">Assignee</Label>
            <Select value={fAssignee} onValueChange={setFAssignee}>
              <SelectTrigger className="w-full sm:w-[190px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Everyone</SelectItem>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {assignees.map((a) => <SelectItem key={a.name} value={a.name}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[200px] flex-1 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Search</Label>
            <div className="relative">
              <IconSearch className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Counterparty, type or team…" className="pl-8" />
            </div>
          </div>

          {activeFilters > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setFTier(ALL); setFStatus(ALL); setFAssignee(ALL); setQ(''); }}
            >
              Clear
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Nothing at all — one clear empty state rather than five "None." lines */}
      {filtered.length === 0 && (
        <EmptyState
          icon={IconDocument}
          title={items.length === 0 ? 'No requests yet' : 'No requests match these filters'}
          description={items.length === 0
            ? 'Share the intake form with the business and submissions will appear here, already triaged.'
            : 'Try clearing the filters or searching for a different counterparty.'}
          className="py-14"
        />
      )}

      {/* One section per status */}
      {filtered.length > 0 && STATUSES.filter((s) => fStatus === ALL || s === fStatus).map((section) => {
        const rows = filtered.filter((r) => norm(r.status) === section);
        return (
          <section key={section} className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{section}</h2>
              <Badge variant="muted" className="tabular">{rows.length}</Badge>
            </div>

            {rows.length === 0 ? (
              <p className="px-1 py-2 text-sm text-muted-foreground">None.</p>
            ) : (
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Counterparty</TableHead>
                      <TableHead className="hidden md:table-cell">Type</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead className="hidden lg:table-cell">AI</TableHead>
                      <TableHead className="hidden lg:table-cell">Signature</TableHead>
                      <TableHead>Assigned to</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow
                        key={r.id}
                        className="group cursor-pointer"
                        onClick={() => nav(`/legal/requests/${r.id}`)}
                      >
                        <TableCell className="min-w-[240px]">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-medium">{r.counterpartyName || '(unnamed)'}</span>
                            {r.mandatoryReview && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="shrink-0 font-normal">mandatory</Badge>
                                </TooltipTrigger>
                                <TooltipContent>Value or term crosses the mandatory-review threshold — Legal must look at it whatever the tier.</TooltipContent>
                              </Tooltip>
                            )}
                            <IconChevronRight className="ml-auto hidden h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 md:block" />
                          </div>
                          {norm(r.status) === 'Discarded' && r.discardReason && (
                            <p className="mt-1 text-xs text-muted-foreground">Discarded: {r.discardReason}</p>
                          )}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground md:table-cell">{r.contractType}</TableCell>
                        <TableCell><TierBadge tier={r.tier} /></TableCell>
                        <TableCell className="hidden lg:table-cell"><AiBadge status={r.aiStatus} /></TableCell>
                        <TableCell className="hidden lg:table-cell"><SignatureBadge status={r.docusignStatus} /></TableCell>

                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Select value={r.assignedTo || UNASSIGNED} onValueChange={(v) => doAssign(r.id, v === UNASSIGNED ? '' : v)}>
                            <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                              {assignees.map((a) => <SelectItem key={a.name} value={a.name}>{a.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>

                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Select value={norm(r.status)} onValueChange={(v) => doStatus(r.id, v)}>
                            <SelectTrigger className="h-8 w-[165px] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>

                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => doDelete(r.id, r.counterpartyName)}
                                aria-label="Delete request"
                              >
                                <IconDiscard />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete permanently</TooltipContent>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </section>
        );
      })}
    </div>
  );
}
