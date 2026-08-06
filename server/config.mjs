/**
 * config.mjs — everything the legal team tunes, in one place: the organisation's
 * details, risk thresholds, per-contract-type profiles, and the review playbook.
 *
 * This is the "no engineering judgment needed" file: change a threshold or a
 * standard position here and both the deterministic risk engine and the AI review
 * follow. (In a production deployment this moves behind an admin screen so legal
 * can edit it without a redeploy.)
 */

// ── The organisation using the tool ───────────────────────────────────────────
export const ORG = {
  name: 'Northside Legal Aid',
  product: 'Clause',
  entities: [
    'Northside Legal Aid',
    'Northside Legal Aid Foundation',
    'Northside Advice Centre',
  ],
  teams: [
    'Casework', 'Housing', 'Immigration', 'Family Law', 'Welfare Benefits',
    'Operations', 'Fundraising & Grants', 'IT & Data', 'People', 'Finance',
  ],
};

// ── Lawyers available for assignment. The email resolves the Slack DM. ────────
export const ASSIGNEES = [
  { name: 'Amara Osei', email: 'amara.osei@northsidelegal.example' },
  { name: 'Daniel Reyes', email: 'daniel.reyes@northsidelegal.example' },
  { name: 'Priya Raman', email: 'priya.raman@northsidelegal.example' },
];

// ── Intake answer options (also the exact strings the risk engine keys on) ────
export const OPTIONS = {
  contractType: [
    'NDA', 'Service agreement', 'SaaS / software', 'DPA / data processing',
    'Employment contract', 'Consultancy / freelance', 'Grant / funding agreement',
    'Lease / premises', 'Partnership / MOU', 'Other',
  ],
  counterpartyLocation: ['EU/EEA', 'Outside the EU'],
  relationship: [
    'No, new counterparty',
    'Yes — renewal/extension of an existing contract',
    'Yes — but a new/additional contract',
  ],
  amountPerYear: ['None / Not applicable', 'Not yet known', '< €5k', '€5k–€25k', '€25k–€50k', '> €50k'],
  totalValue: ['None / not applicable', 'Not yet known', '< €25k', '€25k–€50k', '> €50k'],
  term: ['≤ 1 year', '1–3 years', '> 3 years'],
  personalData: ['No', 'Yes — staff/volunteer data only', 'Yes — also client data'],
  dataSubjects: ['< 100', '≥ 100'],
  criticalSystems: ['No', 'Yes — counterparty operates/accesses critical systems'],
  ip: [
    'No',
    'Yes — new work is created under the agreement',
    'Yes — we share existing IP or materials with the counterparty',
  ],
  procurement: ['Yes', 'No'],
  internalApproval: ['Yes', 'Not yet'],
};

// ── Deterministic risk thresholds (no AI — explainable and reproducible) ──────
export const PARAMS = {
  valueHigh: '> €50k',                            // HIGH trigger
  valueMandatory: ['€25k–€50k', '> €50k'],        // mandatory-review hard rule
  termHigh: '> 3 years',                          // HIGH trigger
  termMandatory: ['1–3 years', '> 3 years'],      // mandatory-review hard rule
  subjectsHigh: '≥ 100',                          // HIGH trigger
  adequateCountries: ['EU/EEA'],
  // The "fully low" path requires all of these.
  lowTotalValue: '< €25k',
  lowAnnualValue: '< €5k',
  lowTerm: '≤ 1 year',
};

// ── Per-type profiles: what the AI focuses on, plus an optional tier cap. ─────
export const TYPE_PROFILES = {
  'NDA': { key: 'NDA', cap: 'LOW',
    redflags: 'one-sided obligations, no carve-out for legally required disclosure, no return or destruction of information, perpetual term with no trade-secret exception, residuals clause, IP or feedback grab',
    checklist: 'Confidentiality (mutual, 3–5 years, need-to-know, no penalty clause)' },
  'Service agreement': { key: 'SERVICE', cap: 'NONE',
    redflags: 'liability cap below contract value, no IP indemnity, unilateral price increases, auto-renewal with long notice, no exit right, missing data processing agreement where personal data is involved',
    checklist: 'Term, Payment, Liability, Data (if personal data), Governing law' },
  'SaaS / software': { key: 'SAAS', cap: 'NONE',
    redflags: 'supplied "as is" with all warranties excluded, service credits as the sole remedy, no exit on chronic failure, vendor trains AI models on our data, vendor claims rights in our input or output, non-EU hosting without safeguards, uncapped price increases',
    checklist: 'Service levels, Data & privacy, AI use, Liability, IP & warranties, Exit and data return' },
  'DPA / data processing': { key: 'DPA', cap: 'NONE',
    redflags: 'no Article 28 GDPR terms, sub-processors without notice or objection right, non-EU hosting without standard contractual clauses, no breach-notification deadline, processor using data for its own purposes, no audit right, no return or deletion on exit',
    checklist: 'Data & privacy (full review) — client confidentiality is paramount' },
  'Employment contract': { key: 'EMPLOYMENT', cap: 'NONE',
    redflags: 'non-compete wider than necessary, unclear notice periods, missing confidentiality covering client information, no IP assignment for work created, terms below statutory minimums',
    checklist: 'Notice & termination, Confidentiality, IP, Statutory compliance' },
  'Consultancy / freelance': { key: 'FREELANCE', cap: 'NONE',
    redflags: 'IP not assigned to us, no waiver of moral rights, disguised-employment risk, no confidentiality covering client data, key personnel substituted without consent',
    checklist: 'IP, Deliverables & acceptance, Employment-status risk, Confidentiality' },
  'Grant / funding agreement': { key: 'GRANT', cap: 'NONE',
    redflags: 'clawback on vague or subjective grounds, funder control over casework or advocacy positions, reporting out of proportion to the grant, funder claiming IP in materials we create, restrictions on seeking other funding, unilateral variation right',
    checklist: 'Clawback conditions, Independence, Reporting burden, IP in outputs, Payment schedule' },
  'Lease / premises': { key: 'LEASE', cap: 'NONE',
    redflags: 'full repairing and insuring obligations without a survey, uncapped service charge, no break clause, personal guarantees sought from trustees, rent review without a cap',
    checklist: 'Term & break rights, Repair obligations, Service charge, Rent review, Guarantees' },
  'Partnership / MOU': { key: 'MOU', cap: 'NONE',
    redflags: 'unclear whether it is legally binding, joint liability for the other party\'s acts, exclusivity, unclear legal basis for data sharing, no exit, referral obligations that could conflict with client interests',
    checklist: 'Binding status, Liability split, Data sharing, Exit, Conflicts of interest' },
  'Other': { key: 'OTHER', cap: 'NONE',
    redflags: 'anything markedly one-sided, protections a contract of this kind would normally carry but does not, or a scope, duration or liability position left vague',
    checklist: 'General commercial review' },
};

