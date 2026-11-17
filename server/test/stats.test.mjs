/**
 * Dashboard overview figures: live pipeline + SLA, and the demo/real history blend.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, slaState, SLA_DAYS } from '../stats.mjs';

const DAY = 86_400_000;
const now = Date.parse('2026-11-18T12:00:00Z'); // a Wednesday
const ago = (d) => new Date(now - d * DAY).toISOString();

test('SLA state: on track, at risk in the last quarter, overdue after the deadline', () => {
  assert.equal(slaState({ tier: 'HIGH', createdAt: ago(1) }, now).state, 'on_track');   // 9 of 10 days left
  assert.equal(slaState({ tier: 'HIGH', createdAt: ago(8) }, now).state, 'at_risk');    // 2 of 10 left
  assert.equal(slaState({ tier: 'LOW', createdAt: ago(3) }, now).state, 'overdue');     // 2-day SLA
  assert.equal(slaState({ tier: 'LOW', createdAt: ago(3) }, now).daysLeft, -1);
  assert.equal(slaState({ createdAt: ago(1) }, now).dueAt, new Date(now - DAY + SLA_DAYS.MEDIUM * DAY).toISOString());
  assert.equal(slaState({ tier: 'LOW' }, now), null);
});

const items = [
  { status: 'New', tier: 'HIGH', createdAt: ago(1), aiStatus: 'AI review complete', reviewedAt: ago(1) },
  { status: 'In progress', tier: 'HIGH', createdAt: ago(9), aiStatus: 'AI review complete', reviewedAt: ago(0.5) },
  { status: 'More information requested', tier: 'LOW', createdAt: ago(4), aiStatus: 'AI review failed — x' },
  { status: 'Done', tier: 'LOW', createdAt: ago(3), decidedAt: ago(2) },     // 1 day: within LOW SLA
  { status: 'Closed', tier: 'LOW', createdAt: ago(10), decidedAt: ago(5) },  // 5 days: outside LOW SLA
  { status: 'Discarded', tier: 'MEDIUM', createdAt: ago(2), aiStatus: 'AI review running…' },
];

test('live pipeline and SLA count only open requests', () => {
  const s = computeStats(items, { now, demo: false });
  assert.deepEqual(s.pipeline, { new: 1, inProgress: 1, moreInfo: 1, open: 3 });
  assert.deepEqual(s.sla, { on_track: 1, at_risk: 1, overdue: 1, withinSla: 2 });
});

test('without demo figures, history is real completions only', () => {
  const s = computeStats(items, { now, demo: false });
  assert.equal(s.history.demo, false);
  assert.equal(s.history.reviewed30d, 2);
  assert.equal(s.history.withinSlaPct, 50);
  assert.equal(s.history.avgTurnaroundDays, 3);
  assert.equal(s.history.weeks.length, 8);
  assert.equal(s.history.weeks.reduce((a, w) => a + w.count, 0), 2);
  assert.equal(s.history.weeks.at(-1).weekStart, '2026-11-16'); // Monday of this week
});

test('demo figures add a fixed baseline on top of real completions', () => {
  const real = computeStats(items, { now, demo: false }).history;
  const demo = computeStats(items, { now, demo: true }).history;
  assert.equal(demo.demo, true);
  assert.ok(demo.reviewed30d > real.reviewed30d);
  demo.weeks.forEach((w, i) => {
    assert.equal(w.real, real.weeks[i].real);             // real completions are unchanged
    assert.ok(w.count - real.weeks[i].count > 0);          // each week gets a positive baseline
  });
});

test('empty store: no division by zero', () => {
  const s = computeStats([], { now, demo: false });
  assert.equal(s.history.withinSlaPct, null);
  assert.equal(s.history.avgTurnaroundDays, null);
  assert.equal(s.health.lastReviewAt, null);
});

test('health counts reviews by state and finds the latest', () => {
  const s = computeStats(items, { now, demo: false, health: { ai: { provider: 'OpenAI' } } });
  assert.equal(s.health.ai.provider, 'OpenAI');
  assert.equal(s.health.reviewsComplete, 2);
  assert.equal(s.health.reviewsRunning, 1);
  assert.equal(s.health.reviewsFailed, 1);
  assert.equal(s.health.lastReviewAt, ago(0.5));
});
