/**
 * drive.mjs — copy each uploaded contract into a Google Drive folder.
 *
 * Inert unless all three are set (then every intake upload is also saved to Drive):
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET   an OAuth client of type "Desktop app"
 *   GOOGLE_REFRESH_TOKEN                     from `npm --prefix server run drive-auth`
 * Where the files go — pick one:
 *   GOOGLE_DRIVE_FOLDER_ID     an existing folder of yours (the id from its Drive URL).
 *                              Needs the full `drive` scope: Google's narrow scope can't see
 *                              folders you made by hand. Sign in again with drive-auth after
 *                              setting it, so the token carries that scope.
 *   GOOGLE_DRIVE_FOLDER_NAME   otherwise, a folder the app creates and reuses
 *                              (default "Clause — contract uploads"). Uses the narrow
 *                              `drive.file` scope: the app sees only what it created itself.
 * Plain fetch, no googleapis dependency. The local copy on disk stays the source of truth;
 * a Drive failure is recorded on the request and never blocks the intake.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCOPE_APP_FILES = 'https://www.googleapis.com/auth/drive.file';
const SCOPE_FULL = 'https://www.googleapis.com/auth/drive';
export const scope = () => (process.env.GOOGLE_DRIVE_FOLDER_ID ? SCOPE_FULL : SCOPE_APP_FILES);
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

const dir = path.dirname(fileURLToPath(import.meta.url));
// Caches the folder id. Overridable so tests don't touch the real data folder.
const stateFile = () => process.env.DRIVE_STATE_FILE || path.join(dir, 'data', 'drive.json');

const MIME = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
};

export const isConfigured = () =>
  !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);

const folderName = () => process.env.GOOGLE_DRIVE_FOLDER_NAME || 'Clause — contract uploads';

// ── Access token (refreshed from the long-lived refresh token, cached until near expiry) ──
let token = null;
let tokenUntil = 0;

async function accessToken() {
  if (token && Date.now() < tokenUntil) return token;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google sign-in failed (${res.status}): ${out.error_description || out.error || 'unknown error'}`);
  token = out.access_token;
  tokenUntil = Date.now() + (out.expires_in - 120) * 1000;
  return token;
}

async function api(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, ...(init.headers || {}) },
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Drive ${res.status}: ${out.error?.message || 'request failed'}`);
  return out;
}

// ── Folder: reuse the cached id if it still exists and isn't trashed, else find or create it ──
let folderPromise = null;

async function readState() {
  try { return JSON.parse(await fs.readFile(stateFile(), 'utf8')); } catch { return {}; }
}

async function resolveFolder() {
  const fixed = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (fixed) {
    // Fail with a clear message if the token can't reach the folder (wrong id, or a token
    // from before the folder was set, which only carries the narrow scope).
    const f = await api(`${API}/files/${encodeURIComponent(fixed)}?fields=id,mimeType,trashed&supportsAllDrives=true`)
      .catch((e) => { throw new Error(`can't open folder ${fixed} (${e.message}) — check GOOGLE_DRIVE_FOLDER_ID, then sign in again with drive-auth`); });
    if (f.mimeType !== FOLDER_MIME || f.trashed) throw new Error(`${fixed} is not an active Drive folder`);
    return fixed;
  }
  const name = folderName();
  const state = await readState();
  if (state.folderId && state.folderName === name) {
    try {
      const f = await api(`${API}/files/${state.folderId}?fields=id,trashed`);
      if (!f.trashed) return state.folderId;
    } catch { /* deleted or no longer accessible — fall through */ }
  }
  const q = `mimeType='${FOLDER_MIME}' and name='${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' and trashed=false`;
  const found = await api(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`);
  const id = found.files?.[0]?.id || (await api(`${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME }),
  })).id;
  await fs.mkdir(path.dirname(stateFile()), { recursive: true });
  await fs.writeFile(stateFile(), JSON.stringify({ folderId: id, folderName: name }, null, 2));
  return id;
}

function getFolder() {
  // One lookup at a time, so two uploads arriving together don't create two folders.
  folderPromise = folderPromise || resolveFolder().catch((e) => { folderPromise = null; throw e; });
  return folderPromise;
}

/**
 * Upload one local file into the Drive folder.
 * Returns { id, webViewLink } — or throws with a readable message.
 */
export async function saveToDrive(localPath, originalName, { description = '' } = {}) {
  const folderId = await getFolder();
  const data = await fs.readFile(localPath);
  const mimeType = MIME[path.extname(originalName || '').toLowerCase()] || 'application/octet-stream';
  const meta = { name: originalName || path.basename(localPath), parents: [folderId], description };

  const boundary = 'clause' + Math.random().toString(36).slice(2);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const out = await api(`${UPLOAD_API}/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  return { id: out.id, webViewLink: out.webViewLink };
}

// For tests.
export function _reset() { token = null; tokenUntil = 0; folderPromise = null; }
