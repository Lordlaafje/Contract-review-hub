/**
 * bedrock.mjs — Bedrock InvokeModel wrapper. EU-first (eu-central-1 + EU inference profile).
 *
 * Two credential modes:
 *  - DEV (default): uses the local AWS credential chain (AWS_PROFILE=sso-bedrock).
 *  - PROD: if BEDROCK_ASSUME_ROLE_ARN is set, the app assumes that role via STS first —
 *    this is the self-serve "llm-access" path (the Terraform module outputs the role
 *    ARN; the app assumes it, then calls Bedrock). Region stays eu-central-1 unless
 *    BEDROCK_REGION overrides it. NOTE: EU support depends on the granted role's policy
 *    permitting eu-central-1 — confirm with ML Solutions (the module example uses us-east-1).
 */
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';

const REGION = process.env.BEDROCK_REGION || 'eu-central-1';
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'eu.anthropic.claude-opus-4-8';
const ANTHROPIC_VERSION = 'bedrock-2023-05-31';
const MAX_RETRIES = 4;
const ASSUME_ROLE_ARN = process.env.BEDROCK_ASSUME_ROLE_ARN || '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Client (with optional STS assume-role, cached until near expiry) ──
let cachedClient = null;
let cachedUntil = 0;

async function getClient() {
  if (!ASSUME_ROLE_ARN) {
    // DEV: default credential chain.
    cachedClient = cachedClient || new BedrockRuntimeClient({ region: REGION });
    return cachedClient;
  }
  // PROD: assume the llm-access role, reuse creds until ~5 min before expiry.
  const now = Date.now();
  if (cachedClient && now < cachedUntil) return cachedClient;
  const sts = new STSClient({ region: REGION });
  const out = await sts.send(new AssumeRoleCommand({
    RoleArn: ASSUME_ROLE_ARN,
    RoleSessionName: 'hf-contract-review',
    DurationSeconds: 3600,
  }));
  const c = out.Credentials;
  cachedClient = new BedrockRuntimeClient({
    region: REGION,
    credentials: { accessKeyId: c.AccessKeyId, secretAccessKey: c.SecretAccessKey, sessionToken: c.SessionToken },
  });
  cachedUntil = new Date(c.Expiration).getTime() - 5 * 60 * 1000;
  return cachedClient;
}

function isTransient(err) {
  const n = err?.name || '';
  const s = err?.$metadata?.httpStatusCode;
  return /Throttling|TooManyRequests|ModelTimeout|ServiceUnavailable|InternalServer/.test(n)
    || (typeof s === 'number' && s >= 500);
}

export async function runReview(prompt, { maxTokens = 4096 } = {}) {
  const body = {
    anthropic_version: ANTHROPIC_VERSION,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };
  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(body),
  });

  let attempt = 0;
  while (true) {
    try {
      const client = await getClient();
      const out = await client.send(command);
      const decoded = JSON.parse(Buffer.from(out.body).toString('utf8'));
      const text = (decoded.content || []).map((c) => c.text || '').join('');
      return {
        text,
        stopReason: decoded.stop_reason || null,
        needsHuman: decoded.stop_reason === 'refusal' || decoded.stop_reason === 'max_tokens',
        modelId: MODEL_ID,
        region: REGION,
      };
    } catch (err) {
      attempt += 1;
      if (attempt > MAX_RETRIES || !isTransient(err)) throw err;
      await sleep(Math.floor(Math.random() * 250 * 2 ** (attempt - 1)));
    }
  }
}
