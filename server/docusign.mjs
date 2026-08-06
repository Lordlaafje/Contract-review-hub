/**
 * docusign.mjs — DocuSign eSignature integration (JWT grant, no SDK).
 * Draft-only by policy: envelopes are created with status 'created' and are NEVER
 * auto-sent — a lawyer reviews and sends the envelope from DocuSign.
 *
 * ACCOUNT BINDING (the routing): the app impersonates ONE DocuSign user — typically
 * a shared contracts mailbox — so every envelope is created in, sent from, and
 * archived in that user's account. The account and API base URI are AUTO-DISCOVERED
 * from /oauth/userinfo after JWT auth (DocuSign's recommended flow), so a wrong-region
 * or wrong-account misconfig is impossible: set DOCUSIGN_ACCOUNT_ID only to pin a
 * specific account when the user belongs to several, and the app then verifies the
 * user is actually a member of it.
 *
 * Lifecycle helpers:
 *   createEnvelopeForRequest(request)      → draft envelope in the bound account
 *   getSenderViewUrl(envelopeId, returnUrl)→ short-lived URL straight into DocuSign's
 *                                            sender view (place tabs, review, send)
 *   getEnvelopeStatus(envelopeId)          → created|sent|delivered|completed|declined|voided
 *   downloadSignedDocument(envelopeId)     → combined PDF (once completed)
 *   getBindingInfo()                       → resolved account/user the envelopes route to
 *   pingAccount()                          → binding + a live API smoke call (docusign:check)
 *
 * GATED: if the DOCUSIGN_* env vars are not set it throws NOT_CONFIGURED, so the app
 * shows a clean "not configured" message instead of failing. Required env (see the README):
 *   DOCUSIGN_INTEGRATION_KEY  (client id)
 *   DOCUSIGN_USER_ID          (user GUID to impersonate — e.g. a shared contracts mailbox)
 *   DOCUSIGN_PRIVATE_KEY      (RSA private key PEM; JWT is signed with this)
 *   DOCUSIGN_OAUTH_BASE       https://account-d.docusign.com (sandbox, default)
 *                             https://account.docusign.com   (production)
 * Optional:
 *   DOCUSIGN_ACCOUNT_ID       pin one account when the user belongs to several
 *   DOCUSIGN_BASE_PATH        override the auto-discovered API base URI (rarely needed)
 * One-time: grant consent for the impersonated user (the "signature impersonation" scope)
 * — the OAuth error below includes the exact consent URL when it's missing.
 */
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

function need() {
  const e = process.env;
  const missing = ['DOCUSIGN_INTEGRATION_KEY', 'DOCUSIGN_USER_ID', 'DOCUSIGN_PRIVATE_KEY']
    .filter((k) => !e[k]);
  if (missing.length) { const err = new Error('DocuSign not configured (' + missing.join(', ') + ') — see the README'); err.code = 'NOT_CONFIGURED'; throw err; }
  return {
    oauthBase: e.DOCUSIGN_OAUTH_BASE || 'https://account-d.docusign.com',
    ik: e.DOCUSIGN_INTEGRATION_KEY, user: e.DOCUSIGN_USER_ID,
    key: e.DOCUSIGN_PRIVATE_KEY.replace(/\\n/g, '\n'),
    pinnedAccount: e.DOCUSIGN_ACCOUNT_ID || '',
    basePathOverride: (e.DOCUSIGN_BASE_PATH || '').replace(/\/+$/, ''),
  };
}

function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

// ── OAuth token cache (JWT tokens last 1h; reuse until ~5 min before expiry) ──
let cachedToken = null;
let cachedTokenUntil = 0;

