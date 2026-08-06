#!/usr/bin/env node
/**
 * seed.mjs — load the demo dataset: six contract requests for a fictional legal aid
 * organisation, spanning every risk tier and workflow state, each with a complete
 * first-pass review already written.
 *
 * The reviews are stored, not generated, so a demo works with no AWS credentials and
 * no internet. Submitting a NEW contract through the intake form still calls the real
 * model if AWS credentials are present.
 *
 * Run:  npm run seed          (wipes and reloads the demo data)
 *
 * EVERYTHING BELOW IS FICTION. The organisation, the counterparties, the people and
 * the contract text are all invented for demonstration. Any resemblance to a real
 * organisation or person is coincidental, and the legal findings attached to them are
 * illustrative — they are not assessments of anyone's real contracts or conduct.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from './store.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const uploads = path.join(dir, 'uploads');
fs.mkdirSync(uploads, { recursive: true });

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

/** Write a sample contract file so the "Contract document" link downloads something real. */
function sampleDoc(name, body) {
  const p = path.join(uploads, name);
  fs.writeFileSync(p, body.trim() + '\n');
  return p;
}

const docs = {
  caseflow: sampleDoc('caseflow-msa.txt', `
MASTER SUBSCRIPTION AGREEMENT — CaseFlow Solutions Inc.

3. TERM. The initial term is thirty-six (36) months and renews automatically for successive
twelve (12) month periods unless either party gives ninety (90) days' written notice.

7. FEES. Fees increase annually by the greater of eight percent (8%) or CPI.

9. DATA. Customer grants Provider a perpetual, worldwide licence to use Customer Data,
including matter records, to develop, train and improve Provider's machine learning models
and to create aggregated data products. Provider hosts Customer Data in its US-East facility.

11. LIABILITY. Provider's aggregate liability shall not exceed the fees paid in the three (3)
months preceding the claim. Customer's liability is not limited. Provider excludes all
implied warranties; the service is provided "as is".

14. SERVICE LEVELS. Provider targets 99.0% availability. Service credits are Customer's
sole and exclusive remedy for any failure to meet the service level.

19. GOVERNING LAW. This agreement is governed by the laws of the State of Delaware, USA.
`),
  harbourside: sampleDoc('harbourside-lease.txt', `
LEASE OF OFFICE PREMISES — Harbourside Property Holdings Ltd

2. TERM. Five (5) years from the commencement date. There is no break right.

5. RENT REVIEW. Rent shall be reviewed annually on an upward-only basis to open market rent.

8. REPAIRS. The Tenant shall keep the Premises in good and substantial repair and condition,
including the roof, structure and building services, and shall yield up the Premises in such
condition regardless of their condition at the commencement date.

9. SERVICE CHARGE. The Tenant shall pay a fair proportion of the Landlord's costs. There is
no cap on the service charge.

12. GUARANTEE. The Landlord requires the personal guarantee of two trustees of the Tenant
for all obligations under this lease.

15. ALIENATION. The Tenant shall not assign or underlet without the Landlord's consent,
which may be withheld at the Landlord's absolute discretion.
`),
  ashford: sampleDoc('ashford-grant.txt', `
GRANT AGREEMENT — The Ashford Trust

2. PURPOSE. The Grant shall be applied solely to the Housing Advice Programme.

4. PAYMENT. The Grant is paid in four quarterly instalments in arrears, following receipt
and approval of the reports required by clause 6.

5. APPROVAL OF ACTIVITY. The Recipient shall obtain the Funder's prior written approval
before commencing any strategic litigation, policy or media activity relating to the funded
work, and shall not make public statements that in the Funder's opinion may bring the
Funder into disrepute.

6. REPORTING. The Recipient shall provide monthly narrative and financial reports, and
case-level data including client outcomes, in the Funder's prescribed format.

9. CLAWBACK. The Funder may require repayment of all or part of the Grant if, in its sole
discretion, it considers that the Grant has not been applied effectively.

11. INTELLECTUAL PROPERTY. All materials produced using the Grant shall vest in the Funder.
`),
  rowan: sampleDoc('rowan-nda.txt', `
MUTUAL NON-DISCLOSURE AGREEMENT — Rowan & Fletcher LLP

1. PURPOSE. To evaluate a potential pro bono referral partnership.

2. CONFIDENTIAL INFORMATION. Information disclosed by either party and marked or reasonably
understood to be confidential.

3. OBLIGATIONS. Each party shall use Confidential Information only for the Purpose and
disclose it only to personnel with a need to know who are bound by equivalent obligations.

4. EXCEPTIONS. The obligations do not apply to information that is public, independently
developed, or required to be disclosed by law or regulation, provided the disclosing party
is notified where lawful.

5. TERM. The obligations continue for five (5) years from disclosure.

6. RETURN. On written request each party shall return or destroy Confidential Information.

7. GOVERNING LAW. The laws of the Netherlands. Courts of Amsterdam.
`),
  meridian: sampleDoc('meridian-dpa.txt', `
DATA PROCESSING AGREEMENT — Meridian Cloud Backup B.V.

2. SCOPE. Processor processes Personal Data on behalf of Controller for the provision of
offsite backup services.

4. SUB-PROCESSORS. Processor may engage sub-processors and shall publish an updated list on
its website. Controller is deemed to consent unless it objects within five (5) days.

6. SECURITY. Processor applies appropriate technical and organisational measures, including
encryption at rest and in transit.

7. BREACH NOTIFICATION. Processor shall notify Controller of a personal data breach without
undue delay.

9. AUDIT. Controller may request Processor's most recent third-party audit report. On-site
audits are not permitted.

11. DELETION. On termination Processor shall delete Personal Data within ninety (90) days.
`),
};

