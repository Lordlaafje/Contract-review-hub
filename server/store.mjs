/**
 * store.mjs — tiny JSON-file datastore for the local demo.
 * A later version swaps this for a managed database (e.g. DynamoDB/RDS).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const DB = path.join(dir, 'data', 'requests.json');

function readAll() {
  try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { return []; }
}
function writeAll(items) {
  fs.mkdirSync(path.dirname(DB), { recursive: true });
  fs.writeFileSync(DB, JSON.stringify(items, null, 2));
}

export function list() {
  return readAll().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}
export function get(id) {
  return readAll().find((r) => r.id === id) || null;
}
export function put(item) {
  const items = readAll();
  const i = items.findIndex((r) => r.id === item.id);
  if (i >= 0) items[i] = item; else items.push(item);
  writeAll(items);
  return item;
}
export function patch(id, updates) {
  const item = get(id);
  if (!item) return null;
  const merged = { ...item, ...updates, updatedAt: new Date().toISOString() };
  return put(merged);
}
