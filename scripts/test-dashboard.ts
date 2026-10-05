import assert from "node:assert/strict";
import { buildDashboard, inDaysLabel } from "../lib/dashboard";
import { generatePlan } from "../lib/planner";
import type { CourseItem } from "../lib/types";

let passed = 0;
const test = (n: string, f: () => void) => {
  f();
  passed++;
  console.log(`  ok  ${n}`);
};

const today = "2026-10-05";
const mk = (o: Partial<CourseItem>): CourseItem => ({
  id: o.title ?? "x", course: "ECON1101", title: "T", type: "assignment",
  dueDate: "2026-10-20", weightPct: 10, done: false, ...o,
});
const items = [
  mk({ title: "Late", dueDate: "2026-10-01", weightPct: 5 }),
  mk({ title: "Soon", dueDate: "2026-10-08", weightPct: 20, verify: ["Check"] }),
  mk({ title: "Mid", dueDate: "2026-10-19", weightPct: 15, verify: ["Check"], confirmed: true }),
  mk({ title: "Far", dueDate: "2026-12-01", weightPct: 40 }),
  mk({ title: "Done", dueDate: "2026-10-07", weightPct: 99, done: true }),
];
const plan = generatePlan(items.filter((i) => !i.done), { startDate: today });
const d = buildDashboard(items, plan, today);

console.log("Dashboard");
test("next deadline is the nearest upcoming open item", () => {
  assert.equal(d.next?.item.title, "Soon");
  assert.equal(d.next?.inDays, 3);
});
test("grade due in 14 days counts only open, upcoming items", () => {
  assert.equal(d.soon.count, 2);
  assert.equal(d.soon.weightPct, 35);
});
test("overdue and flagged-unchecked items are counted", () => {
  assert.deepEqual(d.overdue.map((i) => i.title), ["Late"]);
  assert.equal(d.needsChecking, 1);
});
test("today's hours equal the sum of today's blocks", () => {
  const sum = plan.blocks.filter((b) => b.date === today).reduce((s, b) => s + b.hours, 0);
  assert.ok(Math.abs(d.todayHours - sum) < 0.11);
});
test("empty plan doesn't crash", () => {
  const e = buildDashboard([], generatePlan([], { startDate: today }), today);
  assert.equal(e.next, null);
  assert.equal(e.week, null);
});
test("labels", () => {
  assert.equal(inDaysLabel(0), "today");
  assert.equal(inDaysLabel(1), "tomorrow");
  assert.equal(inDaysLabel(5), "in 5 days");
});
console.log(`\nAll ${passed} dashboard tests passed.`);
