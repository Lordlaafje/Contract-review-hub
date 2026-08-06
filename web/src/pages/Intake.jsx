import { useState } from 'react';
import { createRequest } from '../api.js';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { IconWarning, IconUpload, IconOk, IconSign, IconDocument, IconOrg, IconData } from '@/components/icons';

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
  team: 'Your team, so Legal knows who to follow up with and can chase missing details.',
  requesterEmail: 'Your work email. We use it to send you a confirmation and to notify you when the status of your request changes.',
  counterpartyName: 'The other party’s full legal name including legal form (e.g. “Acme B.V.”). This is exactly who HF is contracting with — check it against the contract, not just the brand name.',
  counterpartyLocation: 'Where is the counterparty legally established? “Outside the EU” can trigger extra data-transfer safeguards (SCCs) when personal data is involved.',
  relationship: 'Have we worked with this party before? A brand-new supplier with no track record gets more scrutiny than a renewal of an existing deal.',
  contractType: 'Pick the type that fits best — it drives which HF positions and checks the review applies. If unsure, choose the closest and add detail in the context box.',
  context: 'The single most useful field — please don’t leave it thin. In a few sentences: who does what, why HF needs this, and anything specific Legal should watch for (unusual terms, tight timing, sensitive data, prior disputes).',
  deadline: 'When do you need this signed/reviewed by? This lets Legal prioritise. Leave blank only if the timing is genuinely flexible.',
  term: 'How long does the contract run for initially (before any renewal)? Read it from the contract if you can.',
  amountPerYear: 'Your best estimate of what HF pays per year. A rough band is fine — but please don’t skip it, the value drives how the contract is prioritised.',
  totalValue: 'Yearly amount × number of years — the total HF commits over the full term. A best estimate is fine.',
  personalData: 'Will the counterparty get access to personal data (any information about people — names, emails, customer data)? Be honest: this drives the GDPR checks and can change the risk level.',
  dataSubjects: 'Roughly how many people’s data is involved? Only relevant if personal data is shared. 100 or more raises the risk level.',
  criticalSystems: 'Will they run, host or access systems whose outage would seriously disrupt our services (e.g. the case management system)?',
  ip: 'Will new work be created for us (materials, designs, software, training content), or do we share existing materials? This determines who ends up owning the output.',
  procurement: 'Was Global Indirect Procurement involved / did a tender take place? Informational — no blame; it just tells Legal how the vendor was chosen.',
  internalApproval: 'Has your budget holder / manager signed off on entering into this contract? “Not yet” is fine to flag — it just gets noted for the counsel.',
  signerName: 'DocuSign: the actual person who will sign on the counterparty’s side. We send the signature request to this person — a wrong name means the wrong signatory.',
  signerEmail: 'DocuSign: the signatory’s work email. The signature request goes here once Legal sends the envelope, so it must be correct and reachable.',
  contractFile: 'Upload the contract itself (PDF or DOCX) — the first file is treated as the main contract. You can add annexes like an SLA or DPA; all of them are reviewed and included in the DocuSign envelope.',
};

// Fields that must be filled before submit (nudge — no scrolling past).
const REQUIRED = ['entity', 'team', 'requesterEmail', 'counterpartyName', 'counterpartyLocation', 'relationship',
  'contractType', 'context', 'term', 'amountPerYear', 'totalValue', 'personalData',
  'criticalSystems', 'ip', 'procurement', 'internalApproval', 'signerName', 'signerEmail'];

