// The loading overlay's hybrid creep + jump progress model (spec: 2026-07-18-loading-screen-design.md). Pure so it unit-tests without React: the overlay ticks advance() on an interval and renders the returned fraction.

/** Reached load signal: 0 nothing, 0.35 furniture data composed, 1 model parsed. */
export type Milestone = 0 | 0.35 | 1;

/** How far the bar may drift without a new signal — just shy of the NEXT milestone, so it never claims progress it hasn't earned; 1 once everything landed. */
export function creepCap(milestone: Milestone): number {
  if (milestone === 1) return 1;
  return milestone === 0 ? 0.3 : 0.85;
}

/** Exponential creep time constant — visibly alive without racing to the cap. */
const CREEP_TAU_MS = 800;
/** The final 0.85→1 sweep once everything is ready, linear so it completes fast and deterministically. */
const FINAL_RAMP_MS = 400;

/** One tick of the bar: jump up to a newly-landed milestone, then ease toward the cap. Monotonic — never returns less than `current`. */
export function advance(current: number, dtMs: number, milestone: Milestone): number {
  if (milestone === 1) {
    return Math.min(1, Math.max(current, current + dtMs / FINAL_RAMP_MS));
  }
  const jumped = Math.max(current, milestone);
  const cap = creepCap(milestone);
  const eased = jumped + (cap - jumped) * (1 - Math.exp(-dtMs / CREEP_TAU_MS));
  // Outer max(cap, jumped): a current already above this milestone's cap (stale lower milestone) must HOLD, not sink back toward the cap — the "never decreases" test pins this.
  return Math.min(Math.max(cap, jumped), Math.max(jumped, eased));
}
