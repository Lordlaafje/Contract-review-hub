/**
 * ai.mjs — pick the model provider for the AI review.
 *
 *   AI_PROVIDER=openai | bedrock   force one
 *   (unset)                        OpenAI if OPENAI_API_KEY is set, otherwise Bedrock
 */
import * as openai from './openai.mjs';
import * as bedrock from './bedrock.mjs';

export function providerName() {
  const forced = String(process.env.AI_PROVIDER || '').toLowerCase();
  if (forced === 'openai' || forced === 'bedrock') return forced;
  return openai.isConfigured() ? 'openai' : 'bedrock';
}

export function runReview(prompt, opts) {
  return providerName() === 'openai' ? openai.runReview(prompt, opts) : bedrock.runReview(prompt, opts);
}
