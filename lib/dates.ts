// All dates are handled as ISO strings (YYYY-MM-DD) and computed in UTC so that
// the result never shifts with the viewer's timezone.

const MS_DAY = 86_400_000;

export function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isValidISO(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && toISO(parseISO(s)) === s;
}

export function addDays(s: string, n: number): string {
  return toISO(new Date(parseISO(s).getTime() + n * MS_DAY));
}

/** a - b, in whole days */
export function diffDays(a: string, b: string): number {
  return Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / MS_DAY);
}

/** ISO date of the Monday on or before `s` */
export function weekStart(s: string): string {
  const dow = (parseISO(s).getUTCDay() + 6) % 7; // Mon = 0
  return addDays(s, -dow);
}

export function isWeekend(s: string): boolean {
  const g = parseISO(s).getUTCDay();
  return g === 0 || g === 6;
}

/** Today's date in the viewer's local timezone, as ISO. */
export function todayISO(): string {
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

export function formatShort(s: string): string {
  return parseISO(s).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function formatDay(s: string): string {
  return parseISO(s).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
