/**
 * settingsView.mjs — what the Settings page shows: the intake form, risk rules, playbook,
 * per-type AI focus and counsels, read from config.mjs.
 *
 * DEMO ONLY: the Settings page lets you edit these on screen, but nothing is saved — the
 * app keeps running on config.mjs. The values shown are the real ones in use.
 */
import { ORG, OPTIONS, PARAMS, TYPE_PROFILES, PLAYBOOK_GENERAL, POSITION_BANDS, ASSIGNEES } from './config.mjs';

const opts = (name) => ({ entity: ORG.entities, team: ORG.teams })[name] || OPTIONS[name] || [];

// The intake form as the requester sees it (mirrors web/src/pages/Intake.jsx).
const INTAKE = [
  { title: 'About you & the counterparty', fields: [
    ['entity', 'Our entity', 'select', true],
    ['team', 'Your team', 'select', true],
    ['counterpartyName', 'Counterparty name', 'text', true],
    ['counterpartyLocation', 'Where is the counterparty based?', 'select', true],
    ['relationship', 'Have we worked with this party before?', 'select', true],
  ] },
  { title: 'Signature details (DocuSign)', fields: [
    ['signerName', 'Signer name', 'text', true],
    ['signerEmail', 'Signer email', 'email', true],
  ] },
  { title: 'The contract', fields: [
    ['contractType', 'Type of contract', 'select', true],
    ['context', 'Context — what is it about and why do we need it?', 'textarea', true],
    ['deadline', 'By when do you need this? (deadline)', 'date', false],
    ['term', 'Term (initial period)', 'select', true],
    ['amountPerYear', 'Amount per year', 'select', true],
    ['totalValue', 'Total value over the full term', 'select', true],
  ] },
  { title: 'Data, IP & process', fields: [
    ['personalData', 'Will the counterparty access personal data?', 'select', true],
    ['dataSubjects', 'Roughly how many people? (if personal data)', 'select', false],
    ['criticalSystems', 'Operates/accesses critical systems?', 'select', true],
    ['ip', 'New work created or existing IP shared?', 'select', true],
    ['procurement', 'Procurement/tender involved?', 'select', true],
    ['internalApproval', 'Internal business approval obtained?', 'select', true],
  ] },
  { title: 'The document', fields: [
    ['contractFile', 'Upload the contract (PDF / DOCX)', 'file', true],
  ] },
];

export function settingsView() {
  return {
    demo: true,
    org: { name: ORG.name },
    intake: INTAKE.map((s) => ({
      title: s.title,
      fields: s.fields.map(([name, label, type, required]) => ({
        name, label, type, required, options: type === 'select' ? opts(name) : [],
      })),
    })),
    risk: {
      valueHigh: PARAMS.valueHigh,
      termHigh: PARAMS.termHigh,
      subjectsHigh: PARAMS.subjectsHigh,
      adequateCountries: PARAMS.adequateCountries,
      valueMandatory: PARAMS.valueMandatory,
      termMandatory: PARAMS.termMandatory,
      lowTotalValue: PARAMS.lowTotalValue,
      lowAnnualValue: PARAMS.lowAnnualValue,
      lowTerm: PARAMS.lowTerm,
      choices: { value: OPTIONS.totalValue, annual: OPTIONS.amountPerYear, term: OPTIONS.term, subjects: OPTIONS.dataSubjects },
    },
    playbook: { general: PLAYBOOK_GENERAL, bands: POSITION_BANDS },
    typeProfiles: Object.entries(TYPE_PROFILES).map(([type, p]) => ({ type, cap: p.cap, redflags: p.redflags, checklist: p.checklist })),
    assignees: ASSIGNEES,
  };
}
