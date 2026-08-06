/**
 * settings.mjs — live, Legal-editable configuration.
 *
 * The code defaults live in config.mjs. Overrides saved via the Settings page are
 * persisted to data/config.json and merged over the defaults. The risk engine, the AI
 * prompt, and the assignee list all read getConfig() at call time, so a change in the
 * Settings page takes effect immediately — no code change, no redeploy.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PARAMS, TYPE_PROFILES, PLAYBOOK_GENERAL, POSITION_BANDS, ASSIGNEES } from './config.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(dir, 'data', 'config.json');

// The five editable sections.
const SECTIONS = ['params', 'typeProfiles', 'playbookGeneral', 'positionBands', 'assignees'];

function defaults() {
  return {
    params: structuredClone(PARAMS),
    typeProfiles: structuredClone(TYPE_PROFILES),
    playbookGeneral: [...PLAYBOOK_GENERAL],
    positionBands: POSITION_BANDS,
    assignees: structuredClone(ASSIGNEES),
  };
}

let cache = null;
function readOverrides() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}

/** Effective config: defaults with any saved overrides applied (cached). */
export function getConfig() {
  if (cache) return cache;
  const d = defaults();
  const o = readOverrides();
  cache = {
    params: { ...d.params, ...(o.params || {}) },
    typeProfiles: o.typeProfiles || d.typeProfiles,
    playbookGeneral: Array.isArray(o.playbookGeneral) ? o.playbookGeneral : d.playbookGeneral,
    positionBands: typeof o.positionBands === 'string' ? o.positionBands : d.positionBands,
    assignees: Array.isArray(o.assignees) ? o.assignees : d.assignees,
    _hasOverrides: Object.keys(o).length > 0,
  };
  return cache;
}

/** Save one or more sections (whole-section replace); returns the new effective config. */
export function saveConfig(partial) {
  const o = readOverrides();
  const next = { ...o };
  for (const k of SECTIONS) if (partial[k] !== undefined) next[k] = partial[k];
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
  cache = null;
  return getConfig();
}

/** Discard all overrides → back to the code defaults. */
export function resetConfig() {
  try { fs.unlinkSync(FILE); } catch { /* nothing to reset */ }
  cache = null;
  return getConfig();
}
