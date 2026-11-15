/**
 * OpenAI wrapper + provider selection tests — fetch is stubbed, nothing leaves the machine.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { runReview } from '../openai.mjs';
import { providerName } from '../ai.mjs';

const realFetch = globalThis.fetch;
const env = { ...process.env };
let calls;

function stub(...responses) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const r = responses.shift();
    return new Response(JSON.stringify(r.json), { status: r.status || 200 });
  };
}

const ok = (content, finish = 'stop') => ({
  json: { model: 'gpt-test', choices: [{ message: { content }, finish_reason: finish }] },
});

beforeEach(() => { process.env.OPENAI_API_KEY = 'sk-test'; delete process.env.AI_PROVIDER; });
afterEach(() => { globalThis.fetch = realFetch; process.env = { ...env }; });

test('sends the prompt in JSON mode with the bearer key and returns the text', async () => {
  stub(ok('{"recommendation":"Sign"}'));
  const out = await runReview('Review this. Respond in JSON.');
  assert.equal(out.text, '{"recommendation":"Sign"}');
  assert.equal(out.needsHuman, false);
  assert.equal(out.modelId, 'gpt-test');
  assert.match(calls[0].url, /\/chat\/completions$/);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer sk-test');
  assert.deepEqual(calls[0].body.response_format, { type: 'json_object' });
  assert.equal(calls[0].body.messages[0].content, 'Review this. Respond in JSON.');
});

test('a cut-off answer or a refusal goes to manual review', async () => {
  stub(ok('{"partial":', 'length'));
  assert.equal((await runReview('x')).needsHuman, true);
  stub({ json: { choices: [{ message: { content: null, refusal: 'no' }, finish_reason: 'stop' }] } });
  assert.equal((await runReview('x')).needsHuman, true);
});

test('retries a 429, then succeeds', async () => {
  stub({ status: 429, json: { error: { message: 'slow down' } } }, ok('{}'));
  const out = await runReview('x');
  assert.equal(out.text, '{}');
  assert.equal(calls.length, 2);
});

test('a bad key fails at once with OpenAI\'s message', async () => {
  stub({ status: 401, json: { error: { message: 'Incorrect API key provided' } } });
  await assert.rejects(runReview('x'), /OpenAI 401: Incorrect API key provided/);
  assert.equal(calls.length, 1);
});

test('provider: OpenAI when a key is set, Bedrock otherwise, AI_PROVIDER overrides', () => {
  assert.equal(providerName(), 'openai');
  process.env.AI_PROVIDER = 'bedrock';
  assert.equal(providerName(), 'bedrock');
  delete process.env.AI_PROVIDER;
  delete process.env.OPENAI_API_KEY;
  assert.equal(providerName(), 'bedrock');
});
