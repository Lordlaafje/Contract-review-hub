/**
 * server.mjs — Express backend for the contract-review demo.
 * The demo uses a JSON store, local disk uploads, and a password gate; production swaps
 * these for a DB, object storage, and SSO. In production (NODE_ENV=production) the app
 * refuses to boot without LEGAL_PASSWORD — no default credential outside dev.
 *
 * Run:  AWS_PROFILE=sso-bedrock AWS_REGION=eu-central-1 npm start
 */
import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyRisk } from './riskEngine.mjs';
import { extractText } from './extract.mjs';
import { runAiReview } from './review.mjs';
import { createEnvelopeForRequest, getSenderViewUrl, getEnvelopeStatus, downloadSignedDocument, getBindingInfo } from './docusign.mjs';
import { getConfig, saveConfig, resetConfig } from './settings.mjs';
import { notifyNewRequest, notifyAssignee, notifyReviewReady, notifyRequesterSubmitted, notifyRequesterStatusUpdate } from './notify.mjs';
import * as store from './store.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));

// Uploads: PDF/DOCX (plus TXT/MD for testing), up to 10 files (main contract + annexes),
// 15 MB each — enforced server-side.
const MAX_FILES = 10;
const ALLOWED_UPLOAD = /\.(pdf|docx|txt|md)$/i;
const upload = multer({
  dest: path.join(dir, 'uploads'),
  limits: { fileSize: 15 * 1024 * 1024, files: MAX_FILES, fields: 30, fieldSize: 64 * 1024 },
  fileFilter: (req, file, cb) =>
    ALLOWED_UPLOAD.test(file.originalname || '')
      ? cb(null, true)
      : cb(Object.assign(new Error('Unsupported file type — upload a PDF or DOCX.'), { status: 400 })),
});

const app = express();
app.set('trust proxy', 1); // behind the ingress/Vite proxy, so req.ip is the client
app.disable('x-powered-by');

// ── Security headers (no dep; same origin serves API + SPA, so the CSP is tight) ──
// The SPA loads only same-origin JS/CSS; React inline style={{}} needs style-src 'unsafe-inline';
// DocuSign opens in a NEW tab (window.open), so it needs no frame/connect allowance here.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'", "base-uri 'self'", "object-src 'none'",
    "frame-ancestors 'none'", "form-action 'self'",
    "img-src 'self' data:", "style-src 'self' 'unsafe-inline'",
    "script-src 'self'", "connect-src 'self'", "font-src 'self'",
  ].join('; '));
  if (IS_PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.use(express.json({ limit: '2mb' }));

// ── Tiny in-memory per-IP rate limiter (no deps; resets on restart — fine for demo). ──
function rateLimit({ windowMs, max }) {
  const hits = new Map(); // ip → [timestamps]
  return (req, res, next) => {
    const now = Date.now();
    const ip = req.ip || req.socket.remoteAddress || '?';
    const recent = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) return res.status(429).json({ message: 'Too many requests — try again later.' });
    recent.push(now);
    hits.set(ip, recent);
    if (hits.size > 10_000) hits.clear(); // crude memory guard
    next();
  };
}

// ── Auth for the Legal side (demo gate). Production = your organisation's SSO. ──
const IS_PROD = process.env.NODE_ENV === 'production';
const LEGAL_PASSWORD = process.env.LEGAL_PASSWORD || (IS_PROD ? '' : 'demo');
if (IS_PROD && !LEGAL_PASSWORD) {
  console.error('FATAL: LEGAL_PASSWORD must be set in production (demo gate until SSO is in front).');
  process.exit(1);
}

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12h sessions
const tokens = new Map(); // token → expiry epoch ms

function safeEqual(a, b) {
  // Hash both sides so timingSafeEqual gets equal-length buffers.
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

app.post('/api/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), (req, res) => {
  if (safeEqual(req.body?.password || '', LEGAL_PASSWORD)) {
    const token = crypto.randomBytes(24).toString('hex');
    tokens.set(token, Date.now() + TOKEN_TTL_MS);
    return res.json({ ok: true, token });
  }
  res.status(401).json({ ok: false, message: 'Wrong password' });
});

