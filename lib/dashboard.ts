import { addDays, diffDays, isValidISO, weekStart } from "./dates";
import type { CourseItem, Plan, StudyBlock, WeekSummary } from "./types";

/** Everything the "Today" dashboard shows, worked out by code from the plan. */
export interface DashboardData {
  today: string;
  todayBlocks: StudyBlock[];
  todayHours: number;
  /** The week that contains today (or the first planned week if there isn't one). */
  week: WeekSummary | null;
  next: { item: CourseItem; inDays: number } | null;
  /** Items due in the next 14 days and the share of the grade they carry. */
  soon: { count: number; weightPct: number };
  overdue: CourseItem[];
  /** AI items with a safety flag the student hasn't looked at yet. */
  needsChecking: number;
}

export function buildDashboard(items: CourseItem[], plan: Plan, today: string): DashboardData {
  const open = items.filter((i) => !i.done && isValidISO(i.dueDate));

  const upcoming = open
    .filter((i) => diffDays(i.dueDate, today) >= 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.weightPct - a.weightPct);
  const next = upcoming[0] ? { item: upcoming[0], inDays: diffDays(upcoming[0].dueDate, today) } : null;

  const end = addDays(today, 14);
  const soonItems = upcoming.filter((i) => i.dueDate <= end);
  const weightPct = Math.round(soonItems.reduce((s, i) => s + (i.weightPct || 0), 0) * 10) / 10;

  const todayBlocks = plan.blocks.filter((b) => b.date === today);
  const ws = weekStart(today);

  return {
    today,
    todayBlocks,
    todayHours: Math.round(todayBlocks.reduce((s, b) => s + b.hours, 0) * 10) / 10,
    week: plan.weeks.find((w) => w.weekStart === ws) ?? plan.weeks[0] ?? null,
    next,
    soon: { count: soonItems.length, weightPct },
    overdue: open.filter((i) => diffDays(i.dueDate, today) < 0),
    needsChecking: items.filter((i) => !i.done && (i.verify?.length ?? 0) > 0 && !i.confirmed).length,
  };
}

export function inDaysLabel(n: number): string {
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  return `in ${n} days`;
}
