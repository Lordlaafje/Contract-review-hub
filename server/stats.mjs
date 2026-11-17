/**
 * stats.mjs — numbers for the dashboard overview.
 *
 * Two kinds of figures, kept apart on purpose:
 *  - LIVE: computed from the requests in the store — what's open, and where each open
 *    request stands against its SLA.
 *  - DEMO HISTORY: the store only holds six sample requests, too few for a meaningful
 *    "last 30 days". So the history (reviews per week, turnaround, % within SLA) is a fixed
 *    illustrative series plus whatever has really been completed. The response flags it
 *    (history.demo = true) and the dashboard labels it. Set DEMO_STATS=off to show only
 *    real completions.
 */

// SLA: calendar days from submission to a decision, by risk tier.
export const SLA_DAYS = { LOW: 2, MEDIUM: 5, HIGH: 10 };
const AT_RISK_SHARE = 0.25; // "at risk" = less than a quarter of the SLA time left

const DAY = 86_400_000;
const OPEN = new Set(['New', 'In progress', 'More information requested']);
const DONE = new Set(['Done', 'Closed']);

// Illustrative completed reviews per week, oldest first (8 weeks).
const DEMO_WEEKLY = [9, 12, 8, 14, 11, 15, 13, 10];
const DEMO_WITHIN_SLA = 0.91;
const DEMO_TURNAROUND_DAYS = 3.4;

const slaDays = (r) => SLA_DAYS[r.tier] ?? SLA_DAYS.MEDIUM;

/** Where one open request stands: on track / at risk / overdue, with days left. */
export function slaState(r, now = Date.now()) {
  const created = Date.parse(r.createdAt);
  if (Number.isNaN(created)) return null;
  const total = slaDays(r) * DAY;
  const left = created + total - now;
  const state = left < 0 ? 'overdue' : left < total * AT_RISK_SHARE ? 'at_risk' : 'on_track';
  return { state, dueAt: new Date(created + total).toISOString(), daysLeft: Math.round((left / DAY) * 10) / 10 };
}

function weekStart(t) {
  const d = new Date(t);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // Monday
  return d.getTime();
}

export function computeStats(items, { now = Date.now(), demo = true, health = {} } = {}) {
  const status = (r) => (r.status === 'Closed' ? 'Done' : r.status || 'New');

  // ── Live pipeline + SLA ──
  const open = items.filter((r) => OPEN.has(status(r)));
  const sla = { on_track: 0, at_risk: 0, overdue: 0 };
  for (const r of open) {
    const s = slaState(r, now);
    if (s) sla[s.state] += 1;
  }

  // ── Real completions: decided requests, with turnaround and SLA outcome ──
  const done = items
    .filter((r) => DONE.has(status(r)) && r.createdAt)
    .map((r) => {
      const end = Date.parse(r.decidedAt || r.updatedAt || r.createdAt);
      const days = Math.max(0, (end - Date.parse(r.createdAt)) / DAY);
      return { end, days, withinSla: days <= slaDays(r) };
    });

  // ── Weekly series: last 8 weeks, demo baseline + real completions ──
  const thisWeek = weekStart(now);
  const weeks = DEMO_WEEKLY.map((base, i) => {
    const start = thisWeek - (DEMO_WEEKLY.length - 1 - i) * 7 * DAY;
    const real = done.filter((d) => d.end >= start && d.end < start + 7 * DAY).length;
    return { weekStart: new Date(start).toISOString().slice(0, 10), count: (demo ? base : 0) + real, real };
  });

  const last30 = done.filter((d) => d.end >= now - 30 * DAY);
  const demoCount30 = demo ? DEMO_WEEKLY.slice(-4).reduce((a, b) => a + b, 0) + 2 : 0; // ~30 days ≈ 4 weeks + 2 days
  const reviewed30 = demoCount30 + last30.length;
  const blend = (demoValue, realValues) => {
    const total = demoCount30 + realValues.length;
    if (!total) return null;
    return (demoValue * demoCount30 + realValues.reduce((a, b) => a + b, 0)) / total;
  };
  const withinPct = blend(DEMO_WITHIN_SLA, last30.map((d) => (d.withinSla ? 1 : 0)));
  const turnaround = blend(DEMO_TURNAROUND_DAYS, last30.map((d) => d.days));

  return {
    generatedAt: new Date(now).toISOString(),
    slaDays: SLA_DAYS,
    pipeline: {
      new: open.filter((r) => status(r) === 'New').length,
      inProgress: open.filter((r) => status(r) === 'In progress').length,
      moreInfo: open.filter((r) => status(r) === 'More information requested').length,
      open: open.length,
    },
    sla: { ...sla, withinSla: sla.on_track + sla.at_risk },
    history: {
      demo,
      reviewed30d: reviewed30,
      withinSlaPct: withinPct == null ? null : Math.round(withinPct * 100),
      avgTurnaroundDays: turnaround == null ? null : Math.round(turnaround * 10) / 10,
      weeks,
    },
    health: {
      ...health,
      reviewsComplete: items.filter((r) => r.aiStatus === 'AI review complete').length,
      reviewsRunning: items.filter((r) => /running/i.test(r.aiStatus || '')).length,
      reviewsFailed: items.filter((r) => /failed|interrupted|not valid|refused/i.test(r.aiStatus || '')).length,
      lastReviewAt: items
        .filter((r) => r.aiStatus === 'AI review complete')
        .map((r) => r.reviewedAt || r.updatedAt || r.createdAt)
        .sort()
        .pop() || null,
    },
  };
}