// ── Review payloads (what the model produced — stored for the demo) ──────────

const caseflowReview = {
  summary: [
    'A three-year subscription for the case management system, on the supplier\'s standard terms.',
    'The supplier claims a permanent right to use our client matter data to train its own AI models — this is the most serious issue in the contract.',
    'Client data would be hosted in the United States with no transfer safeguards named.',
    'The supplier\'s liability is capped at three months of fees while ours is unlimited.',
    'Recommend escalation: three separate terms are outside the acceptable range, and two of them touch client confidentiality.',
  ],
  reviewed_topics: [
    { topic: 'Data & privacy', status: 'RED',
      summary: 'The supplier gets a permanent, worldwide licence to use our data — including matter records — to train its machine learning models and build data products. Hosting is in the United States.',
      proposal: 'Remove the training and data-product licence entirely. Restrict processing to providing the service to us. Move hosting to the EU, or add standard contractual clauses plus a transfer risk assessment.',
      location: 'cl. 9' },
    { topic: 'Liability', status: 'RED',
      summary: 'The supplier\'s total liability is capped at the fees paid in the previous three months. Our liability is not capped at all. All implied warranties are excluded and the service is provided "as is".',
      proposal: 'Mutual cap of at least one year\'s fees, with no cap for breach of confidentiality or data protection obligations. Remove the "as is" exclusion.',
      location: 'cl. 11' },
    { topic: 'Governing law', status: 'RED',
      summary: 'Delaware law and courts.',
      proposal: 'Local law and courts. If the supplier cannot move, at minimum agree a European seat for disputes.',
      location: 'cl. 19' },
    { topic: 'Term & termination', status: 'ORANGE',
      summary: 'Three-year initial term, renewing automatically for twelve months at a time, with ninety days\' notice needed to stop it.',
      proposal: 'Add a right to terminate for convenience after year one on 30 days\' notice, and shorten the renewal notice period to 30 days.',
      location: 'cl. 3' },
    { topic: 'Service levels', status: 'ORANGE',
      summary: '99.0% availability target. Service credits are the only remedy if the supplier misses it.',
      proposal: 'Keep the credits but add a right to exit without penalty if the target is missed in three consecutive months. 99.0% allows roughly seven hours of downtime a month, which is a lot for a case management system.',
      location: 'cl. 14' },
    { topic: 'Payment', status: 'ORANGE',
      summary: 'Fees rise every year by the higher of 8% or inflation.',
      proposal: 'Cap increases at inflation, with no increase during the initial term.',
      location: 'cl. 7' },
    { topic: 'Confidentiality', status: 'GREEN',
      summary: 'Standard mutual confidentiality obligations, surviving termination for three years.',
      proposal: '', location: 'cl. 16' },
  ],
  missing_clauses: [
    'No force majeure clause',
    'No clause dealing with what happens to our data if the supplier is acquired',
  ],
  gdpr: { applicable: true, dpa_present: 'no',
    note: 'No Article 28 data processing agreement is attached, and the contract permits the supplier to process our data for its own purposes. Both must be fixed before signature — client data is involved.' },
  red_flags: [
    { title: 'AI training on client data', severity: 'high', location: 'cl. 9',
      issue: 'The supplier may use our client matter records permanently to train its own AI models and to build products it sells to others.',
      recommendation: 'Strike the training and data-product licence. This is client-confidential information and cannot be licensed to a supplier for its own commercial use.' },
    { title: 'Missing: data processing agreement', severity: 'high', location: 'not found in document',
      issue: 'Personal data — including client data — is processed, but there is no Article 28 GDPR data processing agreement.',
      recommendation: 'Require a signed DPA before go-live, covering sub-processors, breach notification deadlines and deletion on exit.' },
    { title: 'Liability cap', severity: 'high', location: 'cl. 11',
      issue: 'The supplier caps its liability at three months of fees while leaving our liability unlimited.',
      recommendation: 'Push for a mutual cap of at least one year\'s fees, uncapped for confidentiality and data protection breaches.' },
    { title: 'US data hosting', severity: 'high', location: 'cl. 9',
      issue: 'Client data would be hosted in the United States with no transfer mechanism identified.',
      recommendation: 'Request EU hosting. If unavailable, put standard contractual clauses and a transfer risk assessment in place before any data is migrated.' },
    { title: 'Uncapped price increases', severity: 'medium', location: 'cl. 7',
      issue: 'Annual increases of at least 8% compound well above inflation over a three-year term.',
      recommendation: 'Cap increases at an inflation index and fix pricing for the initial term.' },
  ],
  red_flags_beyond_scope: [],
  recommendation: 'Escalate',
  recommendation_reason: 'The AI-training licence over client matter data and the absence of a data processing agreement are not negotiable points of detail — they go to client confidentiality. Do not proceed on these terms.',
  confidence: 'high',
};

