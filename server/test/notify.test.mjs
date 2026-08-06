/**
 * Slack message-builder + assignee-resolution tests (pure — no network).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNewRequestMessage, buildReviewReadyMessage, buildAssignmentMessage, resolveAssigneeEmail } from '../notify.mjs';
import { ASSIGNEES } from '../config.mjs';

const r = {
  id: 'abc-123', counterpartyName: 'Acme B.V.', contractType: 'SaaS / software',
  tier: 'HIGH', mandatoryReview: true, team: 'Marketing Brand', deadline: '2026-08-01',
  context: 'New analytics platform', assignedTo: ASSIGNEES[0].name,
  review: { recommendation: 'Escalate', red_flags: [{}, {}], red_flags_beyond_scope: [{}] },
};
const link = 'https://app.example/legal/requests/abc-123';
const flat = (m) => JSON.stringify(m);

test('new-request message: counterparty, type, tier, mandatory, deadline, link', () => {
  const m = buildNewRequestMessage(r, link);
  for (const bit of ['Acme B.V.', 'SaaS / software', 'HIGH', 'mandatory review', '2026-08-01', link]) {
    assert.ok(flat(m).includes(bit), `missing "${bit}"`);
  }
});

test('review-ready message: recommendation + total red-flag count + link', () => {
  const m = buildReviewReadyMessage(r, link);
  assert.ok(flat(m).includes('Escalate'));
  assert.ok(flat(m).includes('*Red flags:* 3'), 'counts red_flags + beyond_scope');
  assert.ok(flat(m).includes(link));
});

test('assignment DM: counterparty, tier, link', () => {
  const m = buildAssignmentMessage(r, link);
  for (const bit of ['Acme B.V.', 'HIGH', link]) assert.ok(flat(m).includes(bit), `missing "${bit}"`);
});

test('assignee resolution: configured name → email (case-insensitive)', () => {
  assert.equal(resolveAssigneeEmail(ASSIGNEES[0].name), ASSIGNEES[0].email);
  assert.equal(resolveAssigneeEmail(ASSIGNEES[0].name.toUpperCase()), ASSIGNEES[0].email);
});

test('assignee resolution: free-entered email passes through; unknown name → empty', () => {
  assert.equal(resolveAssigneeEmail('someone@northsidelegal.example'), 'someone@northsidelegal.example');
  assert.equal(resolveAssigneeEmail('Unknown Person'), '');
  assert.equal(resolveAssigneeEmail(''), '');
});
