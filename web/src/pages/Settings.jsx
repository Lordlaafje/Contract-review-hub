import { useEffect, useState } from 'react';
import { getSettings, saveSettings, resetSettings } from '../api.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/common';
import { IconOk, IconWarning, IconPlus, IconDiscard, IconRisk, IconLegal, IconAi, IconAssignee } from '@/components/icons';

const CAPS = ['NONE', 'LOW', 'MEDIUM', 'HIGH'];
const listVal = (a) => (Array.isArray(a) ? a.join(', ') : '');
const toList = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

function Section({ title, icon: Icon, description, children }) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
          {title}
        </CardTitle>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function FieldRow({ label, hint, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function Settings() {
  const [cfg, setCfg] = useState(null);
  const [saved, setSaved] = useState('');

  useEffect(() => { getSettings().then(setCfg); }, []);

  if (!cfg) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-56" /><Skeleton className="h-56" />
      </div>
    );
  }

  const setParam = (k, v) => setCfg({ ...cfg, params: { ...cfg.params, [k]: v } });
  const setProfile = (type, k, v) => setCfg({ ...cfg, typeProfiles: { ...cfg.typeProfiles, [type]: { ...cfg.typeProfiles[type], [k]: v } } });
  const setAssignee = (i, k, v) => { const a = [...cfg.assignees]; a[i] = { ...a[i], [k]: v }; setCfg({ ...cfg, assignees: a }); };

  async function save() {
    const res = await saveSettings({
      params: cfg.params, typeProfiles: cfg.typeProfiles,
      playbookGeneral: cfg.playbookGeneral, positionBands: cfg.positionBands, assignees: cfg.assignees,
    });
    setCfg(res); setSaved('Saved — changes take effect immediately.'); setTimeout(() => setSaved(''), 3000);
  }
  async function reset() {
    if (!window.confirm('Reset ALL settings to the built-in defaults? Your customisations will be lost.')) return;
    setCfg(await resetSettings()); setSaved('Reset to defaults.'); setTimeout(() => setSaved(''), 3000);
  }

  const P = cfg.params;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <PageHeader
        title="Settings"
        description="Tune the risk rules, standard positions, per-type AI focus and assignees — no code, effective immediately. A human always makes the final call."
      >
        <Button variant="outline" onClick={reset}>Reset to defaults</Button>
        <Button onClick={save}>Save changes</Button>
      </PageHeader>

      {saved && (
        <Alert variant="success">
          <IconOk />
          <AlertDescription>{saved}</AlertDescription>
        </Alert>
      )}
      {cfg._hasOverrides && (
        <Alert variant="info">
          <IconWarning />
          <AlertDescription>Custom settings are active, overriding the built-in defaults.</AlertDescription>
        </Alert>
      )}

      <Section
        title="Risk thresholds"
        icon={IconRisk}
        description="These set the deterministic tier. Values must match the intake form’s option strings exactly."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldRow label="High-value trigger (H1)" hint="A contract at this value band is HIGH risk.">
            <Input value={P.valueHigh} onChange={(e) => setParam('valueHigh', e.target.value)} />
          </FieldRow>
          <FieldRow label="Long-term trigger (H2)">
            <Input value={P.termHigh} onChange={(e) => setParam('termHigh', e.target.value)} />
          </FieldRow>
          <FieldRow label="Data-subjects trigger (H4)">
            <Input value={P.subjectsHigh} onChange={(e) => setParam('subjectsHigh', e.target.value)} />
          </FieldRow>
          <FieldRow label="Adequate countries (H5 / LOW)" hint="Comma-separated.">
            <Input value={listVal(P.adequateCountries)} onChange={(e) => setParam('adequateCountries', toList(e.target.value))} />
          </FieldRow>
          <FieldRow label="Mandatory-review value bands" hint="Comma-separated.">
            <Input value={listVal(P.valueMandatory)} onChange={(e) => setParam('valueMandatory', toList(e.target.value))} />
          </FieldRow>
          <FieldRow label="Mandatory-review term bands" hint="Comma-separated.">
            <Input value={listVal(P.termMandatory)} onChange={(e) => setParam('termMandatory', toList(e.target.value))} />
          </FieldRow>
          <FieldRow label="Low-risk thresholds (total / annual / term)" hint="All three must be met for the fully-low path.">
            <div className="flex gap-2">
              <Input value={P.lowTotalValue} onChange={(e) => setParam('lowTotalValue', e.target.value)} />
              <Input value={P.lowAnnualValue} onChange={(e) => setParam('lowAnnualValue', e.target.value)} />
              <Input value={P.lowTerm} onChange={(e) => setParam('lowTerm', e.target.value)} />
            </div>
          </FieldRow>
        </div>
        <p className="text-xs text-muted-foreground">
          Use the exact strings from the form, e.g. <code className="rounded bg-muted px-1 py-0.5">&gt; €50k</code>,{' '}
          <code className="rounded bg-muted px-1 py-0.5">≥ 100</code>,{' '}
          <code className="rounded bg-muted px-1 py-0.5">1–3 years</code>.
        </p>
      </Section>

      <Section title="Standard positions (playbook)" icon={IconLegal}
        description="The positions every AI review is measured against.">
        <FieldRow label="General positions — one per line (injected into every review)">
          <Textarea className="min-h-[160px]" value={(cfg.playbookGeneral || []).join('\n')}
            onChange={(e) => setCfg({ ...cfg, playbookGeneral: e.target.value.split('\n').filter((l) => l.trim()) })} />
        </FieldRow>
        <FieldRow label="Acceptable bands per topic — the AI colours each topic green / amber / red against these">
          <Textarea className="min-h-[240px] font-mono text-xs" value={cfg.positionBands}
            onChange={(e) => setCfg({ ...cfg, positionBands: e.target.value })} />
        </FieldRow>
      </Section>

      <Section title="Per-contract-type AI focus" icon={IconAi}
        description="A tier cap lowers the risk tier for that type (only NDA uses LOW by default). Keywords and checklist steer where the AI looks.">
        <div className="divide-y">
          {Object.entries(cfg.typeProfiles).map(([type, prof]) => (
            <div key={type} className="space-y-3 py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-medium">{type}</span>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Tier cap</Label>
                  <Select value={prof.cap || 'NONE'} onValueChange={(v) => setProfile(type, 'cap', v)}>
                    <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{CAPS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <FieldRow label="Red-flag keywords (what the AI looks for)">
                <Textarea className="min-h-[60px] text-xs" value={prof.redflags || ''}
                  onChange={(e) => setProfile(type, 'redflags', e.target.value)} />
              </FieldRow>
              <FieldRow label="Checklist / focus">
                <Input className="text-xs" value={prof.checklist || ''}
                  onChange={(e) => setProfile(type, 'checklist', e.target.value)} />
              </FieldRow>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Legal counsels" icon={IconAssignee}
        description="The email resolves the Slack DM on assignment — leave it blank to fall back to email or the channel.">
        <div className="space-y-2">
          {cfg.assignees.map((a, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input className="min-w-[160px] flex-1" placeholder="Name" value={a.name || ''}
                onChange={(e) => setAssignee(i, 'name', e.target.value)} />
              <Input className="min-w-[200px] flex-[1.4]" placeholder="work email (for Slack DM)" value={a.email || ''}
                onChange={(e) => setAssignee(i, 'email', e.target.value)} />
              <Button variant="ghost" size="icon" aria-label={`Remove ${a.name || 'counsel'}`}
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setCfg({ ...cfg, assignees: cfg.assignees.filter((_, j) => j !== i) })}>
                <IconDiscard />
              </Button>
            </div>
          ))}
        </div>
        <Button variant="secondary" size="sm"
          onClick={() => setCfg({ ...cfg, assignees: [...cfg.assignees, { name: '', email: '' }] })}>
          <IconPlus />
          Add counsel
        </Button>
      </Section>

      <Separator />
      <div className="flex flex-wrap items-center justify-end gap-3 pb-4">
        {cfg._hasOverrides && <Badge variant="muted" className="mr-auto font-normal">Custom settings active</Badge>}
        <Button variant="outline" onClick={reset}>Reset to defaults</Button>
        <Button onClick={save}>Save changes</Button>
      </div>
    </div>
  );
}
