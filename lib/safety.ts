import { diffDays, isValidISO, parseISO } from "./dates";
import {
  ITEM_TYPES,
  type CourseItem,
  type ExtractResponse,
  type ItemType,
} from "./types";

/**
 * Safety checks around the AI extraction step.
 *
 * The model reads untrusted documents, so nothing it returns is trusted:
 * every item is checked against the source text, plausible-date rules and an
 * instruction-pattern scan before it reaches the student, and anything doubtful
 * is flagged for the review table.
 */

export interface RawResult {
  course?: string;
  items?: Array<{
    title?: string;
    type?: string;
    dueDate?: string | null;
    weightPct?: number | null;
    note?: string | null;
    evidence?: string | null;
  }>;
}

// ---------- prompt injection ----------

const INJECTION_PATTERNS: Array<[RegExp, string]> = [
  [
    /ignore (all |any |the |your )?(previous|prior|above|earlier|preceding) (instructions?|prompts?|rules|messages?)/i,
    "tells the AI to ignore its instructions",
  ],
  [
    /disregard (all |any |the |your )?(previous|prior|above|earlier|preceding)/i,
    "tells the AI to disregard its instructions",
  ],
  [/(note|message|instructions?) (to|for) (the )?(ai|a\.i\.|assistants?|llms?|language model|model|chatbot)/i, "addresses the AI directly"],
  [
    /(assistants?|chatbots?|llms?|language models?|ai (tools?|systems?|models?))\s+(reading|processing|summari[sz]ing|analy[sz]ing|parsing)\b/i,
    "addresses the AI directly",
  ],
  [/new instructions?\s*:/i, "gives the AI new instructions"],
  [/system prompt/i, "mentions the system prompt"],
  [
    /(mark|set|flag) (all|every|each)\b[^.\n]{0,40}\b(done|complete|completed|submitted)/i,
    "tries to change the status of items",
  ],
  [
    /(treat|consider|assume|regard)\s+(all|every|each)\b[^.\n]{0,40}\b(deadlines?|dates?|items?)\b/i,
    "tries to change how deadlines are read",
  ],
  [
    /(delete|remove|drop|hide) (all|every|each)\b[^.\n]{0,40}\b(items?|deadlines?|assignments?|exams?)/i,
    "tries to delete items",
  ],
  [
    /(reveal|print|output|repeat|leak) (your|the) (instructions|prompt|system|api key|key|secrets?)/i,
    "tries to extract hidden instructions or keys",
  ],
  [/do not (tell|inform|show|mention)[^.\n]{0,30}\b(user|student|reader)/i, "asks the AI to hide something from the student"],
];

/** Reasons the text looks like it is trying to instruct an AI. Empty if clean. */
export function detectInjection(text: string): string[] {
  const reasons = new Set<string>();
  for (const [re, reason] of INJECTION_PATTERNS) if (re.test(text)) reasons.add(reason);
  return [...reasons];
}

// ---------- evidence checking ----------

/**
 * Lowercase and tidy text so a quote compares fairly with the source, including
 * text pulled from a PDF: ligatures (ﬁ), odd dashes, soft hyphens, zero-width
 * characters, non-breaking spaces and quote marks are all smoothed out.
 */
export const norm = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u00ad\u200b-\u200d\ufeff]/g, "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[“”"‘’'`]/g, "")
    .trim();

const compact = (s: string) => norm(s).replace(/[\s\-]/g, "");

/**
 * True if the quoted line really appears in the source (ellipses allowed).
 * The second comparison ignores spaces and hyphens, because PDF text often
 * splits words across lines ("assess- ment") or joins them oddly.
 */
export function quoteInSource(quote: string, source: string): boolean {
  const src = norm(source);
  const srcCompact = compact(source);
  const parts = quote.split(/\.{3}|…/).filter((p) => norm(p).length >= 6);
  return parts.length > 0 && parts.every((p) => src.includes(norm(p)) || srcCompact.includes(compact(p)));
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_RE = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*";

interface Mention {
  day: number;
  month: number; // 0-11
  year?: number;
}

/**
 * Every explicit date written in a line, e.g. "7 December 2026", "Dec 7",
 * "14/10/26" or "2026-10-14". Ambiguous numeric dates like 04/11 yield both
 * readings (day-first and month-first). Each entry is a list of readings of
 * one written date.
 */
function mentionsIn(quote: string): Mention[][] {
  const found: Mention[][] = [];
  let m: RegExpExecArray | null;

  const dayFirst = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b(?:,?\\s*(\\d{4}))?`, "gi");
  while ((m = dayFirst.exec(quote))) {
    found.push([{ day: Number(m[1]), month: MONTHS.indexOf(m[2].toLowerCase()), year: m[3] ? Number(m[3]) : undefined }]);
  }
  const monthFirst = new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s*(\\d{4}))?`, "gi");
  while ((m = monthFirst.exec(quote))) {
    found.push([{ day: Number(m[2]), month: MONTHS.indexOf(m[1].toLowerCase()), year: m[3] ? Number(m[3]) : undefined }]);
  }
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  while ((m = iso.exec(quote))) {
    found.push([{ day: Number(m[3]), month: Number(m[2]) - 1, year: Number(m[1]) }]);
  }
  const slash = /\b(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?\b/g;
  while ((m = slash.exec(quote))) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : undefined;
    found.push([
      { day: a, month: b - 1, year: y },
      { day: b, month: a - 1, year: y },
    ]);
  }
  return found;
}

/** Does the quote contain an explicit date, as opposed to "Week 5" or "after the break"? */
export function statesDate(quote: string): boolean {
  return mentionsIn(quote).length > 0;
}

