import { diffDays, formatShort, isValidISO } from "./dates";
import { estimateHours } from "./planner";
import { detectInjection } from "./safety";
import type { Adjustment, Availability, CourseItem } from "./types";

/**
 * "Tell the planner what changed."
 *
 * The AI turns a plain-English update ("I'm sick Thursday to Sunday") into a
 * short list of adjustments. Nothing it says is applied directly: each
 * adjustment is validated here, described to the student in words written by
 * this code (not by the model), and applied only after the student approves.
 */

export interface RawAdjustments {
  adjustments?: Array<{
    kind?: string;
    startDate?: string | null;
    endDate?: string | null;
    hoursPerDay?: number | null;
    itemId?: string | null;
    newDate?: string | null;
    hours?: number | null;
  }>;
  unclear?: string | null;
}

export interface ValidatedAdjustments {
  adjustments: Adjustment[];
  unclear?: string;
  warnings: string[];
}

export const MAX_ADJUSTMENTS = 10;
const MAX_RANGE_DAYS = 120;

const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export function validateAdjustments(
  raw: RawAdjustments,
  items: Pick<CourseItem, "id" | "done">[],
  today: string,
): ValidatedAdjustments {
  const known = new Map(items.map((i) => [i.id, i]));
  const out: Adjustment[] = [];
  const warnings: string[] = [];
  let ignored = 0;

  for (const a of (raw.adjustments ?? []).slice(0, MAX_ADJUSTMENTS)) {
    switch (a.kind) {
      case "availability": {
        let { startDate: s, endDate: e } = a;
        if (!s || !e || !isValidISO(s) || !isValidISO(e) || !isNum(a.hoursPerDay)) {
          ignored++;
          break;
        }
        if (s > e) [s, e] = [e, s];
        if (e < today) {
          warnings.push("Ignored a change that is entirely in the past.");
          break;
        }
        if (diffDays(e, s) + 1 > MAX_RANGE_DAYS) {
          warnings.push("Ignored a change that covers more than four months. Try a shorter range.");
          break;
        }
        out.push({
          kind: "availability",
          startDate: s,
          endDate: e,
          hoursPerDay: Math.min(12, Math.max(0, Math.round(a.hoursPerDay * 2) / 2)),
        });
        break;
      }
      case "mark_done": {
        const item = a.itemId ? known.get(a.itemId) : undefined;
        if (!item) ignored++;
        else if (!item.done) out.push({ kind: "mark_done", itemId: item.id });
        break;
      }
      case "move_deadline": {
        const item = a.itemId ? known.get(a.itemId) : undefined;
        const d = a.newDate;
        if (!item || !d || !isValidISO(d) || diffDays(d, today) < -30 || diffDays(d, today) > 400) {
          ignored++;
        } else {
          out.push({ kind: "move_deadline", itemId: item.id, newDate: d });
        }
        break;
      }
      case "set_hours": {
        const item = a.itemId ? known.get(a.itemId) : undefined;
        if (!item || !isNum(a.hours) || a.hours < 0.5 || a.hours > 60) ignored++;
        else out.push({ kind: "set_hours", itemId: item.id, hours: Math.round(a.hours * 2) / 2 });
        break;
      }
      default:
        ignored++;
    }
  }

  if ((raw.adjustments?.length ?? 0) > MAX_ADJUSTMENTS) {
    warnings.push(`Only the first ${MAX_ADJUSTMENTS} changes were kept.`);
  }
  if (ignored > 0) {
    warnings.push(
      `Ignored ${ignored} change${ignored === 1 ? "" : "s"} that referred to an unknown item or had an invalid value.`,
    );
  }

  let unclear: string | undefined;
  if (typeof raw.unclear === "string") {
    const t = raw.unclear.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
    if (t && detectInjection(t).length === 0) unclear = t;
  }

  return { adjustments: out, unclear, warnings };
}

function range(start: string, end: string): string {
  return start === end ? `on ${formatShort(start)}` : `from ${formatShort(start)} to ${formatShort(end)}`;
}

/** Plain-English description, written from validated fields only. */
export function describeAdjustment(a: Adjustment, items: CourseItem[]): string {
  const item = "itemId" in a ? items.find((i) => i.id === a.itemId) : undefined;
  const name = item ? `"${item.title}" (${item.course})` : "an item";
  switch (a.kind) {
    case "availability":
      return a.hoursPerDay === 0
        ? `No studying ${range(a.startDate, a.endDate)}`
        : `Study at most ${a.hoursPerDay}h a day ${range(a.startDate, a.endDate)}`;
    case "mark_done":
      return `Mark ${name} as done`;
    case "move_deadline":
      return `Move the deadline for ${name}${item ? ` from ${formatShort(item.dueDate)}` : ""} to ${formatShort(a.newDate)}`;
    case "set_hours":
      return `Plan ${a.hours}h of study for ${name}${item ? ` (currently ${estimateHours(item)}h)` : ""}`;
  }
}

export function applyAdjustments(
  adjustments: Adjustment[],
  items: CourseItem[],
  availability: Availability[],
  stamp: number = Date.now(),
): { items: CourseItem[]; availability: Availability[] } {
  let nextItems = items;
  const nextAvail = [...availability];

  adjustments.forEach((a, n) => {
    if (a.kind === "availability") {
      nextAvail.push({
        id: `a${stamp}-${n}`,
        startDate: a.startDate,
        endDate: a.endDate,
        hoursPerDay: a.hoursPerDay,
      });
      return;
    }
    nextItems = nextItems.map((i) => {
      if (i.id !== a.itemId) return i;
      if (a.kind === "mark_done") return { ...i, done: true };
      if (a.kind === "set_hours") return { ...i, estHours: a.hours };
      return {
        ...i,
        dueDate: a.newDate,
        note: `Deadline moved from ${i.dueDate || "no date"} by you`,
        verify: undefined,
        verified: false,
        confirmed: true,
      };
    });
  });

  return { items: nextItems, availability: nextAvail };
}

export function describeAvailability(a: Availability): string {
  return describeAdjustment(
    { kind: "availability", startDate: a.startDate, endDate: a.endDate, hoursPerDay: a.hoursPerDay },
    [],
  );
}
