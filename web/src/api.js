// API client. Public: createRequest, login. Everything else needs the Legal token.
import { authHeader, setToken, logout } from './auth.js';
const base = '/api';

async function authed(path, opts = {}) {
  const r = await fetch(`${base}${path}`, {
    ...opts,
    headers: { ...(opts.headers || {}), ...authHeader() },
  });
  if (r.status === 401) { logout(); window.location.href = '/legal/login'; throw new Error('unauthorized'); }
  return r;
}

// ── Public ──
export async function createRequest(formData) {
  const r = await fetch(`${base}/requests`, { method: 'POST', body: formData });
  return r.json();
}
export async function login(password) {
  const r = await fetch(`${base}/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = await r.json();
  if (data.ok && data.token) { setToken(data.token); return { ok: true }; }
  return { ok: false, message: data.message || 'Login failed' };
}

// ── Legal (authed) ──
export async function listRequests() { return (await (await authed('/requests')).json()).items || []; }
export async function getRequest(id) {
  const r = await authed(`/requests/${id}`);
  if (!r.ok) throw new Error('not found');
  return r.json();
}
export async function getAssignees() { return (await (await authed('/assignees')).json()).assignees || []; }
export async function rerunReview(id) { return (await authed(`/requests/${id}/review`, { method: 'POST' })).json(); }
export async function saveDecision(id, payload) {
  return (await authed(`/requests/${id}/decision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })).json();
}
export async function setStatus(id, status, discardReason) {
  return (await authed(`/requests/${id}/status`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status, discardReason }) })).json();
}
export async function assign(id, assignedTo) {
  return (await authed(`/requests/${id}/assign`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assignedTo }) })).json();
}
export async function deleteRequest(id) {
  return (await authed(`/requests/${id}`, { method: 'DELETE' })).json();
}
export async function getStats() { return (await authed('/stats')).json(); }
export async function getSettings() { return (await authed('/settings')).json(); }
export async function saveSettings(cfg) {
  return (await authed('/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cfg) })).json();
}
export async function resetSettings() { return (await authed('/settings/reset', { method: 'POST' })).json(); }
export async function sendDocusign(id) { return (await authed(`/requests/${id}/docusign`, { method: 'POST' })).json(); }
export async function docusignConfig() { return (await authed('/docusign/config')).json(); }
export async function docusignSenderView(id) { return (await authed(`/requests/${id}/docusign/sender-view`, { method: 'POST' })).json(); }
export async function docusignRefresh(id) { return (await authed(`/requests/${id}/docusign/refresh`, { method: 'POST' })).json(); }
export async function downloadSignedDoc(id, filename) {
  const r = await authed(`/requests/${id}/docusign/document`);
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.message || 'Download failed'); }
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename || 'signed-contract.pdf';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
export async function downloadFile(id, filename, index) {
  const r = await authed(`/requests/${id}/file${index != null ? '/' + index : ''}`);
  if (!r.ok) return;
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename || 'contract';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
