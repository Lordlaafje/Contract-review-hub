/**
 * riskEngine tests — the deterministic tier funnel must stay explainable and
 * reproducible. Field values are the EXACT intake strings from config.mjs OPTIONS.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyRisk } from '../riskEngine.mjs';

// A request that hits the "fully low" path; override fields per test.
const lowBase = {
  contractType: 'Service agreement',
  totalValue: '< €25k',
  amountPerYear: '< €5k',
  term: '≤ 1 year',
  personalData: 'No',
  dataSubjects: '',
  criticalSystems: 'No',
  ip: 'No',
  relationship: 'Yes — renewal/extension of an existing contract',
  counterpartyLocation: 'EU/EEA',
  internalApproval: 'Yes',
};
const req = (over = {}) => ({ ...lowBase, ...over });

// ── LOW paths ──

test('fully-low request → LOW, no mandatory review', () => {
  const r = classifyRisk(req());
  assert.equal(r.tier, 'LOW');
  assert.equal(r.mandatoryReview, false);
});

test('no value + no personal data + no IP → LOW', () => {
  const r = classifyRisk(req({ totalValue: 'None / not applicable', amountPerYear: 'None / Not applicable', term: '1–3 years' }));
  assert.equal(r.tier, 'LOW');
});

// ── HIGH triggers (each alone is enough) ──

const HIGH_CASES = [
  ['total value > €50k', { totalValue: '> €50k' }],
  ['annual value > €50k', { amountPerYear: '> €50k' }],
  ['term > 3 years', { term: '> 3 years' }],
  ['≥ 100 data subjects', { dataSubjects: '≥ 100', personalData: 'Yes — also client data' }],
  ['non-EU + personal data', { counterpartyLocation: 'Outside the EU', personalData: 'Yes — also client data' }],
  ['existing IP shared', { ip: 'Yes — we share existing IP or materials with the counterparty' }],
  ['critical systems', { criticalSystems: 'Yes — counterparty operates/accesses critical systems' }],
];
for (const [label, over] of HIGH_CASES) {
  test(`HIGH trigger: ${label}`, () => {
    const r = classifyRisk(req(over));
    assert.equal(r.tier, 'HIGH', `expected HIGH for ${label}, got ${r.tier} (${r.triggers.join('; ')})`);
  });
}

test('non-EU WITHOUT personal data is not H5', () => {
  const r = classifyRisk(req({ counterpartyLocation: 'Outside the EU', personalData: 'No' }));
  assert.notEqual(r.tier, 'HIGH');
});

// ── MEDIUM default + LOW blockers ──

test('no HIGH trigger, not fully low → MEDIUM', () => {
  const r = classifyRisk(req({ totalValue: '€25k–€50k' }));
  assert.equal(r.tier, 'MEDIUM');
});

test('new counterparty blocks the fully-low path → MEDIUM', () => {
  const r = classifyRisk(req({ relationship: 'No, new counterparty' }));
  assert.equal(r.tier, 'MEDIUM');
  assert.match(r.triggers.join(' '), /new counterparty/i);
});

test('unknown value blocks the fully-low path → MEDIUM', () => {
  const r = classifyRisk(req({ totalValue: 'Not yet known' }));
  assert.equal(r.tier, 'MEDIUM');
});

// ── Hard rule (mandatory review) is independent of the tier ──

test('value ≥ €25k → mandatory review flag', () => {
  const r = classifyRisk(req({ totalValue: '€25k–€50k' }));
  assert.equal(r.mandatoryReview, true);
});

test('term > 1 year → mandatory review flag even when the tier is capped LOW', () => {
  const r = classifyRisk(req({ contractType: 'NDA', term: '1–3 years' }));
  assert.equal(r.tier, 'LOW');
  assert.equal(r.mandatoryReview, true);
});

// ── NDA tier cap ──

test('NDA caps at LOW even when a HIGH trigger fires; hard rule still applies', () => {
  const r = classifyRisk(req({ contractType: 'NDA', totalValue: '> €50k' }));
  assert.equal(r.tier, 'LOW');
  assert.match(r.triggers.join(' '), /type cap/i);
  assert.equal(r.mandatoryReview, true, 'the mandatory-review hard rule is independent of the cap');
});

// ── Explainability: WHICH rules fired is always recorded ──

test('triggers are recorded for every tier', () => {
  for (const over of [{}, { totalValue: '> €100k' }, { totalValue: '€25k–€50k' }]) {
    const r = classifyRisk(req(over));
    assert.ok(r.triggers.length > 0, `expected recorded triggers for ${r.tier}`);
  }
});

test('unknown contract type falls back to the Other profile', () => {
  const r = classifyRisk(req({ contractType: 'Something exotic' }));
  assert.equal(r.profile.key, 'OTHER');
});
