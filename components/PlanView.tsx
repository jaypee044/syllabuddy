"use client";

import { useMemo, useState } from "react";
import { addDays, formatDay, formatShort, todayISO } from "@/lib/dates";
import { buildIcs } from "@/lib/ics";
import { buildWeekSummary } from "@/lib/summary";
import type { Availability, CourseItem, Plan } from "@/lib/types";

export interface PlanSettings {
  startDate: string; // "" = today
  weekdayHours: number;
  weekendHours: number;
  availability: Availability[];
}

interface Props {
  plan: Plan;
  items: CourseItem[];
  colors: Record<string, string>;
  settings: PlanSettings;
  onSettings: (s: PlanSettings) => void;
  skipped: number;
}

/** One chip per item per day: merge work and revision blocks for the same item. */
function groupBlocks(blocks: Plan["blocks"]) {
  const out: Plan["blocks"] = [];
  for (const b of blocks) {
    const hit = out.find((x) => x.itemId === b.itemId);
    if (hit) hit.hours = Math.round((hit.hours + b.hours) * 10) / 10;
    else out.push({ ...b });
  }
  return out;
}

export default function PlanView({ plan, items, colors, settings, onSettings, skipped }: Props) {
  const [picked, setPicked] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const today = todayISO();

  const week = useMemo(() => {
    return (
      plan.weeks.find((w) => w.weekStart === picked) ??
      plan.weeks.find((w) => w.load === "crunch") ??
      plan.weeks[0]
    );
  }, [plan.weeks, picked]);

  const maxHours = Math.max(1, ...plan.weeks.map((w) => Math.max(w.capacityHours, w.scheduledHours)));
  const crunchCount = plan.weeks.filter((w) => w.load === "crunch").length;

  function download() {
    const ics = buildIcs(items, plan);
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "semester-plan.ics";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyWeek() {
    if (!week) return;
    const text = buildWeekSummary(items, plan, week.weekStart);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this plan:", text);
    }
  }

  return (
    <div className="card">
      <div className="controls">
        <label className="field">
          Plan from
          <input
            type="date"
            value={settings.startDate || today}
            onChange={(e) => onSettings({ ...settings, startDate: e.target.value })}
          />
        </label>
        <label className="field">
          Weekday hours
          <input
            className="narrow"
            type="number"
            min={0.5}
            max={12}
            step={0.5}
            value={settings.weekdayHours}
            onChange={(e) => onSettings({ ...settings, weekdayHours: Number(e.target.value) || 1 })}
          />
        </label>
        <label className="field">
          Weekend hours
          <input
            className="narrow"
            type="number"
            min={0.5}
            max={14}
            step={0.5}
            value={settings.weekendHours}
            onChange={(e) => onSettings({ ...settings, weekendHours: Number(e.target.value) || 1 })}
          />
        </label>
        <button className="btn mark" onClick={() => onSettings({ ...settings, startDate: "" })}>
          I fell behind: re-plan from today
        </button>
        <button className="btn primary" onClick={download}>
          Download calendar (.ics)
        </button>
      </div>

      {skipped > 0 && (
        <div className="alert soft">
          {skipped} item{skipped === 1 ? " has" : "s have"} no due date and {skipped === 1 ? "is" : "are"} left
          out of the plan. Add dates in the table above.
        </div>
      )}
      {plan.warnings.length > 0 && (
        <div className="alert" role="status">
          <b>Check these:</b>
          <ul>
            {plan.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {plan.weeks.length === 0 ? (
        <p className="empty">Nothing left to plan. Every item is done or has no date.</p>
      ) : (
        <>
          <p style={{ margin: "16px 0 10px" }}>
            <b>{plan.totalHours}h</b> over <b>{plan.weeks.length} weeks</b>
            {crunchCount > 0 ? (
              <>
                {" "}· <b style={{ color: "var(--crunch)" }}>{crunchCount} crunch week{crunchCount === 1 ? "" : "s"}</b>. Tap a bar for details.
              </>
            ) : (
              <> · No crunch weeks.</>
            )}
          </p>

          <div className="strip" role="group" aria-label="Study hours per week">
            {plan.weeks.map((w) => (
              <button
                key={w.weekStart}
                className={`${w.load}${week?.weekStart === w.weekStart ? " sel" : ""}`}
                onClick={() => setPicked(w.weekStart)}
                aria-label={`Week of ${formatDay(w.weekStart)}: ${w.scheduledHours} hours, ${w.load}`}
                aria-pressed={week?.weekStart === w.weekStart}
              >
                <span className="hrs">{w.scheduledHours}h</span>
                <span className="bar" style={{ height: `${(w.scheduledHours / maxHours) * 100}%` }} />
                <span className="lbl">{formatDay(w.weekStart)}</span>
              </button>
            ))}
          </div>
          <div className="legend">
            <span>
              <i style={{ background: "var(--c1)" }} />
              Normal
            </span>
            <span>
              <i style={{ background: "#9ad9d4" }} />
              Light
            </span>
            <span>
              <i style={{ background: "var(--crunch)" }} />
              Crunch
            </span>
          </div>

          {week && (
            <div className="week-detail">
              <h3>
                Week of {formatDay(week.weekStart)}
                <span className={`badge ${week.load}`}>{week.load}</span>
                <span className="badge">
                  {week.scheduledHours}h of {week.capacityHours}h
                </span>
                <button className="btn ghost small" onClick={copyWeek} style={{ marginLeft: "auto" }}>
                  {copied ? "Copied" : "Copy this week as text"}
                </button>
              </h3>
              {week.reasons.length > 0 && <p className="reasons">{week.reasons[0]}.</p>}

              {week.dueItems.length > 0 && (
                <ul className="due-list">
                  {week.dueItems.map((i) => (
                    <li key={i.id}>
                      <span className="dot" style={{ background: colors[i.course] }} />
                      <b>{i.title}</b>
                      <span>
                        {i.course}, due {formatShort(i.dueDate)}
                        {i.weightPct ? `, ${i.weightPct}% of grade` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="days">
                {Array.from({ length: 7 }, (_, d) => addDays(week.weekStart, d)).map((date) => {
                  const blocks = groupBlocks(plan.blocks.filter((b) => b.date === date));
                  const due = items.filter((i) => !i.done && i.dueDate === date);
                  return (
                    <div key={date} className={`day${date === today ? " today" : ""}`}>
                      <div className="dname">{formatShort(date)}</div>
                      {due.map((i) => (
                        <span key={i.id} className="chip due">
                          <b>Due:</b> {i.title}
                        </span>
                      ))}
                      {blocks.map((b) => (
                        <span key={b.id} className="chip" style={{ background: colors[b.course] }}>
                          <b>{b.hours}h</b> {b.title}
                        </span>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