const harbourReview = {
  summary: [
    'A five-year office lease with no break right, on the landlord\'s standard terms.',
    'Two trustees are asked to guarantee the lease personally — this should not be accepted.',
    'The repairing obligation covers the roof and structure regardless of their current condition.',
    'The service charge is uncapped and the rent review can only go up.',
    'Recommend proceeding only with amendments; the guarantee and repairing clause are the priorities.',
  ],
  reviewed_topics: [
    { topic: 'Guarantees', status: 'RED',
      summary: 'The landlord requires two trustees to guarantee all obligations under the lease personally.',
      proposal: 'Remove the personal guarantee. If the landlord needs comfort, offer a rent deposit of three to six months instead.',
      location: 'cl. 12' },
    { topic: 'Repair obligations', status: 'RED',
      summary: 'A full repairing obligation covering roof, structure and building services, and an obligation to hand the premises back in that condition whatever state they are in now.',
      proposal: 'Limit repairs to the interior, and attach a photographic schedule of condition so we are not liable for pre-existing disrepair.',
      location: 'cl. 8' },
    { topic: 'Term & termination', status: 'RED',
      summary: 'Five years with no break clause at all.',
      proposal: 'Add a tenant break at year three on six months\' notice. A five-year commitment with no exit is a significant liability for an organisation on annual funding cycles.',
      location: 'cl. 2' },
    { topic: 'Service charge', status: 'ORANGE',
      summary: 'We pay "a fair proportion" of the landlord\'s costs, with no cap and no definition of what is included.',
      proposal: 'Add an annual cap, exclude improvements and historic disrepair, and require an itemised statement.',
      location: 'cl. 9' },
    { topic: 'Rent review', status: 'ORANGE',
      summary: 'Annual upward-only review to open market rent.',
      proposal: 'Move to a review every three years, capped at inflation.',
      location: 'cl. 5' },
  ],
  missing_clauses: ['No express right to share space with partner organisations', 'No landlord obligation to insure'],
  gdpr: { applicable: false, dpa_present: 'unknown', note: 'No personal data is processed under this lease.' },
  red_flags: [
    { title: 'Trustee personal guarantee', severity: 'high', location: 'cl. 12',
      issue: 'Two trustees would be personally liable for five years of rent and repair obligations.',
      recommendation: 'Refuse. Offer a rent deposit instead — trustees should not take on personal liability for organisational premises.' },
    { title: 'Full repairing liability', severity: 'high', location: 'cl. 8',
      issue: 'We would be responsible for the roof and structure, including any disrepair that already exists.',
      recommendation: 'Commission a survey, attach a schedule of condition, and limit the obligation to the interior.' },
    { title: 'No break clause', severity: 'high', location: 'cl. 2',
      issue: 'Five years with no exit, against funding that is agreed annually.',
      recommendation: 'Negotiate a break at year three.' },
  ],
  red_flags_beyond_scope: [],
  recommendation: 'Proceed with amendments',
  recommendation_reason: 'The premises are suitable and the rent is at market, but the guarantee, repairing obligation and absence of a break right must change before signature.',
  confidence: 'high',
};

