/**
 * notify.mjs — Slack notifications for the Legal team + the assigned counsel:
 *   • new request      → post to the Legal channel via an incoming webhook (SLACK_WEBHOOK_URL)
 *   • AI review ready  → follow-up to the Legal channel with the recommendation
 *                        (+ DM the assignee if already assigned)
 *   • assignment       → DM the assigned counsel via a bot token (SLACK_BOT_TOKEN)
 * All GATED: no env var → no-op (never breaks the request flow). See the README.
 *
 * Assignees are configured in config.mjs as { name, email } — the email is what resolves
 * the Slack DM (users.lookupByEmail). Free-entered assignees that are themselves an
 * email address also work.
 */
import { ASSIGNEES } from './config.mjs';

const env = () => ({
  webhook: process.env.SLACK_WEBHOOK_URL || '',
  botToken: process.env.SLACK_BOT_TOKEN || '',
  channel: process.env.SLACK_CHANNEL || '',
  siteUrl: (process.env.SITE_URL || 'http://localhost:5173').replace(/\/+$/, ''),
});

const TIER_EMOJI = { HIGH: '🔴', MEDIUM: '🟠', LOW: '🟢' };
const tierLabel = (r) => `${TIER_EMOJI[r.tier] || ''} ${(r.tier || '?').toUpperCase()}${r.mandatoryReview ? '  •  mandatory review' : ''}`;
const requestLink = (r) => `${env().siteUrl}/legal/requests/${r.id}`;

/** Resolve an assignee (name from the dropdown, or a free-entered email) to an email. */
export function resolveAssigneeEmail(nameOrEmail) {
  const v = String(nameOrEmail || '').trim();
  if (!v) return '';
  if (v.includes('@')) return v;
  const a = ASSIGNEES.find((x) => x.name.toLowerCase() === v.toLowerCase());
  return a?.email || '';
}

// ── Pure message builders (exported for tests) ──

export function buildNewRequestMessage(r, link) {
  return {
    text: `New contract review request: ${r.counterpartyName || 'N/A'} — ${(r.tier || '?').toUpperCase()}`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text:
        `*New contract review request*\n*Counterparty:* ${r.counterpartyName || 'N/A'}\n*Type:* ${r.contractType || 'N/A'}\n*Risk tier:* ${tierLabel(r)}\n*Team:* ${r.team || 'N/A'}${r.deadline ? `\n*Needed by:* ${r.deadline}` : ''}` } },
      { type: 'section', text: { type: 'mrkdwn', text: `*Context:*\n${(r.context || 'N/A').slice(0, 500)}` } },
      { type: 'section', text: { type: 'mrkdwn', text: `<${link}|Open in the Legal dashboard>` } },
    ],
  };
}

export function buildReviewReadyMessage(r, link) {
  const rec = r.review?.recommendation || 'n/a';
  const flags = (r.review?.red_flags || []).length + (r.review?.red_flags_beyond_scope || []).length;
  return {
    text: `AI review ready: ${r.counterpartyName || 'N/A'} — ${rec}`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text:
        `*AI review ready* — ${r.counterpartyName || 'N/A'} (${r.contractType || 'N/A'})\n*Risk tier:* ${tierLabel(r)}\n*AI recommendation:* ${rec}\n*Red flags:* ${flags}` } },
      { type: 'section', text: { type: 'mrkdwn', text: `<${link}|Open the review>` } },
    ],
  };
}

export function buildAssignmentMessage(r, link) {
  return {
    text: `You’ve been assigned a contract review: ${r.counterpartyName || 'N/A'}`,
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text:
      `You’ve been assigned a contract review.\n*Counterparty:* ${r.counterpartyName || 'N/A'}\n*Type:* ${r.contractType || 'N/A'}\n*Risk tier:* ${tierLabel(r)}${r.aiStatus === 'AI review complete' ? '\n*AI review:* ready' : ''}\n<${link}|Open the request>` } }],
  };
}

// ── Senders (all fire-and-forget; failures logged, never thrown) ──

async function postWebhook(payload) {
  const { webhook } = env();
  if (!webhook) return false;
  try {
    await fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    return true;
  } catch (e) { console.warn('Slack webhook failed:', e.message); return false; }
}

async function dmByEmail(email, payload) {
  const { botToken, channel } = env();
  if (!botToken || !email) return false;
  try {
    const lookup = await slack('users.lookupByEmail', { email });
    if (!lookup.ok || !lookup.user) {
      // Fall back to the shared channel (with context) so the ping is never silently lost.
      if (channel) await slack('chat.postMessage', { channel, ...payload });
      else console.warn(`Slack: no user found for ${email} and no SLACK_CHANNEL fallback`);
      return false;
    }
    await slack('chat.postMessage', { channel: lookup.user.id, ...payload });
    return true;
  } catch (e) { console.warn('Slack DM failed:', e.message); return false; }
}

/** New request → Legal channel. */
export async function notifyNewRequest(r) {
  await postWebhook(buildNewRequestMessage(r, requestLink(r)));
}

/** AI review finished → Legal channel follow-up; DM the assignee too if already assigned. */
export async function notifyReviewReady(r) {
  const msg = buildReviewReadyMessage(r, requestLink(r));
  await postWebhook(msg);
  const email = resolveAssigneeEmail(r.assignedTo);
  if (email) await dmByEmail(email, msg);
}

/** Assigned → DM the counsel. Accepts a name (resolved via config) or an email. */
export async function notifyAssignee(r, nameOrEmail) {
  const email = resolveAssigneeEmail(nameOrEmail);
  if (!email) return;
  await dmByEmail(email, buildAssignmentMessage(r, requestLink(r)));
}

async function slack(method, params) {
  const isGet = method.startsWith('users.');
  const url = 'https://slack.com/api/' + method + (isGet ? '?' + new URLSearchParams(params) : '');
  const res = await fetch(url, {
    method: isGet ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${env().botToken}`, ...(isGet ? {} : { 'content-type': 'application/json; charset=utf-8' }) },
    body: isGet ? undefined : JSON.stringify(params),
  });
  return res.json();
}
