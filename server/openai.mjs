/**
 * openai.mjs — OpenAI Chat Completions wrapper, same contract as bedrock.mjs's runReview.
 *
 * Active when OPENAI_API_KEY is set (see ai.mjs). Plain fetch, no SDK dependency.
 *   OPENAI_API_KEY   required
 *   OPENAI_MODEL     optional, default below
 *   OPENAI_REASONING_EFFORT  optional: none | minimal | low | medium | high (default low).
 *                    Higher is slower; at medium/high a review can take several minutes.
 *   OPENAI_BASE_URL  optional, for an Azure/OpenAI-compatible endpoint (default https://api.openai.com/v1)
 *
 * The review prompt asks for strict JSON, so the request uses JSON mode
 * (response_format: json_object) to keep the model from wrapping it in prose.
 */
export const MODEL_ID = process.env.OPENAI_MODEL || 'gpt-5.5';
const REASONING_EFFORT = process.env.OPENAI_REASONING_EFFORT ?? 'low';
const BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const MAX_RETRIES = 4;
const TIMEOUT_MS = 180_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const isConfigured = () => !!process.env.OPENAI_API_KEY;

function isTransient(status) {
  return status === 429 || status >= 500;
}

export async function runReview(prompt, { maxTokens = 4096 } = {}) {
  const body = {
    model: MODEL_ID,
    // Reasoning models spend part of this budget thinking before they answer, so allow
    // generous headroom over the visible-output budget the caller asks for.
    max_completion_tokens: Math.max(maxTokens * 4, 16000),
    response_format: { type: 'json_object' },
    // Non-reasoning models (e.g. gpt-4.1) reject this field: set OPENAI_REASONING_EFFORT= (empty) for those.
    ...(REASONING_EFFORT ? { reasoning_effort: REASONING_EFFORT } : {}),
    messages: [{ role: 'user', content: prompt }],
  };

  let attempt = 0;
  while (true) {
    let res;
    try {
      res = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      // Network error or timeout — retry like a 5xx.
      attempt += 1;
      if (attempt > MAX_RETRIES) throw new Error('OpenAI request failed: ' + err.message);
      await sleep(Math.floor(Math.random() * 500 * 2 ** (attempt - 1)));
      continue;
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      let message = detail;
      try { message = JSON.parse(detail)?.error?.message || detail; } catch {}
      attempt += 1;
      if (attempt > MAX_RETRIES || !isTransient(res.status)) {
        throw new Error(`OpenAI ${res.status}: ${String(message).slice(0, 300)}`);
      }
      await sleep(Math.floor(Math.random() * 500 * 2 ** (attempt - 1)));
      continue;
    }

    const decoded = await res.json();
    const choice = decoded.choices?.[0] || {};
    const finish = choice.finish_reason || null;
    const refused = !!choice.message?.refusal || finish === 'content_filter';
    return {
      text: choice.message?.content || '',
      stopReason: finish,
      needsHuman: refused || finish === 'length',
      modelId: decoded.model || MODEL_ID,
      region: 'openai',
    };
  }
}