const ashfordReview = {
  summary: [
    'A two-year restricted grant for the Housing Advice Programme, paid quarterly in arrears.',
    'The funder requires prior approval before we undertake strategic litigation, policy or media work — this cuts across our independence.',
    'Clawback is at the funder\'s sole discretion, which makes the income unpredictable.',
    'The funder would own all materials we produce with the grant.',
    'Recommend proceeding with amendments; the approval clause is the one that matters most.',
  ],
  reviewed_topics: [
    { topic: 'Independence', status: 'RED',
      summary: 'We would need the funder\'s written approval before starting any strategic litigation, policy or media activity connected to the funded work, and must avoid statements the funder considers damaging to its reputation.',
      proposal: 'Replace approval with advance notification. Our casework and advocacy positions cannot be subject to funder consent — and a funder veto over litigation may also sit badly with our charitable objects.',
      location: 'cl. 5' },
    { topic: 'Clawback', status: 'RED',
      summary: 'The funder can demand repayment of all or part of the grant if, in its sole discretion, it thinks the money was not applied effectively.',
      proposal: 'Limit clawback to objective triggers: unspent funds at the end of the term, or use outside the agreed purpose. Add a cure period and a right to be heard first.',
      location: 'cl. 9' },
    { topic: 'IP in outputs', status: 'RED',
      summary: 'All materials produced with the grant would belong to the funder.',
      proposal: 'We retain ownership; the funder gets a perpetual non-exclusive licence to use the materials. Advice guides we write should remain usable in our other work.',
      location: 'cl. 11' },
    { topic: 'Reporting burden', status: 'ORANGE',
      summary: 'Monthly narrative and financial reports plus case-level data including client outcomes, in the funder\'s format.',
      proposal: 'Move to quarterly reporting and aggregate, anonymised outcome data. Case-level client data cannot be shared without a lawful basis and would risk client confidentiality.',
      location: 'cl. 6' },
    { topic: 'Payment', status: 'ORANGE',
      summary: 'Paid quarterly in arrears, and only after reports are approved.',
      proposal: 'Request payment in advance, or at least remove approval as a precondition — arrears funding shifts the cash-flow risk entirely onto us.',
      location: 'cl. 4' },
  ],
  missing_clauses: ['No clause on what happens to unspent funds at the end of the term', 'No named contact or variation procedure'],
  gdpr: { applicable: true, dpa_present: 'no',
    note: 'Clause 6 would require sharing case-level client data with the funder. There is no lawful basis identified and no data sharing agreement. This needs to change to aggregated, anonymised reporting.' },
  red_flags: [
    { title: 'Funder approval over casework', severity: 'high', location: 'cl. 5',
      issue: 'The funder would have a veto over strategic litigation, policy and media work relating to the funded programme.',
      recommendation: 'Replace prior approval with notification. Independence over legal strategy is not something we can give a funder.' },
    { title: 'Client data in reporting', severity: 'high', location: 'cl. 6',
      issue: 'Monthly case-level reporting including client outcomes would disclose client information to a third party without a lawful basis.',
      recommendation: 'Offer aggregated, anonymised outcome data instead, and record that in the agreement.' },
    { title: 'Discretionary clawback', severity: 'high', location: 'cl. 9',
      issue: 'Repayment can be demanded at the funder\'s sole discretion, with no objective test and no right of reply.',
      recommendation: 'Narrow to objective triggers with a cure period.' },
    { title: 'Funder owns our materials', severity: 'medium', location: 'cl. 11',
      issue: 'Advice materials we create would belong to the funder, so we could not reuse them elsewhere.',
      recommendation: 'We keep ownership; grant the funder a non-exclusive licence.' },
  ],
  red_flags_beyond_scope: [],
  recommendation: 'Proceed with amendments',
  recommendation_reason: 'The funding is valuable and the purpose fits our strategy, but the approval, reporting and clawback clauses need to change before we can sign.',
  confidence: 'high',
};

