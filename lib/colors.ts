import type { CourseItem } from "./types";

/** Stable colour per course, in order of first appearance. */
export function courseColors(items: CourseItem[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const i of items) {
    if (!(i.course in map)) map[i.course] = `var(--c${Object.keys(map).length % 5})`;
  }
  return map;
}
