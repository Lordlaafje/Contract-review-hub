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

/** For the dashboard health strip: which provider and model, and whether it has credentials. */
export function describeProvider() {
  if (providerName() === 'openai') {
    return { provider: 'OpenAI', model: openai.MODEL_ID, configured: openai.isConfigured() };
  }
  const configured = !!(process.env.AWS_PROFILE || process.env.AWS_ACCESS_KEY_ID || process.env.BEDROCK_ASSUME_ROLE_ARN);
  return { provider: 'AWS Bedrock', model: bedrock.MODEL_ID, region: bedrock.REGION, configured };
}

export function runReview(prompt, opts) {
  return providerName() === 'openai' ? openai.runReview(prompt, opts) : bedrock.runReview(prompt, opts);
}
