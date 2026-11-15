/**
 * Google Drive upload tests — fetch is stubbed, nothing leaves the machine.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isConfigured, saveToDrive, _reset } from '../drive.mjs';

const realFetch = globalThis.fetch;
const env = { ...process.env };
let tmp, calls, routes;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'clause-drive-'));
  Object.assign(process.env, {
    GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'secret', GOOGLE_REFRESH_TOKEN: 'refresh',
    DRIVE_STATE_FILE: path.join(tmp, 'drive.json'),
  });
  _reset();
  calls = [];
  routes = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const route = routes.find((r) => r.match(String(url), init));
    if (!route) throw new Error('unexpected fetch ' + url);
    return new Response(JSON.stringify(route.json), { status: route.status || 200 });
  };
});
afterEach(async () => {
  globalThis.fetch = realFetch;
  process.env = { ...env };
  await fs.rm(tmp, { recursive: true, force: true });
});

const tokenRoute = { match: (u) => u.includes('oauth2.googleapis.com/token'), json: { access_token: 'at', expires_in: 3600 } };
const searchRoute = (files) => ({ match: (u, i) => u.includes('/drive/v3/files?q=') && !i.method, json: { files } });
const createFolderRoute = { match: (u, i) => u.endsWith('/drive/v3/files?fields=id') && i.method === 'POST', json: { id: 'folder-new' } };
const uploadRoute = { match: (u) => u.includes('/upload/drive/v3/files'), json: { id: 'file-1', webViewLink: 'https://drive.google.com/file/d/file-1/view' } };

async function contract() {
  const p = path.join(tmp, 'upload-abc');
  await fs.writeFile(p, 'contract body');
  return p;
}

test('inert unless client id, secret and refresh token are all set', () => {
  assert.equal(isConfigured(), true);
  delete process.env.GOOGLE_REFRESH_TOKEN;
  assert.equal(isConfigured(), false);
});

test('creates the app folder once, uploads into it, and remembers the folder', async () => {
  routes.push(tokenRoute, searchRoute([]), createFolderRoute, uploadRoute);
  const out = await saveToDrive(await contract(), 'Acme NDA.pdf', { description: 'intake 1' });
  assert.deepEqual(out, { id: 'file-1', webViewLink: 'https://drive.google.com/file/d/file-1/view' });

  const up = calls.find((c) => c.url.includes('/upload/'));
  assert.equal(up.init.headers.Authorization, 'Bearer at');
  const body = up.init.body.toString();
  assert.ok(body.includes('"parents":["folder-new"]'));
  assert.ok(body.includes('"name":"Acme NDA.pdf"'));
  assert.ok(body.includes('Content-Type: application/pdf'));
  assert.ok(body.includes('contract body'));

  const state = JSON.parse(await fs.readFile(process.env.DRIVE_STATE_FILE, 'utf8'));
  assert.equal(state.folderId, 'folder-new');
});

test('reuses an existing folder with the same name instead of creating another', async () => {
  routes.push(tokenRoute, searchRoute([{ id: 'folder-old' }]), uploadRoute);
  await saveToDrive(await contract(), 'a.docx');
  assert.ok(!calls.some((c) => c.url.endsWith('files?fields=id')));
  assert.ok(calls.find((c) => c.url.includes('/upload/')).init.body.toString().includes('"parents":["folder-old"]'));
});

test('a revoked sign-in surfaces Google\'s reason', async () => {
  routes.push({ ...tokenRoute, status: 400, json: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } });
  await assert.rejects(saveToDrive(await contract(), 'a.pdf'), /Google sign-in failed \(400\): Token has been expired or revoked/);
});