app.post('/api/logout', (req, res) => {
  tokens.delete(bearerToken(req));
  res.json({ ok: true });
});

function bearerToken(req) {
  return (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
}

function requireAuth(req, res, next) {
  const t = bearerToken(req);
  const exp = t && tokens.get(t);
  if (exp && exp > Date.now()) return next();
  if (exp) tokens.delete(t); // expired
  if (tokens.size > 1000) for (const [k, v] of tokens) if (v <= Date.now()) tokens.delete(k);
  res.status(401).json({ message: 'Unauthorized' });
}

const INTAKE_FIELDS = [
  'entity', 'team', 'requesterEmail', 'contractType', 'counterpartyName', 'signerName', 'signerEmail',
  'counterpartyLocation', 'relationship', 'context', 'deadline', 'amountPerYear',
  'totalValue', 'term', 'personalData', 'dataSubjects', 'criticalSystems', 'ip',
  'procurement', 'internalApproval',
];

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/assignees', requireAuth, (req, res) => res.json({ assignees: getConfig().assignees }));

// ── Settings (Legal-editable config: thresholds, positions, type profiles, assignees) ──
app.get('/api/settings', requireAuth, (req, res) => res.json(getConfig()));
app.put('/api/settings', requireAuth, (req, res) => {
  try { res.json(saveConfig(req.body || {})); }
  catch (e) { res.status(400).json({ message: 'Invalid settings: ' + e.message }); }
});
app.post('/api/settings/reset', requireAuth, (req, res) => res.json(resetConfig()));

// Quick status toggle. Discarding REQUIRES a reason.
app.post('/api/requests/:id/status', requireAuth, (req, res) => {
  const status = req.body?.status || 'New';
  const discardReason = (req.body?.discardReason || '').trim();
  const existing = store.get(req.params.id);
  if (!existing) return res.status(404).json({ message: 'Not found' });
  if (status === 'Discarded' && !discardReason && !existing.discardReason) {
    return res.status(400).json({ message: 'A reason is required to discard a contract.' });
  }
  const patch = { status };
  if (status === 'Discarded') patch.discardReason = discardReason || existing.discardReason;
  const updated = store.patch(req.params.id, patch);
  notifyRequesterStatusUpdate(updated); // DM the submitter about the status change (needs bot token)
  res.json(publicView(updated));
});

// Assign to a legal counsel.
app.post('/api/requests/:id/assign', requireAuth, (req, res) => {
  const assignedTo = req.body?.assignedTo || '';
  const updated = store.patch(req.params.id, { assignedTo });
  if (!updated) return res.status(404).json({ message: 'Not found' });
  notifyAssignee(updated, assignedTo); // fire-and-forget; no-op unless SLACK_BOT_TOKEN + email
  res.json(publicView(updated));
});

// ── Cap concurrent Bedrock reviews; extras queue FIFO (the intake endpoint is public,
//    and every review is a paid model call — don't let a burst fan out unbounded). ──
const MAX_CONCURRENT_REVIEWS = 2;
const reviewQueue = [];
let activeReviews = 0;
function scheduleReview(job) {
  reviewQueue.push(job);
  pumpReviews();
}
function pumpReviews() {
  while (activeReviews < MAX_CONCURRENT_REVIEWS && reviewQueue.length) {
    const job = reviewQueue.shift();
    activeReviews += 1;
    Promise.resolve().then(job).finally(() => { activeReviews -= 1; pumpReviews(); });
  }
}

// Create a request: intake fields + optional contract file (multipart) → classify → AI review.
// Public (requesters have no account) — rate-limited, size/type-limited, fields length-capped.
app.post('/api/requests', rateLimit({ windowMs: 60 * 60 * 1000, max: 20 }), upload.array('contractFiles', MAX_FILES), async (req, res) => {
  const body = req.body || {};
  if (body.signerEmail && !/^\S+@\S+\.\S+$/.test(String(body.signerEmail).trim())) {
    return res.status(400).json({ message: 'Invalid signer email address.' });
  }
  const request = { id: crypto.randomUUID(), createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(), status: 'New' };
  INTAKE_FIELDS.forEach((k) => { request[k] = String(body[k] || '').slice(0, 5000); });

  // Deterministic tier (always runs, no AI).
  const cls = classifyRisk(request);
  request.tier = cls.tier;
  request.mandatoryReview = cls.mandatoryReview;
  request.triggers = cls.triggers;

  // Extract contract text. Multiple files allowed (main contract + annexes like SLA/DPA):
  // the FIRST file is the main contract; all files are stored and later added to the DocuSign
  // envelope. Text from every file is concatenated (labelled) so the AI reviews the annexes too.
  let contractText = '';
  const uploaded = req.files || [];
  if (uploaded.length) {
    request.documents = uploaded.map((f) => ({ name: f.originalname, path: f.path }));
    // Keep the single-file fields for backward compatibility (Detail view, download, envelope fallback).
    request.contractFileName = uploaded[0].originalname;
    request.contractFilePath = uploaded[0].path;
    const parts = [];
    for (const f of uploaded) {
      const ex = await extractText(f.path, f.originalname);
      if (ex.ok) parts.push(uploaded.length > 1 ? `===== ${f.originalname} =====\n${ex.text}` : ex.text);
    }
    if (parts.length) { contractText = parts.join('\n\n'); request.extractChars = contractText.length; }
    else { request.aiStatus = 'Unreadable — no text could be extracted from the uploaded file(s)'; }
  } else {
    request.aiStatus = 'No contract file uploaded';
  }
  request.contractText = contractText;
  if (contractText) request.aiStatus = 'AI review running…';
  store.put(request);

  // Notify the Legal channel (fire-and-forget; no-op if SLACK_WEBHOOK_URL unset).
  notifyNewRequest(request);
  notifyRequesterSubmitted(request); // DM the submitter a confirmation (needs bot token)

  // Respond to the requester IMMEDIATELY (they don't see or wait for the AI review).
  res.status(201).json({ ok: true, id: request.id, tier: request.tier });

  // Run the AI review in the BACKGROUND; Legal sees it on the dashboard when ready.
  if (contractText) {
    scheduleReview(() =>
      runAiReview({ request, tier: cls.tier, triggers: cls.triggers, profile: cls.profile, contractText })
        .then((out) => {
          const fresh = store.get(request.id) || request;
          if (out.ok) { fresh.review = out.review; fresh.grounding = out.grounding; fresh.aiMeta = out.meta; fresh.aiStatus = 'AI review complete'; }
          else { fresh.aiStatus = out.status; fresh.aiError = out.error || ''; }
          store.put(fresh);
          if (out.ok) notifyReviewReady(fresh); // fire-and-forget; no-op unless Slack configured
        })
        .catch((e) => {
          const fresh = store.get(request.id) || request;
          fresh.aiStatus = 'AI review failed — ' + e.message;
          store.put(fresh);
        }));
  }
});

app.get('/api/requests', requireAuth, (req, res) => res.json({ items: store.list().map(listView) }));

// Dashboard stats — counts by status/tier + average time-to-completion.
app.get('/api/stats', requireAuth, (req, res) => {
  const items = store.list();
  const norm = (s) => (s === 'Closed' ? 'Done' : (s || 'New'));
  const byStatus = {}, byTier = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  let aiComplete = 0, completedCount = 0, completedMs = 0;
  for (const r of items) {
    const s = norm(r.status);
    byStatus[s] = (byStatus[s] || 0) + 1;
    if (byTier[r.tier] !== undefined) byTier[r.tier] += 1;
    if (r.aiStatus === 'AI review complete') aiComplete += 1;
    if (s === 'Done' && r.createdAt) {
      const end = new Date(r.decidedAt || r.updatedAt || r.createdAt).getTime();
      const ms = end - new Date(r.createdAt).getTime();
      if (ms >= 0) { completedCount += 1; completedMs += ms; }
    }
  }
  const avgHours = completedCount ? completedMs / completedCount / 3600000 : null;
  res.json({
    total: items.length,
    open: (byStatus['New'] || 0) + (byStatus['In progress'] || 0) + (byStatus['More information requested'] || 0),
    byStatus, byTier, aiComplete,
    avgCompletion: avgHours == null ? null : (avgHours < 48 ? `${Math.round(avgHours)}h` : `${(avgHours / 24).toFixed(1)}d`),
  });
});

app.delete('/api/requests/:id', requireAuth, (req, res) => {
  const ok = store.remove(req.params.id);
  if (!ok) return res.status(404).json({ message: 'Not found' });
  res.json({ ok: true });
});

app.get('/api/requests/:id', requireAuth, (req, res) => {
  const r = store.get(req.params.id);
  if (!r) return res.status(404).json({ message: 'Not found' });
  res.json(publicView(r));
});

// Download the primary uploaded contract document (backward-compatible).
app.get('/api/requests/:id/file', requireAuth, (req, res) => {
  const r = store.get(req.params.id);
  if (!r || !r.contractFilePath) return res.status(404).json({ message: 'No file' });
  res.download(r.contractFilePath, r.contractFileName || 'contract');
});

// Download a specific uploaded document by index (main contract + annexes).
app.get('/api/requests/:id/file/:index', requireAuth, (req, res) => {
  const r = store.get(req.params.id);
  const doc = r?.documents?.[Number(req.params.index)];
  if (!doc) return res.status(404).json({ message: 'No file' });
  res.download(doc.path, doc.name || 'document');
});

// Re-run the AI review for a row (idempotent-ish: always re-runs on demand).
app.post('/api/requests/:id/review', requireAuth, async (req, res) => {
  const r = store.get(req.params.id);
  if (!r) return res.status(404).json({ message: 'Not found' });
  if (!r.contractText) return res.status(400).json({ message: 'No contract text to review' });
  const cls = classifyRisk(r);
  const out = await runAiReview({ request: r, tier: r.tier || cls.tier, triggers: r.triggers || cls.triggers, profile: cls.profile, contractText: r.contractText });
  if (out.ok) { r.review = out.review; r.grounding = out.grounding; r.aiMeta = out.meta; r.aiStatus = 'AI review complete'; }
  else { r.aiStatus = out.status; r.aiError = out.error || ''; }
  store.put(r);
  res.json(publicView(r));
});

// Human decision + sign-off (AI advises; human decides).
app.post('/api/requests/:id/decision', requireAuth, (req, res) => {
  const { status, decision, decisionNotes, reviewer } = req.body || {};
  const updated = store.patch(req.params.id, {
    status: status || 'In progress', decision: decision || '',
    decisionNotes: decisionNotes || '', reviewer: reviewer || '',
    decidedAt: new Date().toISOString(),
  });
  if (!updated) return res.status(404).json({ message: 'Not found' });
  res.json(publicView(updated));
});

// ── DocuSign lifecycle (draft-only: a lawyer reviews & sends the envelope from DocuSign) ──
const SITE_URL = (process.env.SITE_URL || 'http://localhost:5173').replace(/\/+$/, '');

// Which DocuSign account/user envelopes route to (resolved live from userinfo), so the
// dashboard can show which account envelopes would be created in.
app.get('/api/docusign/config', requireAuth, async (req, res) => {
  try {
    const b = await getBindingInfo();
    res.json({ ok: true, ...b });
  } catch (e) {
    res.json({ ok: false, configured: e.code !== 'NOT_CONFIGURED', message: e.message });
  }
});

// Create a DRAFT envelope.
app.post('/api/requests/:id/docusign', requireAuth, async (req, res) => {
  const r = store.get(req.params.id);
  if (!r) return res.status(404).json({ message: 'Not found' });
  try {
    const result = await createEnvelopeForRequest(r);
    store.patch(r.id, { docusign: result, status: 'In progress' });
    res.json({ ok: true, ...result });
  } catch (e) {
    const configured = e.code !== 'NOT_CONFIGURED';
    res.json({ ok: false, configured, message: e.message });
  }
});

// Short-lived URL into DocuSign's sender view (place tabs, review, send). Fetched on
// demand because the URL expires after ~5 minutes.
app.post('/api/requests/:id/docusign/sender-view', requireAuth, async (req, res) => {
  const r = store.get(req.params.id);
  if (!r) return res.status(404).json({ message: 'Not found' });
  if (!r.docusign?.envelopeId) return res.status(400).json({ ok: false, message: 'No DocuSign envelope for this request yet.' });
  try {
    const url = await getSenderViewUrl(r.docusign.envelopeId, `${SITE_URL}/legal/requests/${r.id}`);
    res.json({ ok: true, url });
  } catch (e) {
    res.json({ ok: false, message: e.message });
  }
});

// Refresh the envelope status from DocuSign (poll-on-demand; webhooks are a v2 nicety).
app.post('/api/requests/:id/docusign/refresh', requireAuth, async (req, res) => {
  const r = store.get(req.params.id);
  if (!r) return res.status(404).json({ message: 'Not found' });
  if (!r.docusign?.envelopeId) return res.status(400).json({ ok: false, message: 'No DocuSign envelope for this request yet.' });
  try {
    const status = await getEnvelopeStatus(r.docusign.envelopeId);
    const updated = store.patch(r.id, { docusign: { ...r.docusign, ...status } });
    res.json({ ok: true, request: publicView(updated) });
  } catch (e) {
    res.json({ ok: false, message: e.message });
  }
});

// Download the signed PDF (combined documents + certificate) once completed.
app.get('/api/requests/:id/docusign/document', requireAuth, async (req, res) => {
  const r = store.get(req.params.id);
  if (!r) return res.status(404).json({ message: 'Not found' });
  if (!r.docusign?.envelopeId) return res.status(400).json({ message: 'No DocuSign envelope for this request yet.' });
  try {
    const pdf = await downloadSignedDocument(r.docusign.envelopeId);
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `attachment; filename="signed-${(r.counterpartyName || 'contract').replace(/[^\w.-]+/g, '_')}.pdf"`);
    res.send(pdf);
  } catch (e) {
    res.status(502).json({ message: e.message });
  }
});

