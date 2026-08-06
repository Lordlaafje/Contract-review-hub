/**
 * riskEngine.mjs — deterministic risk classifier (NO AI).
 * Funnel: HIGH triggers → LOW paths → MEDIUM. Then any per-type tier cap (an NDA
 * never exceeds LOW). The mandatory-review flag is independent of the tier.
 * WHICH rules fired is always recorded, so every tier is explainable to a lawyer.
 *
 * Every threshold lives in config.mjs — this file is the logic, not the policy.
 */
import { PARAMS, TYPE_PROFILES } from './config.mjs';

const TIER_ORDER = { LOW: 0, MEDIUM: 1, HIGH: 2 };

/**
 * @param {Object} r intake fields: contractType, totalValue, amountPerYear, term,
 *   personalData, dataSubjects, criticalSystems, ip, relationship, counterpartyLocation,
 *   internalApproval.
 * @returns {{tier, triggers:string[], mandatoryReview:boolean, profile}}
 */
export function classifyRisk(r) {
  const totalValue = (r.totalValue || '').trim();
  const annualValue = (r.amountPerYear || '').trim();
  const term = (r.term || '').trim();
  const personalData = (r.personalData || '').trim();
  const subjects = (r.dataSubjects || '').trim();
  const criticalSystems = (r.criticalSystems || '').trim();
  const ip = (r.ip || '').trim();
  const relationship = (r.relationship || '').trim();
  const country = (r.counterpartyLocation || '').trim();

  const profile = TYPE_PROFILES[(r.contractType || '').trim()] || TYPE_PROFILES['Other'];

  const pdNone = /^no\b/i.test(personalData) || personalData === '';
  const pdStaffOnly = /staff|volunteer|employee/i.test(personalData);
  const pdAny = !pdNone;
  const isCritical = /^yes/i.test(criticalSystems);
  const countryAdequate = PARAMS.adequateCountries.some(
    (c) => c.toLowerCase() === country.toLowerCase());
  const isNewCounterparty = /^no,\s*new/i.test(relationship) || /new counterparty|new supplier/i.test(relationship);
  const valueNone = (v) => /^(none|€?\s*0\b|n\/?a|not applicable)/i.test(v);
  const valueUnknown = /not yet known/i.test(totalValue) || /not yet known/i.test(annualValue);

  // ── Step 1: HIGH triggers (any one is enough) ──
  const high = [];
  if (totalValue === PARAMS.valueHigh || annualValue === PARAMS.valueHigh)
    high.push(`High value (${PARAMS.valueHigh})`);
  if (term && term === PARAMS.termHigh)
    high.push(`Long term (${PARAMS.termHigh})`);
  if (subjects && subjects === PARAMS.subjectsHigh && pdAny)
    high.push(`Large-scale personal data (${PARAMS.subjectsHigh} people)`);
  if (!countryAdequate && pdAny)
    high.push('Cross-border data transfer (outside the EU + personal data)');
  if (/share existing|sharing existing/i.test(ip))
    high.push('We share existing IP or materials with the counterparty');
  if (isCritical)
    high.push('Counterparty operates or accesses critical systems');

  // ── Hard rule: mandatory legal review, independent of the tier ──
  const mandatoryValue = (v) => PARAMS.valueMandatory.includes(v);
  const mandatoryReview = mandatoryValue(totalValue) || mandatoryValue(annualValue)
    || PARAMS.termMandatory.includes(term);

  let result;
  if (high.length) {
    result = { tier: 'HIGH', triggers: high };
  } else {
    const lowFull =
      totalValue === PARAMS.lowTotalValue && annualValue === PARAMS.lowAnnualValue &&
      term === PARAMS.lowTerm &&
      (pdNone || pdStaffOnly) &&
      /^no/i.test(ip) &&
      countryAdequate &&
      !isCritical &&
      !isNewCounterparty &&
      !valueUnknown;
    const lowNoStakes = valueNone(totalValue) && pdNone && /^no/i.test(ip);

    if (lowFull || lowNoStakes) {
      result = { tier: 'LOW', triggers: [lowFull
        ? 'Standard low-risk (all low-risk criteria met)'
        : 'No money involved, no personal data, no IP created'] };
    } else {
      result = { tier: 'MEDIUM', triggers: ['No high-risk trigger, but not fully low-risk (default)'] };
    }
  }

  // ── Nuance flags (context for the lawyer; they don't change the tier) ──
  if (isNewCounterparty) result.triggers.push('• New counterparty — no track record (blocks low-risk)');
  if (/not yet/i.test(r.internalApproval || '')) result.triggers.push('• Internal approval not yet obtained');
  if (/client data/i.test(personalData)) result.triggers.push('• Client data involved — data processing agreement required');
  if (/new work/i.test(ip)) result.triggers.push('• New work created — check IP is assigned to us');
  if (valueUnknown) result.triggers.push('• Value not yet known — clarify before final assessment');

  // ── Per-type tier cap (e.g. an NDA never exceeds LOW) ──
  const cap = (profile.cap || 'NONE').toUpperCase();
  if (TIER_ORDER[cap] !== undefined && TIER_ORDER[cap] < TIER_ORDER[result.tier]) {
    result.triggers.push(`↓ Type cap: ${r.contractType} never exceeds ${cap} (lowered from ${result.tier})`);
    result.tier = cap;
  }

  result.mandatoryReview = mandatoryReview;
  result.profile = profile;
  return result;
}
