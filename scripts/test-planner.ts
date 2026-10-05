import assert from "node:assert/strict";
import { generatePlan, estimateHours } from "../lib/planner";
import { buildIcs } from "../lib/ics";
import { SAMPLE_ITEMS } from "../lib/sample";
import { addDays, weekStart } from "../lib/dates";

const START = "2026-10-05"; // a Monday
const plan = generatePlan(SAMPLE_ITEMS, { startDate: START });

// 1. Every active item gets (almost) all of its hours scheduled, never after the due date.
for (const item of SAMPLE_ITEMS) {
  const blocks = plan.blocks.filter((b) => b.itemId === item.id);
  const hours = blocks.reduce((s, b) => s + b.hours, 0);
  const want = estimateHours(item);
  const unscheduledWarn = plan.warnings.some((w) => w.includes(`"${item.title}"`));
  if (!unscheduledWarn) assert.equal(hours, want, `${item.title}: ${hours}h vs ${want}h`);
  for (const b of blocks) {
    assert.ok(b.date <= item.dueDate, `${item.title} scheduled after due date`);
    assert.ok(b.date >= START, `${item.title} scheduled before start`);
  }
}

// 2. Daily capacity is never exceeded.
const perDay = new Map<string, number>();
for (const b of plan.blocks) perDay.set(b.date, (perDay.get(b.date) ?? 0) + b.hours);
for (const [d, h] of perDay) {
  const dow = new Date(d + "T00:00:00Z").getUTCDay();
  const cap = dow === 0 || dow === 6 ? 4 : 3;
  assert.ok(h <= cap + 1e-9, `${d} has ${h}h, cap ${cap}`);
}

// 3. The week of the two midterms (23 Oct) is flagged as a crunch.
const midtermWeek = plan.weeks.find((w) => w.weekStart === weekStart("2026-10-23"));
assert.ok(midtermWeek, "midterm week exists");
assert.equal(midtermWeek!.load, "crunch");

// 4. Re-plan: marking items done removes their blocks and a later start skips the past.
const done = SAMPLE_ITEMS.map((i) => (i.dueDate < "2026-10-20" ? { ...i, done: true } : i));
const replan = generatePlan(done, { startDate: "2026-10-20" });
assert.ok(replan.blocks.every((b) => b.date >= "2026-10-20"));
assert.ok(!replan.blocks.some((b) => done.find((i) => i.id === b.itemId)?.done));

// 5. Overdue, not-done items are surfaced and scheduled today.
const overdue = generatePlan(SAMPLE_ITEMS, { startDate: "2026-10-14" });
assert.ok(overdue.warnings.some((w) => w.includes("Problem Set 3")));

// 6. Impossible workload produces a warning rather than silently dropping hours.
const squeezed = generatePlan(SAMPLE_ITEMS, {
  startDate: "2026-12-01",
  weekdayHours: 1,
  weekendHours: 1,
});
assert.ok(squeezed.warnings.some((w) => w.startsWith("Not enough free time")));

// 7. ICS output is well-formed.
const ics = buildIcs(SAMPLE_ITEMS, plan);
assert.ok(ics.startsWith("BEGIN:VCALENDAR"));
assert.ok(ics.trimEnd().endsWith("END:VCALENDAR"));
assert.equal(
  (ics.match(/BEGIN:VEVENT/g) ?? []).length,
  (ics.match(/END:VEVENT/g) ?? []).length,
);
assert.ok(ics.split("\r\n").every((l) => l.length <= 75), "lines folded");

console.log(
  `OK - ${plan.blocks.length} blocks, ${plan.totalHours}h total, ${plan.warnings.length} warnings`,
);
console.log(
  plan.weeks
    .map((w) => `${w.weekStart} ${w.load.padEnd(6)} ${w.scheduledHours}h  due:${w.dueItems.length}`)
    .join("\n"),
);
void addDays;
