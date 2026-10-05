import { addDays, formatDay, formatShort } from "./dates";
import type { CourseItem, Plan } from "./types";

/** Plain-text version of one week of the plan, for pasting into notes or a chat. */
export function buildWeekSummary(items: CourseItem[], plan: Plan, weekStart: string): string {
  const week = plan.weeks.find((w) => w.weekStart === weekStart);
  if (!week) return "";
  const lines: string[] = [];
  lines.push(`Study plan: week of ${formatDay(weekStart)}`);
  lines.push(`${week.scheduledHours}h planned of ${week.capacityHours}h available (${week.load})`);
  if (week.reasons.length > 0) lines.push(week.reasons.join(". ") + ".");

  for (let d = 0; d < 7; d++) {
    const date = addDays(weekStart, d);
    const due = items.filter((i) => !i.done && i.dueDate === date);
    const blocks = plan.blocks.filter((b) => b.date === date);
    if (due.length === 0 && blocks.length === 0) continue;
    lines.push("");
    lines.push(formatShort(date));
    for (const i of due) lines.push(`  DUE: ${i.title} (${i.course})${i.weightPct ? `, ${i.weightPct}% of grade` : ""}`);
    for (const b of blocks) lines.push(`  ${b.hours}h ${b.kind === "review" ? "Revise" : "Work on"} ${b.title} (${b.course})`);
  }
  lines.push("");
  lines.push("Made with Syllabuddy");
  return lines.join("\n");
}