/**
 * Does a date written in the quote agree with the extracted date (day, month
 * and, when written, year)? Quotes with no explicit date can't be judged and
 * return true.
 */
export function dateMatchesQuote(isoDate: string, quote: string): boolean {
  const d = parseISO(isoDate);
  const mentions = mentionsIn(quote);
  if (mentions.length === 0) return true;
  return mentions.some((readings) =>
    readings.some(
      (r) =>
        r.day === d.getUTCDate() &&
        r.month === d.getUTCMonth() &&
        (r.year === undefined || r.year === d.getUTCFullYear()),
    ),
  );
}

// ---------- per-item checks ----------

export interface CheckContext {
  today: string;
  /** Pasted syllabus text. Leave undefined when the input was a PDF or photo. */
  sourceText?: string;
}

export function checkItem(
  item: Pick<CourseItem, "dueDate" | "evidence">,
  ctx: CheckContext,
): string[] {
  const flags: string[] = [];
  const dateOk = !!item.dueDate && isValidISO(item.dueDate);

  if (!dateOk) {
    flags.push("No usable date");
  } else {
    const days = diffDays(item.dueDate!, ctx.today);
    if (days < -60) flags.push("Date is more than two months in the past");
    if (days > 400) flags.push("Date is more than a year away");
  }

  if (ctx.sourceText !== undefined) {
    if (!item.evidence) {
      flags.push("No supporting line from the syllabus");
    } else if (!quoteInSource(item.evidence, ctx.sourceText)) {
      flags.push("Quoted line not found in your syllabus text");
    } else if (dateOk) {
      if (!statesDate(item.evidence)) {
        flags.push("Date was worked out from the text, not stated. Check it");
      } else if (!dateMatchesQuote(item.dueDate!, item.evidence)) {
        flags.push("Date doesn't match the quoted line");
      }
    }
  }
  return flags;
}

// ---------- whole-course checks ----------

/** Warn when a course's grade weights don't add up to 100%. */
export function checkWeights(items: CourseItem[]): string[] {
  const totals = new Map<string, number>();
  for (const i of items) totals.set(i.course, (totals.get(i.course) ?? 0) + (i.weightPct || 0));
  const out: string[] = [];
  for (const [course, total] of totals) {
    if (total > 0 && Math.abs(total - 100) > 1) {
      out.push(
        `${course}: grade weights add up to ${Math.round(total)}%, not 100%. An item may be missing or misread.`,
      );
    }
  }
  return out;
}

/** How many AI-read items were verified, confirmed by the student, or need a look. */
export function summariseVerification(items: CourseItem[]) {
  const ai = items.filter((i) => i.fromAi);
  let verified = 0;
  let confirmed = 0;
  let toCheck = 0;
  let notCheckable = 0;
  for (const i of ai) {
    if (i.verify?.length) toCheck++;
    else if (i.verified) verified++;
    else if (i.confirmed) confirmed++;
    else notCheckable++;
  }
  return { read: ai.length, verified, confirmed, toCheck, notCheckable };
}

// ---------- turning raw model output into safe items ----------

const MAX_ITEMS = 100;

const clean = (s: unknown, max: number) =>
  typeof s === "string"
    ? s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
    : "";

export function processExtraction(
  raw: RawResult,
  ctx: CheckContext & { stamp?: number },
): ExtractResponse {
  const warnings: string[] = [];
  const stamp = ctx.stamp ?? Date.now();
  const course = clean(raw.course, 80) || "Course";

  const inputInjection = ctx.sourceText ? detectInjection(ctx.sourceText) : [];
  if (inputInjection.length > 0) {
    warnings.push(
      `This syllabus contains text that looks like instructions to an AI (${inputInjection.join("; ")}). It was treated as plain text and not followed. Check the table carefully.`,
    );
  }

  let removed = 0;
  const items: CourseItem[] = [];

  (raw.items ?? []).slice(0, MAX_ITEMS).forEach((i, idx) => {
    const title = clean(i.title, 120);
    if (!title) return;
    const note = clean(i.note, 200);
    const evidence = clean(i.evidence, 240);

    // Output check: a deadline should never read like a command.
    if (detectInjection(`${title}\n${note}\n${evidence}`).length > 0) {
      removed++;
      return;
    }

    const type: ItemType = ITEM_TYPES.includes(i.type as ItemType) ? (i.type as ItemType) : "other";
    const dueDate = i.dueDate && isValidISO(i.dueDate) ? i.dueDate : "";
    const verify = checkItem({ dueDate, evidence }, ctx);

    items.push({
      id: `x${stamp}-${idx}`,
      course,
      title,
      type,
      dueDate,
      weightPct: Math.min(100, Math.max(0, Number(i.weightPct) || 0)),
      done: false, // status is never taken from the model
      note: note || undefined,
      evidence: evidence || undefined,
      verify: verify.length > 0 ? verify : undefined,
      fromAi: true,
      verified: ctx.sourceText !== undefined && !!evidence && verify.length === 0,
    });
  });

  if (removed > 0) {
    warnings.push(
      `Removed ${removed} item${removed === 1 ? "" : "s"} that read like instructions instead of deadlines.`,
    );
  }
  if (ctx.sourceText === undefined && items.length > 0) {
    warnings.push("Dates read from a file can't be cross-checked automatically. Compare them with your syllabus.");
  }
  const flagged = items.filter((i) => i.verify?.length).length;
  if (flagged > 0) {
    warnings.push(`${flagged} item${flagged === 1 ? " needs" : "s need"} a closer look. They're marked in the table.`);
  }
  if (items.length === 0 && removed === 0) warnings.push("No dated items were found in that syllabus.");

  return { items, warnings };
}
