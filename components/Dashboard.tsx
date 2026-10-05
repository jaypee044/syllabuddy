"use client";

import { buildDashboard, inDaysLabel } from "@/lib/dashboard";
import { formatShort, todayISO } from "@/lib/dates";
import type { CourseItem, Plan } from "@/lib/types";

interface Props {
  items: CourseItem[];
  plan: Plan;
  colors: Record<string, string>;
  onDone: (itemId: string) => void;
}

export default function Dashboard({ items, plan, colors, onDone }: Props) {
  const d = buildDashboard(items, plan, todayISO());
  const w = d.week;
  const pct = w && w.capacityHours > 0 ? Math.min(100, Math.round((w.scheduledHours / w.capacityHours) * 100)) : 0;
  const crunch = w?.load === "crunch";

  return (
    <section className="dash" aria-label="Today">
      <div className="dash-grid">
        <div className={`tile${crunch ? " alert-tile" : ""}`}>
          <span className="k">This week</span>
          {w ? (
            <>
              <span className="big">
                {w.scheduledHours}h <small>of {w.capacityHours}h</small>
              </span>
              <span className="meter" aria-hidden="true">
                <i style={{ width: `${pct}%` }} />
              </span>
              <span className="sub">
                {crunch ? "Crunch week. " : w.load === "light" ? "Light week. " : "Manageable. "}
                {w.reasons[0] ? `${w.reasons[0]}.` : ""}
              </span>
            </>
          ) : (
            <span className="sub">Nothing planned yet.</span>
          )}
        </div>

        <div className="tile">
          <span className="k">Next deadline</span>
          {d.next ? (
            <>
              <span className="big">{inDaysLabel(d.next.inDays)}</span>
              <span className="sub">
                <b>{d.next.item.title}</b>, {d.next.item.course}. {formatShort(d.next.item.dueDate)}
                {d.next.item.weightPct ? `, ${d.next.item.weightPct}% of grade` : ""}
              </span>
            </>
          ) : (
            <span className="sub">No upcoming deadlines.</span>
          )}
        </div>

        <div className="tile">
          <span className="k">Grade due in 14 days</span>
          <span className="big">
            {d.soon.weightPct}% <small>across {d.soon.count} item{d.soon.count === 1 ? "" : "s"}</small>
          </span>
          <span className="sub">Share of your final grades landing in the next two weeks.</span>
        </div>

        <div className={`tile${d.needsChecking > 0 || d.overdue.length > 0 ? " warn-tile" : ""}`}>
          <span className="k">Needs your attention</span>
          <span className="big">{d.needsChecking + d.overdue.length}</span>
          <span className="sub">
            {d.needsChecking > 0 && (
              <>
                {d.needsChecking} flagged item{d.needsChecking === 1 ? "" : "s"} to check.{" "}
              </>
            )}
            {d.overdue.length > 0 && <>{d.overdue.length} overdue. </>}
            {d.needsChecking + d.overdue.length === 0 && "All checked, nothing overdue."}
          </span>
        </div>
      </div>

      <div className="today-list">
        <h3>
          Today <span className="badge">{d.todayHours}h planned</span>
        </h3>
        {d.todayBlocks.length === 0 ? (
          <p className="empty">Nothing scheduled today. Enjoy it, or get ahead on tomorrow.</p>
        ) : (
          <ul>
            {d.todayBlocks.map((b) => (
              <li key={b.id}>
                <span className="dot" style={{ background: colors[b.course] }} />
                <span>
                  <b>{b.hours}h</b> {b.kind === "review" ? "Revise" : "Work on"} {b.title}
                  <small> {b.course}</small>
                </span>
                <button className="btn ghost small" onClick={() => onDone(b.itemId)}>
                  Finished this
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