async function getAccessToken(c) {
  if (cachedToken && Date.now() < cachedTokenUntil) return cachedToken;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: c.ik, sub: c.user, aud: c.oauthBase.replace(/^https?:\/\//, ''),
    iat: now, exp: now + 3600, scope: 'signature impersonation',
  }));
  const sig = b64url(crypto.sign('RSA-SHA256', Buffer.from(`${header}.${claims}`), c.key));
  const assertion = `${header}.${claims}.${sig}`;
  const res = await fetch(`${c.oauthBase}/oauth/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const data = await res.json();
  if (!res.ok) {
    const consentHint = data.error === 'consent_required'
      ? ` — grant one-time consent for the impersonated user: ${c.oauthBase}/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=${c.ik}&redirect_uri=<a redirect URI registered on the integration key>`
      : '';
    throw new Error('DocuSign OAuth failed: ' + (data.error_description || data.error || res.status) + consentHint);
  }
  cachedToken = data.access_token;
  cachedTokenUntil = Date.now() + Math.max(60, (Number(data.expires_in) || 3600) - 300) * 1000;
  return cachedToken;
}

// ── Account binding: resolve which account envelopes route to (cached) ──
let cachedBinding = null;

async function resolveBinding() {
  if (cachedBinding) return cachedBinding;
  const c = need();
  const token = await getAccessToken(c);
  const res = await fetch(`${c.oauthBase}/oauth/userinfo`, { headers: { authorization: `Bearer ${token}` } });
  const ui = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('DocuSign userinfo failed: ' + (ui.error_description || ui.error || res.status));

  const accounts = ui.accounts || [];
  let acct;
  if (c.pinnedAccount) {
    acct = accounts.find((a) => (a.account_id || '').toLowerCase() === c.pinnedAccount.toLowerCase());
    if (!acct) {
      throw new Error(`The impersonated user (${ui.email}) is not a member of the pinned account ${c.pinnedAccount}. `
        + 'Available: ' + (accounts.map((a) => `${a.account_name} (${a.account_id})`).join(', ') || 'none')
        + ' — check DOCUSIGN_USER_ID is the contracts-address user and DOCUSIGN_ACCOUNT_ID matches its account.');
    }
  } else {
    acct = accounts.find((a) => a.is_default) || accounts[0];
    if (!acct) throw new Error(`The impersonated user (${ui.email}) has no DocuSign accounts.`);
  }

  cachedBinding = {
    accountId: acct.account_id,
    accountName: acct.account_name,
    basePath: c.basePathOverride || (acct.base_uri || '').replace(/\/+$/, ''),
    userEmail: ui.email || '',
    userName: ui.name || '',
    environment: /account-d\./.test(c.oauthBase) ? 'sandbox' : 'production',
  };
  return cachedBinding;
}

/** The resolved account/user that envelopes route to (throws NOT_CONFIGURED when unset). */
export async function getBindingInfo() {
  return resolveBinding();
}

async function dsFetch(pathname, { method = 'GET', json, raw = false } = {}) {
  const c = need();
  const b = await resolveBinding();
  const token = await getAccessToken(c);
  const res = await fetch(`${b.basePath}/restapi/v2.1/accounts/${b.accountId}${pathname}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(json ? { 'content-type': 'application/json' } : {}) },
    body: json ? JSON.stringify(json) : undefined,
  });
  if (raw) {
    if (!res.ok) throw new Error(`DocuSign ${method} ${pathname} failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`DocuSign ${method} ${pathname} failed: ` + (data.message || data.errorCode || res.status));
  return data;
}

/** Binding + a live API smoke call — used by `npm run docusign:check`. */
export async function pingAccount() {
  const binding = await resolveBinding();
  const from = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const data = await dsFetch(`/envelopes?from_date=${from}&count=1`);
  return { binding, envelopesLast30d: Number(data.totalSetSize ?? data.resultSetSize ?? 0) };
}

/** Build the envelope definition (exported for testing — pure, no network). */
export function buildEnvelopeDefinition(request, fileBytes) {
  const name = request.contractFileName || 'contract';
  const ext = name.toLowerCase().endsWith('.pdf') ? 'pdf' : name.toLowerCase().endsWith('.docx') ? 'docx' : 'pdf';
  return {
    emailSubject: `Please sign: ${request.counterpartyName || 'contract'} (${request.contractType || ''})`,
    status: 'created', // DRAFT — a lawyer reviews & sends from DocuSign; never auto-sent
    documents: [{ documentBase64: fileBytes.toString('base64'), name, fileExtension: ext, documentId: '1' }],
    recipients: {
      signers: [{ email: request.signerEmail, name: request.signerName, recipientId: '1', routingOrder: '1',
        // Anchor tab is a convenience; most contracts won't contain '/sn1/', and the lawyer
        // places/adjusts tabs in the sender view anyway — so never fail on a missing anchor.
        tabs: { signHereTabs: [{ anchorString: '/sn1/', anchorUnits: 'pixels', anchorXOffset: '20', anchorYOffset: '10', anchorIgnoreIfNotPresent: 'true' }] } }],
    },
  };
}

export async function createEnvelopeForRequest(request) {
  need(); // fail fast with NOT_CONFIGURED before reading the file
  if (!request.signerEmail || !request.signerName) { const err = new Error('Signer name and email are required for DocuSign'); err.code = 'BAD_REQUEST'; throw err; }
  if (!request.contractFilePath) { const err = new Error('No contract file to send'); err.code = 'BAD_REQUEST'; throw err; }

  const fileBytes = await fs.readFile(request.contractFilePath);
  const envelope = buildEnvelopeDefinition(request, fileBytes);

  const data = await dsFetch('/envelopes', { method: 'POST', json: envelope });
  return { envelopeId: data.envelopeId, sentTo: request.signerEmail,
    status: data.status || 'created', createdAt: new Date().toISOString() };
}

/** Short-lived (~5 min) URL that opens the draft in DocuSign's sender view. */
export async function getSenderViewUrl(envelopeId, returnUrl) {
  const data = await dsFetch(`/envelopes/${encodeURIComponent(envelopeId)}/views/sender`, {
    method: 'POST', json: { returnUrl },
  });
  return data.url;
}

/** Current envelope state: created | sent | delivered | completed | declined | voided. */
export async function getEnvelopeStatus(envelopeId) {
  const data = await dsFetch(`/envelopes/${encodeURIComponent(envelopeId)}`);
  return {
    envelopeId,
    status: data.status,
    statusChangedAt: data.statusChangedDateTime || null,
    sentAt: data.sentDateTime || null,
    completedAt: data.completedDateTime || null,
    voidedReason: data.voidedReason || null,
  };
}

/** Combined signed PDF (all documents + certificate of completion). */
export async function downloadSignedDocument(envelopeId) {
  return dsFetch(`/envelopes/${encodeURIComponent(envelopeId)}/documents/combined`, { raw: true });
}