function listView(r) {
  return { id: r.id, createdAt: r.createdAt, status: r.status, tier: r.tier,
    mandatoryReview: r.mandatoryReview, contractType: r.contractType,
    counterpartyName: r.counterpartyName, team: r.team, deadline: r.deadline,
    aiStatus: r.aiStatus, decision: r.decision || '', reviewer: r.reviewer || '',
    assignedTo: r.assignedTo || '', docusignStatus: r.docusign?.status || '' };
}
function publicView(r) {
  const { contractText, contractFilePath, documents, ...rest } = r; // don't ship the full text / local paths
  return { ...rest, documents: (documents || []).map((d, i) => ({ name: d.name, index: i })) };
}

// In a container/production build, serve the built frontend from ./public and let the
// SPA handle client-side routes. (Dev uses the Vite server with a /api proxy instead.)
import fs from 'node:fs';
const pub = path.join(dir, 'public');
if (fs.existsSync(pub)) {
  app.use(express.static(pub));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(pub, 'index.html'));
  });
}

// Error handler (multer rejections, bad uploads) — JSON, never a stack trace.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err instanceof multer.MulterError) return res.status(400).json({ message: 'Upload rejected: ' + err.message });
  if (err?.status === 400) return res.status(400).json({ message: err.message });
  console.error(err);
  res.status(500).json({ message: 'Internal error' });
});

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => console.log(`Clause — contract review on http://localhost:${PORT}`));