// ── The playbook: market-standard positions the AI reviews against. ──────────
export const PLAYBOOK_GENERAL = [
  'Governing law: prefer local law and courts; flag non-EU governing law (scales with the value and risk of the contract).',
  'Liability: the counterparty\'s cap should be at least one year\'s fees and mutual; flag uncapped liability for us, caps below one year\'s fees, and one-sided caps. Always in scope.',
  'Term and exit: flag evergreen or auto-renewing terms with long notice periods; anything longer than a year should be terminable mid-term.',
  'Payment: where we are the payer, longer payment terms are fine; price increases should be capped (for example to an inflation index) after the initial term.',
  'Personal data: where personal data is processed a GDPR Article 28 data processing agreement is required; the depth of review scales with sensitivity and volume. Client data is treated as sensitive by default.',
  'IP: work created for us should be assigned to us (a broad licence is a fallback; a narrow licence is not acceptable), with a waiver of moral rights.',
  'Confidentiality: mutual, surviving termination for 3–5 years, need-to-know sharing, no one-sided penalty clause.',
  'Force majeure: a supplier\'s own sub-supplier failing is not force majeure.',
  'Independence: nothing may give a counterparty or funder control over case selection, the advice we give, or the positions we take.',
];

// The bands the AI colours each reviewed topic against.
export const POSITION_BANDS = `
1. Term & termination — GREEN: 12 months or less, or terminable on 1 month's notice at any time. ORANGE: 30–90 days' notice mid-term. RED: longer than a year with no mid-term termination right, or notice longer than 60 days.
2. IP, indemnity & warranties — GREEN: new work assigned to us plus an IP-infringement indemnity. ORANGE: a broad licence instead of assignment. RED: narrow licence only; no indemnity; supplied "as is"; our data used for the vendor's own or AI-training purposes.
3. Payment — GREEN: no price change during the initial term, then capped to an inflation index. ORANGE: increases beyond inflation but capped; partial prepayment. RED: uncapped price increases; full prepayment at high value.
4. Data & privacy (depth scales with sensitivity) — GREEN: signed DPA, EU hosting, sub-processor notice, breach notice, deletion at end. ORANGE: non-EU transfer with valid safeguards; audit limited to a report. RED: no or weak DPA; our data used for the vendor's own purposes; no breach notification. Client-confidential data raises the bar in every case.
5. Liability (always assessed) — GREEN: counterparty cap of at least one year's fees, and mutual. ORANGE: non-market damage exclusions; no mutual cap; very short claim windows. RED: cap below one year's fees; unlimited liability for us; only the counterparty protected.
6. Governing law — LOW value: any law or venue is fine. MEDIUM/HIGH: GREEN local law and courts; ORANGE another EU jurisdiction; RED non-EU.
7. Force majeure — GREEN: limited definition, notice and mitigation duties, no payment for undelivered services, exit after prolonged force majeure. ORANGE: broader definition if mutual and time-limited. RED: sub-supplier failure counts as force majeure; we keep paying during a standstill.
8. Confidentiality (especially NDAs) — GREEN: market-standard definition, mutual, 3–5 years, need-to-know, no penalty clause. ORANGE: shorter than 3 years or unclear scope; a reasonable mutual penalty. RED: one-sided; no carve-out for legally required disclosure; residuals clause.
9. Service levels (SaaS) — GREEN: realistic uptime commitment, credits are not the sole remedy, exit right on structural failure. ORANGE: slightly lower uptime with credits and an exit right. RED: service credits as the sole remedy; no exit on chronic failure; no service levels on a critical service.
10. AI & data use (SaaS) — GREEN: no training on our data without consent; we keep rights to our input and the output. ORANGE: limited anonymised use for service improvement. RED: training on our data without consent; all liability for AI output excluded.
11. Funder relationship (grants) — GREEN: objective clawback triggers, proportionate reporting, no control over casework or advocacy, we own the materials we create. RED: subjective clawback, funder influence over advice or case selection, funder owns our outputs.
12. Employment & consultancy — GREEN: clear deliverables and acceptance, IP assigned to us, confidentiality covering client information, statutory minimums met. RED: employment-status risk, no IP assignment, non-compete wider than necessary.
`.trim();