const rowanReview = {
  summary: [
    'A mutual NDA to explore a pro bono referral partnership — light-touch and broadly market standard.',
    'Obligations are reciprocal, with the usual carve-outs including disclosure required by law.',
    'The five-year confidentiality period is slightly longer than our normal three, but acceptable here.',
    'No issues that would prevent signature.',
  ],
  reviewed_topics: [
    { topic: 'Confidentiality', status: 'ORANGE',
      summary: 'Mutual obligations, need-to-know sharing with equivalent obligations on staff, running for five years from disclosure.',
      proposal: 'Three years would be our normal position, but five is acceptable for a referral partnership. No change needed unless the other side reopens it.',
      location: 'cl. 3, 5' },
    { topic: 'Governing law', status: 'GREEN',
      summary: 'Dutch law, courts of Amsterdam.', proposal: '', location: 'cl. 7' },
    { topic: 'Liability', status: 'GREEN',
      summary: 'No liability provisions — normal for a mutual NDA of this kind, so ordinary legal principles apply.',
      proposal: '', location: 'not found in document' },
  ],
  missing_clauses: ['No express term on the fate of copies held in backups'],
  gdpr: { applicable: false, dpa_present: 'unknown',
    note: 'No personal data is shared under the NDA itself. If client details are exchanged during the partnership, a separate data sharing agreement will be needed.' },
  red_flags: [],
  red_flags_beyond_scope: [],
  recommendation: 'Proceed',
  recommendation_reason: 'Standard mutual NDA with reciprocal terms and the usual carve-outs. Safe to sign.',
  confidence: 'high',
};

const meridianReview = {
  summary: [
    'A data processing agreement for offsite backup of our systems, including case files.',
    'The sub-processor objection window is five days and consent is deemed if we miss it.',
    'On-site audits are excluded; only a third-party report is offered.',
    'Deletion on exit takes up to ninety days.',
    'Recommend proceeding with amendments — none of the issues are dealbreakers.',
  ],
  reviewed_topics: [
    { topic: 'Data & privacy', status: 'ORANGE',
      summary: 'Sub-processors can be added by publishing a list on the supplier\'s website, and we are deemed to consent unless we object within five days.',
      proposal: 'Require direct written notice with a 30-day objection window, and a right to terminate without penalty if we object.',
      location: 'cl. 4' },
    { topic: 'Audit rights', status: 'ORANGE',
      summary: 'We can request the supplier\'s most recent third-party audit report. On-site audits are excluded entirely.',
      proposal: 'Accept the report as the normal route, but reserve an on-site audit right following a personal data breach.',
      location: 'cl. 9' },
    { topic: 'Deletion on exit', status: 'ORANGE',
      summary: 'Personal data is deleted within ninety days of termination.',
      proposal: 'Reduce to 30 days, and require written confirmation once deletion is complete.',
      location: 'cl. 11' },
    { topic: 'Breach notification', status: 'GREEN',
      summary: 'The supplier notifies us of a personal data breach without undue delay.',
      proposal: '', location: 'cl. 7' },
    { topic: 'Security', status: 'GREEN',
      summary: 'Encryption at rest and in transit, with appropriate technical and organisational measures.',
      proposal: '', location: 'cl. 6' },
  ],
  missing_clauses: ['No specified notification deadline in hours', 'No named data protection contact'],
  gdpr: { applicable: true, dpa_present: 'yes',
    note: 'This is the DPA itself and it covers the Article 28 essentials. The sub-processor and deletion terms are weaker than our standard but workable with amendments.' },
  red_flags: [
    { title: 'Deemed sub-processor consent', severity: 'medium', location: 'cl. 4',
      issue: 'New sub-processors can be added by a website update, with silence for five days treated as our consent — we could end up with client backups at an unknown provider.',
      recommendation: 'Require direct notice, a 30-day objection window and an exit right if we object.' },
  ],
  red_flags_beyond_scope: [],
  recommendation: 'Proceed with amendments',
  recommendation_reason: 'A workable processing agreement. Tighten the sub-processor notice, deletion window and post-breach audit right.',
  confidence: 'medium',
};

