import { addDays } from "./dates";
import type { CourseItem, Plan } from "./types";

const esc = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

// RFC 5545: lines must be folded at 75 octets; we stay well under it.
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 70) {
    out.push(rest.slice(0, 70));
    rest = " " + rest.slice(70);
  }
  out.push(rest);
  return out.join("\r\n");
}

const compactDate = (iso: string) => iso.replace(/-/g, "");

function floatingDateTime(iso: string, startHour: number, plusHours: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, startHour, 0) + plusHours * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}T${p(t.getUTCHours())}${p(t.getUTCMinutes())}00`;
}

export interface IcsOptions {
  /** Local hour at which study blocks start. Default 19:00. */
  studyStartHour?: number;
  includeStudyBlocks?: boolean;
}

export function buildIcs(
  items: CourseItem[],
  plan: Plan,
  opts: IcsOptions = {},
): string {
  const startHour = opts.studyStartHour ?? 19;
  const stamp =
    new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Syllabuddy//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Syllabuddy plan",
  ];

  for (const item of items.filter((i) => !i.done)) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:due-${item.id}@syllabuddy`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compactDate(item.dueDate)}`,
      `DTEND;VALUE=DATE:${compactDate(addDays(item.dueDate, 1))}`,
      `SUMMARY:${esc(`DUE: ${item.title} (${item.course})`)}`,
      `DESCRIPTION:${esc(
        `${item.type}${item.weightPct ? `, ${item.weightPct}% of grade` : ""}`,
      )}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc(`Tomorrow: ${item.title}`)}`,
      "TRIGGER:-P1D",
      "END:VALARM",
      "END:VEVENT",
    );
  }

  if (opts.includeStudyBlocks !== false) {
    for (const b of plan.blocks) {
      lines.push(
        "BEGIN:VEVENT",
        `UID:study-${b.id}@syllabuddy`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${floatingDateTime(b.date, startHour, 0)}`,
        `DTEND:${floatingDateTime(b.date, startHour, b.hours)}`,
        `SUMMARY:${esc(`${b.kind === "review" ? "Revise" : "Work on"}: ${b.title} (${b.course})`)}`,
        "END:VEVENT",
      );
    }
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