function Field({ label, name, form, set, err, type = 'select', required, placeholder }) {
  const invalid = !!err;
  const describedBy = HINTS[name] ? `${name}-hint` : undefined;
  return (
    <div data-field={name} className="space-y-1.5">
      <Label htmlFor={name}>
        {label}
        {required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
      </Label>

      {type === 'select' ? (
        <Select value={form[name] || ''} onValueChange={(v) => set(name, v)}>
          <SelectTrigger id={name} aria-describedby={describedBy} className={cn(invalid && 'border-destructive ring-destructive')}>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {(SELECTS[name] || []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : type === 'textarea' ? (
        <Textarea id={name} aria-describedby={describedBy} value={form[name] || ''} placeholder={placeholder}
          onChange={(e) => set(name, e.target.value)} className={cn(invalid && 'border-destructive')} />
      ) : (
        <Input id={name} type={type} aria-describedby={describedBy} value={form[name] || ''} placeholder={placeholder}
          onChange={(e) => set(name, e.target.value)} className={cn(invalid && 'border-destructive')} />
      )}

      {HINTS[name] && <p id={describedBy} className="text-xs leading-relaxed text-muted-foreground">{HINTS[name]}</p>}
      {invalid && <p className="text-xs font-medium text-destructive">{err}</p>}
    </div>
  );
}

function Step({ n, title, icon: Icon, description, children, highlight }) {
  return (
    <Card className={cn(highlight && 'border-primary/60')}>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2.5 text-base">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
            {n}
          </span>
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
          {title}
        </CardTitle>
        {description && <p className="pl-[34px] text-sm text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

export default function Intake() {
  const [form, setForm] = useState({});
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  function validate() {
    const e = {};
    REQUIRED.forEach((k) => { if (!form[k] || !String(form[k]).trim()) e[k] = 'Please complete this field.'; });
    if (form.signerEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.signerEmail)) e.signerEmail = 'Enter a valid email address.';
    if (form.requesterEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.requesterEmail)) e.requesterEmail = 'Enter a valid email address.';
    if (!files.length) e.contractFile = 'Please upload the contract.';
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
    files.forEach((f) => fd.append('contractFiles', f));
    const res = await createRequest(fd);
    setBusy(false);
    if (res && res.id) setDone(res);
  }

  if (done) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <Card>
          <CardContent className="flex flex-col items-center px-8 py-10 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-risk-lowbg">
              <IconOk className="h-6 w-6 text-risk-low" />
            </div>
            <h1 className="text-xl font-semibold">Request submitted</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Thanks — your contract has gone to the Legal team. They will come back to you, and once it is approved
              they prepare the signature request for the signer you gave us.
            </p>
            <Badge variant="muted" className="mt-4 font-normal">Reference {done.id.slice(0, 8)}</Badge>
            <Button variant="outline" className="mt-6"
              onClick={() => { setDone(null); setForm({}); setFiles([]); setErrors({}); }}>
              Submit another
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const f = { form, set };
  const has = Object.keys(errors).some((k) => errors[k]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Request a contract review</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The more accurately you fill this in, the faster Legal can review it. Starred fields are required —
          please answer them rather than skipping.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-5">
        <Step n={1} title="About you & the counterparty" icon={IconOrg}>
          <Field label="Our entity" name="entity" {...f} err={errors.entity} required />
          <Field label="Your team" name="team" {...f} err={errors.team} required />
          <Field label="Your email" name="requesterEmail" {...f} err={errors.requesterEmail} type="email" required placeholder="you@northsidelegal.example" />
          <Field label="Counterparty name" name="counterpartyName" {...f} err={errors.counterpartyName} type="text" required placeholder="Acme B.V." />
          <Field label="Where is the counterparty based?" name="counterpartyLocation" {...f} err={errors.counterpartyLocation} required />
          <Field label="Have we worked with this party before?" name="relationship" {...f} err={errors.relationship} required />
        </Step>

        <Step n={2} title="Signature details" icon={IconSign} highlight
          description="Legal prepares the e-signature request in DocuSign, so we need the exact person who signs on the counterparty’s side.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Signer name" name="signerName" {...f} err={errors.signerName} type="text" required />
            <Field label="Signer email" name="signerEmail" {...f} err={errors.signerEmail} type="email" required />
          </div>
        </Step>

        <Step n={3} title="The contract" icon={IconDocument}>
          <Field label="Type of contract" name="contractType" {...f} err={errors.contractType} required />
          <Field label="Context — what is it about and why do we need it?" name="context" {...f} err={errors.context} type="textarea"
            required placeholder="Who does what, why we need it, and anything Legal should watch for…" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="By when do you need this?" name="deadline" {...f} type="date" />
            <Field label="Term (initial period)" name="term" {...f} err={errors.term} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount per year" name="amountPerYear" {...f} err={errors.amountPerYear} required />
            <Field label="Total value over the full term" name="totalValue" {...f} err={errors.totalValue} required />
          </div>
        </Step>

        <Step n={4} title="Data, IP & process" icon={IconData}>
          <Field label="Will the counterparty access personal data?" name="personalData" {...f} err={errors.personalData} required />
          <Field label="Roughly how many people? (if personal data)" name="dataSubjects" {...f} />
          <Field label="Operates/accesses critical systems?" name="criticalSystems" {...f} err={errors.criticalSystems} required />
          <Field label="New work created or existing IP shared?" name="ip" {...f} err={errors.ip} required />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Procurement/tender involved?" name="procurement" {...f} err={errors.procurement} required />
            <Field label="Internal business approval obtained?" name="internalApproval" {...f} err={errors.internalApproval} required />
          </div>
        </Step>

        <Step n={5} title="The document" icon={IconUpload}>
          <div data-field="contractFile" className="space-y-2">
            <Label htmlFor="contractFiles">
              Upload the contract — plus any annexes (SLA, DPA, order form…)
              <span className="ml-0.5 text-destructive" aria-hidden>*</span>
            </Label>
            <label
              htmlFor="contractFiles"
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-6 py-8 text-center transition-colors hover:border-primary hover:bg-accent/40',
                errors.contractFile && 'border-destructive',
              )}
            >
              <IconUpload className="mb-2 h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">Choose files</span>
              <span className="mt-0.5 text-xs text-muted-foreground">PDF, DOCX or TXT — the first file is the main contract</span>
              <input
                id="contractFiles"
                type="file"
                accept=".pdf,.docx,.txt"
                multiple
                className="sr-only"
                onChange={(e) => { setFiles([...e.target.files]); setErrors((x) => ({ ...x, contractFile: undefined })); }}
              />
            </label>

            {files.length > 0 && (
              <ul className="space-y-1 pt-1">
                {files.map((file, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <IconDocument className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{file.name}</span>
                    {i === 0 && <Badge variant="muted" className="font-normal">main contract</Badge>}
                  </li>
                ))}
              </ul>
            )}
            {HINTS.contractFile && <p className="text-xs leading-relaxed text-muted-foreground">{HINTS.contractFile}</p>}
            {errors.contractFile && <p className="text-xs font-medium text-destructive">{errors.contractFile}</p>}
          </div>
        </Step>

        {has && (
          <Alert variant="warning">
            <IconWarning />
            <AlertTitle>Some answers are missing</AlertTitle>
            <AlertDescription>Please complete the highlighted fields before submitting.</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end pb-4">
          <Button type="submit" size="lg" disabled={busy}>{busy ? 'Submitting…' : 'Submit for review'}</Button>
        </div>
      </form>
    </div>
  );
}
