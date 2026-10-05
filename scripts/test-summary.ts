import assert from "node:assert/strict";
import { generatePlan } from "../lib/planner";
import { buildWeekSummary } from "../lib/summary";
import type { CourseItem } from "../lib/types";

const items: CourseItem[] = [
  { id: "a", course: "ECON1101", title: "Essay", type: "assignment", dueDate: "2026-10-09", weightPct: 20, done: false },
];
const plan = generatePlan(items, { startDate: "2026-10-05" });
const text = buildWeekSummary(items, plan, "2026-10-05");
assert.ok(text.includes("Study plan: week of"));
assert.ok(text.includes("DUE: Essay (ECON1101), 20% of grade"));
assert.ok(/\dh Work on Essay/.test(text));
assert.equal(buildWeekSummary(items, plan, "2030-01-07"), "");
console.log("  ok  week summary text\n\nAll 1 summary tests passed.");
