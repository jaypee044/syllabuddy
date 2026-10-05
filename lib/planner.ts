import { addDays, diffDays, isWeekend, todayISO, weekStart } from "./dates";
import type {
  CourseItem,
  ItemType,
  Plan,
  PlanOptions,
  StudyBlock,
  WeekSummary,
} from "./types";

// How many days before the due date work on each kind of item may begin.
const LEAD_DAYS: Record<ItemType, number> = {
  exam: 14,
  project: 21,
  assignment: 7,
  quiz: 4,
  reading: 2,
  other: 5,
};

// Baseline effort in hours before the grade weight is added.
const BASE_HOURS: Record<ItemType, number> = {
  exam: 8,
  project: 10,
  assignment: 4,
  quiz: 2,
  reading: 1.5,
  other: 2,
};

const UNIT = 0.5; // scheduling granularity in hours

export const DEFAULT_WEEKDAY_HOURS = 3;
export const DEFAULT_WEEKEND_HOURS = 4;

const round05 = (x: number) => Math.round(x * 2) / 2;

export function estimateHours(item: CourseItem): number {
  if (item.estHours && item.estHours > 0) return round05(item.estHours);
  const weight = item.type === "reading" ? 0 : item.weightPct || 0;
  // Heavier items deserve more time: +0.25h per grade point, capped.
  return round05(Math.min(BASE_HOURS[item.type] + weight * 0.25, 30));
}

/**
 * Spreads effort for each item across the days before its due date.
 *
 * Items are handled earliest-deadline-first. Each half-hour of work goes to
 * the day (inside the item's lead window) with the most free capacity, which
 * spreads work out instead of piling it up on the last night. If the window is
 * full the planner reaches back to earlier days, and anything that still
 * doesn't fit is reported as a warning.
 */
export function generatePlan(
  allItems: CourseItem[],
  opts: PlanOptions = {},
): Plan {
  const start = opts.startDate ?? todayISO();
  const weekdayCap = opts.weekdayHours ?? DEFAULT_WEEKDAY_HOURS;
  const weekendCap = opts.weekendHours ?? DEFAULT_WEEKEND_HOURS;
  const availability = opts.availability ?? [];
  const capFor = (d: string) => {
    let cap = isWeekend(d) ? weekendCap : weekdayCap;
    for (const a of availability) {
      if (d >= a.startDate && d <= a.endDate) cap = Math.min(cap, a.hoursPerDay);
    }
    return cap;
  };

  const active = allItems
    .filter((i) => !i.done)
    .sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) || b.weightPct - a.weightPct,
    );

  const remaining = new Map<string, number>();
  const free = (d: string) => {
    if (!remaining.has(d)) remaining.set(d, capFor(d));
    return remaining.get(d)!;
  };

  const warnings: string[] = [];
  const blocks: StudyBlock[] = [];

  for (const item of active) {
    const hours = estimateHours(item);
    const reviewOnly = item.type === "exam" || item.type === "quiz";

    // Exams/quizzes need to be prepared the day before; the rest can be
    // finished on the due date itself.
    let lastDay = reviewOnly ? addDays(item.dueDate, -1) : item.dueDate;
    if (item.dueDate < start) {
      warnings.push(
        `"${item.title}" (${item.course}) was due ${item.dueDate} and isn't marked done. It has been scheduled for today.`,
      );
      lastDay = start;
    } else if (lastDay < start) {
      lastDay = start;
    }

    const windowStart =
      addDays(lastDay, -(LEAD_DAYS[item.type] - 1)) > start
        ? addDays(lastDay, -(LEAD_DAYS[item.type] - 1))
        : start;

    const windowDays: string[] = [];
    for (let d = windowStart; d <= lastDay; d = addDays(d, 1)) windowDays.push(d);

    const earlierDays: string[] = []; // latest first
    for (let d = addDays(windowStart, -1); d >= start; d = addDays(d, -1))
      earlierDays.push(d);

    const alloc = new Map<string, number>();
    let unscheduled = 0;

    for (let u = 0; u < hours / UNIT; u++) {
      let pick: string | null = null;
      let best = UNIT - 1e-9;
      for (const d of windowDays) {
        const f = free(d);
        if (f > best) {
          best = f;
          pick = d;
        }
      }
      if (!pick) pick = earlierDays.find((d) => free(d) >= UNIT - 1e-9) ?? null;
      if (!pick) {
        unscheduled += UNIT;
        continue;
      }
      remaining.set(pick, free(pick) - UNIT);
      alloc.set(pick, (alloc.get(pick) ?? 0) + UNIT);
    }

    if (unscheduled > 0) {
      warnings.push(
        `Not enough free time for "${item.title}" (${item.course}): ${unscheduled}h can't be scheduled before ${item.dueDate}. Raise your daily study hours or start earlier.`,
      );
    }

    for (const [date, h] of alloc) {
      blocks.push({
        id: `${item.id}@${date}`,
        itemId: item.id,
        course: item.course,
        title: item.title,
        date,
        hours: h,
        kind: reviewOnly ? "review" : "work",
      });
    }
  }

  blocks.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

  return {
    startDate: start,
    blocks,
    weeks: summariseWeeks(active, blocks, start, capFor),
    warnings,
    totalHours: blocks.reduce((s, b) => s + b.hours, 0),
  };
}

function summariseWeeks(
  active: CourseItem[],
  blocks: StudyBlock[],
  start: string,
  capFor: (d: string) => number,
): WeekSummary[] {
  if (active.length === 0) return [];

  const lastDue = active.reduce(
    (m, i) => (i.dueDate > m ? i.dueDate : m),
    start,
  );
  const weeks: WeekSummary[] = [];

  for (
    let ws = weekStart(start);
    diffDays(lastDue, ws) >= 0;
    ws = addDays(ws, 7)
  ) {
    const we = addDays(ws, 6);
    let capacityHours = 0;
    for (let k = 0; k < 7; k++) {
      const d = addDays(ws, k);
      if (d >= start) capacityHours += capFor(d);
    }
    const dueItems = active.filter((i) => i.dueDate >= ws && i.dueDate <= we);
    const scheduledHours = blocks
      .filter((b) => b.date >= ws && b.date <= we)
      .reduce((s, b) => s + b.hours, 0);
    const weightDue = dueItems.reduce((s, i) => s + (i.weightPct || 0), 0);

    const reasons: string[] = [];
    if (dueItems.length >= 3) reasons.push(`${dueItems.length} deadlines in one week`);
    if (weightDue >= 40) reasons.push(`${weightDue}% of your grade is due`);
    if (capacityHours > 0 && scheduledHours >= capacityHours * 0.85)
      reasons.push(`${scheduledHours}h of study planned, close to your limit`);

    const load =
      reasons.length > 0
        ? "crunch"
        : scheduledHours < capacityHours * 0.4 && dueItems.length === 0
          ? "light"
          : "normal";

    weeks.push({
      weekStart: ws,
      scheduledHours,
      capacityHours,
      dueItems,
      weightDue,
      load,
      reasons,
    });
  }
  return weeks;
}
