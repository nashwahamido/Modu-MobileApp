export type Milestone = 0 | 0.35 | 1;

export function creepCap(milestone: Milestone): number {
  if (milestone === 1) return 1;
  return milestone === 0 ? 0.3 : 0.85;
}

const CREEP_TAU_MS = 800;
const FINAL_RAMP_MS = 400;

export function advance(current: number, dtMs: number, milestone: Milestone): number {
  if (milestone === 1) {
    return Math.min(1, Math.max(current, current + dtMs / FINAL_RAMP_MS));
  }
  const jumped = Math.max(current, milestone);
  const cap = creepCap(milestone);
  const eased = jumped + (cap - jumped) * (1 - Math.exp(-dtMs / CREEP_TAU_MS));
  return Math.min(Math.max(cap, jumped), Math.max(jumped, eased));
}