// ── The demo dataset ─────────────────────────────────────────────────────────

const requests = [
  {
    id: 'demo-0001-caseflow', createdAt: daysAgo(2), updatedAt: daysAgo(1), status: 'In progress',
    entity: 'Northside Legal Aid', team: 'IT & Data', contractType: 'SaaS / software',
    counterpartyName: 'CaseFlow Solutions Inc.', signerName: 'Ellen Marsh', signerEmail: 'ellen.marsh@caseflow.example',
    counterpartyLocation: 'Outside the EU', relationship: 'No, new counterparty',
    context: 'Replacement case management system for all advice teams. Vendor paper. They want signature before the end of the quarter.',
    deadline: '2026-08-14', amountPerYear: '€25k–€50k', totalValue: '> €50k', term: '1–3 years',
    personalData: 'Yes — also client data', dataSubjects: '≥ 100',
    criticalSystems: 'Yes — counterparty operates/accesses critical systems', ip: 'No',
    procurement: 'Yes', internalApproval: 'Yes',
    contractFileName: 'caseflow-msa.txt', contractFilePath: docs.caseflow,
    assignedTo: 'Amara Osei', aiStatus: 'AI review complete', review: caseflowReview,
    grounding: { verified: 11, downgraded: 0 },
  },
  {
    id: 'demo-0002-harbourside', createdAt: daysAgo(4), updatedAt: daysAgo(4), status: 'New',
    entity: 'Northside Legal Aid', team: 'Operations', contractType: 'Lease / premises',
    counterpartyName: 'Harbourside Property Holdings Ltd', signerName: 'Robert Nkemdirim', signerEmail: 'r.nkemdirim@harboursideproperty.example',
    counterpartyLocation: 'EU/EEA', relationship: 'No, new counterparty',
    context: 'New office for the housing team after the Bell Street lease ends. Landlord standard form, they have asked for trustee guarantees.',
    deadline: '2026-09-30', amountPerYear: '€25k–€50k', totalValue: '> €50k', term: '> 3 years',
    personalData: 'No', dataSubjects: '', criticalSystems: 'No', ip: 'No',
    procurement: 'No', internalApproval: 'Not yet',
    contractFileName: 'harbourside-lease.txt', contractFilePath: docs.harbourside,
    assignedTo: '', aiStatus: 'AI review complete', review: harbourReview,
    grounding: { verified: 8, downgraded: 0 },
  },
  {
    id: 'demo-0003-ashford', createdAt: daysAgo(6), updatedAt: daysAgo(2), status: 'In progress',
    entity: 'Northside Legal Aid Foundation', team: 'Fundraising & Grants', contractType: 'Grant / funding agreement',
    counterpartyName: 'The Ashford Trust', signerName: 'Margaret Vale', signerEmail: 'm.vale@ashfordtrust.example',
    counterpartyLocation: 'EU/EEA', relationship: 'Yes — but a new/additional contract',
    context: 'Two-year restricted grant for the Housing Advice Programme. Their standard agreement — the approval clause looks new this year.',
    deadline: '2026-08-29', amountPerYear: '€25k–€50k', totalValue: '€25k–€50k', term: '1–3 years',
    personalData: 'Yes — also client data', dataSubjects: '< 100', criticalSystems: 'No',
    ip: 'Yes — new work is created under the agreement', procurement: 'No', internalApproval: 'Yes',
    contractFileName: 'ashford-grant.txt', contractFilePath: docs.ashford,
    assignedTo: 'Daniel Reyes', aiStatus: 'AI review complete', review: ashfordReview,
    grounding: { verified: 9, downgraded: 1 },
  },
  {
    id: 'demo-0004-rowan', createdAt: daysAgo(11), updatedAt: daysAgo(8), status: 'Done',
    entity: 'Northside Legal Aid', team: 'Casework', contractType: 'NDA',
    counterpartyName: 'Rowan & Fletcher LLP', signerName: 'Iris Chen', signerEmail: 'i.chen@rowanfletcher.example',
    counterpartyLocation: 'EU/EEA', relationship: 'No, new counterparty',
    context: 'Mutual NDA before discussing a pro bono referral partnership for housing possession cases.',
    deadline: '', amountPerYear: 'None / Not applicable', totalValue: 'None / not applicable', term: '≤ 1 year',
    personalData: 'No', dataSubjects: '', criticalSystems: 'No', ip: 'No',
    procurement: 'No', internalApproval: 'Yes',
    contractFileName: 'rowan-nda.txt', contractFilePath: docs.rowan,
    assignedTo: 'Priya Raman', aiStatus: 'AI review complete', review: rowanReview,
    grounding: { verified: 4, downgraded: 0 },
    decision: 'Proceed', reviewer: 'Priya Raman', decidedAt: daysAgo(8),
    decisionNotes: 'Standard mutual NDA, five-year term acceptable for a referral partnership. Approved for signature.',
  },
  {
    id: 'demo-0005-meridian', createdAt: daysAgo(1), updatedAt: daysAgo(1), status: 'New',
    entity: 'Northside Legal Aid', team: 'IT & Data', contractType: 'DPA / data processing',
    counterpartyName: 'Meridian Cloud Backup B.V.', signerName: 'Joost Bakker', signerEmail: 'j.bakker@meridianbackup.example',
    counterpartyLocation: 'EU/EEA', relationship: 'Yes — renewal/extension of an existing contract',
    context: 'Renewal of the offsite backup DPA. Same supplier as last year, they have updated their template.',
    deadline: '2026-08-20', amountPerYear: '€5k–€25k', totalValue: '€25k–€50k', term: '1–3 years',
    personalData: 'Yes — also client data', dataSubjects: '≥ 100', criticalSystems: 'No', ip: 'No',
    procurement: 'No', internalApproval: 'Yes',
    contractFileName: 'meridian-dpa.txt', contractFilePath: docs.meridian,
    assignedTo: '', aiStatus: 'AI review complete', review: meridianReview,
    grounding: { verified: 7, downgraded: 0 },
  },
  {
    id: 'demo-0006-brightfutures', createdAt: daysAgo(9), updatedAt: daysAgo(7), status: 'Discarded',
    entity: 'Northside Advice Centre', team: 'Casework', contractType: 'Partnership / MOU',
    counterpartyName: 'Bright Futures Mentoring', signerName: 'Aisha Bello', signerEmail: 'aisha@brightfutures.example',
    counterpartyLocation: 'EU/EEA', relationship: 'Yes — but a new/additional contract',
    context: 'Referral MOU for young people leaving care.',
    deadline: '', amountPerYear: 'None / Not applicable', totalValue: 'None / not applicable', term: '≤ 1 year',
    personalData: 'Yes — also client data', dataSubjects: '< 100', criticalSystems: 'No', ip: 'No',
    procurement: 'No', internalApproval: 'Not yet',
    contractFileName: '', assignedTo: '',
    aiStatus: 'No contract file uploaded',
    discardReason: 'Duplicate — submitted twice by the casework team. Being handled under request 0007.',
  },
];

