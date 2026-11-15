/**
 * review.mjs — orchestrate one AI review: build prompt → model (OpenAI or Bedrock, see ai.mjs) → parse strict JSON →
 * light grounding check (downgrade unverifiable quoted citations).
 */
import { buildReviewPrompt } from './prompt.mjs';
import { runReview } from './ai.mjs';

function parseJson(text) {
  let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a !== -1 && b > a) return JSON.parse(t.substring(a, b + 1));
  throw new Error('model response was not valid JSON');
}

const norm = (s) => String(s || '').toLowerCase().replace(/[“”„‟"'`]/g, '').replace(/\s+/g, ' ').trim();

export function checkGrounded(location, src) {
  const raw = String(location || '').trim();
  if (!raw || raw.toLowerCase() === 'not found in document') return { verifiable: false, grounded: true };
  const n = norm(raw);
  if (n.length < 12) return { verifiable: false, grounded: true };
  // A bare clause reference ("art. 4", "arts. 2, 4 and 7", "§§ 3–5") can't be checked against
  // the text, so it is neither verified nor downgraded. Plurals matter: models often group them.
  if (/^(arts?\.?|articles?|sections?|secs?\.?|clauses?|cls?\.?|§§?|paras?\.?|paragraphs?|schedules?|annex(es)?|exhibits?|appendix|appendices)(?![a-z])[\s\d.,;:()a-z–&-]*$/.test(n))
    return { verifiable: false, grounded: true };
  const needle = n.length > 60 ? n.substring(0, 60) : n;
  return { verifiable: true, grounded: src.indexOf(needle) !== -1 };
}

function applyGrounding(review, sourceText) {
  const src = norm(sourceText);
  let verified = 0, downgraded = 0;
  const proc = (item, field) => {
    const res = checkGrounded(item.location, src);
    if (!res.verifiable) return;
    if (res.grounded) { verified++; return; }
    downgraded++;
    item.location = 'not found in document';
    if (!String(item[field] || '').startsWith('[UNVERIFIED CITATION]'))
      item[field] = '[UNVERIFIED CITATION] ' + (item[field] || '');
  };
  (review.reviewed_topics || []).forEach((t) => proc(t, 'summary'));
  (review.red_flags || []).forEach((r) => proc(r, 'issue'));
  (review.red_flags_beyond_scope || []).forEach((r) => proc(r, 'issue'));
  return { verified, downgraded };
}

export async function runAiReview({ request, tier, triggers, profile, contractText }) {
  const prompt = buildReviewPrompt({ request, tier, triggers, profile, contractText });
  const res = await runReview(prompt, { maxTokens: 4096 });
  if (res.needsHuman) {
    return { ok: false, status: 'Refused/cutoff — manual review', meta: res };
  }
  let review;
  try { review = parseJson(res.text); }
  catch (e) { return { ok: false, status: 'AI output not valid JSON — manual review', error: e.message, raw: res.text }; }
  const grounding = applyGrounding(review, contractText);
  return { ok: true, review, grounding, meta: { modelId: res.modelId, region: res.region, stopReason: res.stopReason } };
}
