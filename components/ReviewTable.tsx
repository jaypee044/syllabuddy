"use client";

import { isValidISO } from "@/lib/dates";
import { estimateHours } from "@/lib/planner";
import { summariseVerification } from "@/lib/safety";
import { ITEM_TYPES, type CourseItem, type ItemType } from "@/lib/types";

interface Props {
  items: CourseItem[];
  colors: Record<string, string>;
  onChange: (items: CourseItem[]) => void;
}

export default function ReviewTable({ items, colors, onChange }: Props) {
  const update = (id: string, patch: Partial<CourseItem>) =>
    onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const addRow = () =>
    onChange([
      ...items,
      {
        id: `m${Date.now()}`,
        course: items[items.length - 1]?.course ?? "My course",
        title: "New item",
        type: "assignment",
        dueDate: "",
        weightPct: 0,
        done: false,
      },
    ]);

  const v = summariseVerification(items);

  return (
    <div className="card">
      {v.read > 0 && (
        <div className="pills" aria-label="Verification summary">
          <span className="pill">{v.read} read by AI</span>
          {v.verified > 0 && <span className="pill ok">{v.verified} verified</span>}
          {v.confirmed > 0 && <span className="pill ok">{v.confirmed} confirmed</span>}
          {v.toCheck > 0 && <span className="pill bad">{v.toCheck} to check</span>}
          {v.notCheckable > 0 && (
            <span className="pill">{v.notCheckable} can't be auto-checked</span>
          )}
        </div>
      )}
      <div className="table-scroll">
        <table className="items">
          <thead>
            <tr>
              <th>Done</th>
              <th>Course</th>
              <th>Item</th>
              <th>Type</th>
              <th>Due</th>
              <th>Grade %</th>
              <th>Hours</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className={i.done ? "done" : ""}>
                <td className="chk">
                  <input
                    type="checkbox"
                    aria-label={`Mark ${i.title} as done`}
                    checked={!!i.done}
                    onChange={(e) => update(i.id, { done: e.target.checked })}
                  />
                </td>
                <td>
                  <span className="dot" style={{ background: colors[i.course] }} />
                  <input
                    style={{ width: "calc(100% - 18px)" }}
                    aria-label="Course"
                    value={i.course}
                    onChange={(e) => update(i.id, { course: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    aria-label="Item title"
                    value={i.title}
                    onChange={(e) => update(i.id, { title: e.target.value })}
                  />
                  {i.verify && i.verify.length > 0 && (
                    <div className="flag" role="status">
                      <b>Check this:</b> {i.verify.join(". ")}.{" "}
                      <button
                        className="linkish"
                        onClick={() => update(i.id, { verify: undefined, confirmed: true })}
                      >
                        Looks right
                      </button>
                    </div>
                  )}
                  {i.evidence && (
                    <div className="note">
                      From your syllabus: “{i.evidence}”
                      {i.verified && <span className="tag"> verified</span>}
                      {!i.verified && i.confirmed && <span className="tag"> confirmed by you</span>}
                    </div>
                  )}
                  {i.note && <div className="note">{i.note}</div>}
                </td>
                <td>
                  <select
                    aria-label="Type"
                    value={i.type}
                    onChange={(e) => update(i.id, { type: e.target.value as ItemType })}
                  >
                    {ITEM_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="date"
                    aria-label="Due date"
                    className={isValidISO(i.dueDate) ? "" : "bad"}
                    value={i.dueDate}
                    onChange={(e) =>
                      update(i.id, {
                        dueDate: e.target.value,
                        note: undefined,
                        verify: undefined,
                        verified: false,
                        confirmed: true,
                      })
                    }
                  />
                </td>
                <td className="num">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    aria-label="Percent of grade"
                    value={i.weightPct}
                    onChange={(e) => update(i.id, { weightPct: Number(e.target.value) || 0 })}
                  />
                </td>
                <td className="num">
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    aria-label="Estimated hours"
                    placeholder={String(estimateHours(i))}
                    value={i.estHours ?? ""}
                    onChange={(e) =>
                      update(i.id, {
                        estHours: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </td>
                <td className="act">
                  <button
                    className="btn ghost small"
                    aria-label={`Remove ${i.title}`}
                    onClick={() => onChange(items.filter((x) => x.id !== i.id))}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        <button className="btn small" onClick={addRow}>
          Add an item
        </button>
        <button
          className="btn ghost small"
          onClick={() => {
            if (confirm("Remove all items?")) onChange([]);
          }}
        >
          Clear all
        </button>
      </div>
    </div>
  );
}