// Recompute the tier from the intake answers so the demo data is genuinely produced
// by the risk engine rather than hard-coded.
const { classifyRisk } = await import('./riskEngine.mjs');
for (const r of requests) {
  const cls = classifyRisk(r);
  r.tier = cls.tier;
  r.triggers = cls.triggers;
  r.mandatoryReview = cls.mandatoryReview;
  if (r.review) r.aiMeta = { modelId: 'demo (stored review)', region: 'n/a', stopReason: 'end_turn' };
  r.contractText = r.contractFilePath ? fs.readFileSync(r.contractFilePath, 'utf8') : '';
  // The dashboard/detail UI reads a documents[] list (main contract first, then annexes).
  r.documents = r.contractFileName ? [{ index: 0, name: r.contractFileName, path: r.contractFilePath }] : [];
}

// Wipe and reload.
const dbFile = path.join(dir, 'data', 'requests.json');
fs.mkdirSync(path.dirname(dbFile), { recursive: true });
fs.writeFileSync(dbFile, '[]');
requests.forEach((r) => store.put(r));

console.log(`✅ Seeded ${requests.length} demo requests:\n`);
for (const r of requests) {
  console.log(`   ${String(r.tier).padEnd(6)} ${String(r.status).padEnd(12)} ${r.counterpartyName}  (${r.contractType})`);
}
console.log('\nStart the app with ./run.sh, then sign in at /legal with the demo password.');
