// Levelling resolution. Mirrors public.levels in Supabase — one row per level, holding the xp needed to reach it and, on tier-start rows, the flavour title that applies from there down. That table is the ONE place to tune levelling; this module holds only the logic, and the in-memory adapter passes the dev stand-in from seed.ts. Both level and title are DERIVED per read, never stored on a user.
export interface LevelRow {
  level: number;
  // Cumulative xp to REACH this level.
  xpRequired: number;
  // Set only where a new tier begins; null rows inherit the nearest title below, so a rank is authored once.
  title: string | null;
}

// Rows sorted ascending by level, so callers never depend on the order the table came back in.
function sorted(rows: LevelRow[]): LevelRow[] {
  return [...rows].sort((a, b) => a.level - b.level);
}

// The level a given total xp has earned: the highest row still <= xp. Mirrors level_for_xp() in the migration. Never below the curve's floor.
export function levelForXp(xp: number, rows: LevelRow[]): number {
  const asc = sorted(rows);
  if (asc.length === 0) return 1;
  let best = asc[0];
  for (const row of asc) {
    if (row.xpRequired <= xp && row.level > best.level) best = row;
  }
  return best.level;
}

// The title for a level: the nearest non-null title at or below it. Null if none applies.
export function titleForLevel(level: number, rows: LevelRow[]): string | null {
  let best: LevelRow | null = null;
  for (const row of rows) {
    if (row.level <= level && row.title !== null && (best === null || row.level > best.level)) best = row;
  }
  return best ? best.title : null;
}

// How far a total xp has climbed into a level. Takes the level explicitly rather than re-deriving it, so the UI always shows the same number the shop gates purchases on (both adapters store level, kept equal to levelForXp(xp) by the reward path).
export interface LevelSpan {
  xpIntoLevel: number;
  // The xp span of this level, or null at the top of the curve — where a bar should read as full, not as 0%.
  xpForNextLevel: number | null;
}

export function levelSpan(level: number, xp: number, rows: LevelRow[]): LevelSpan {
  const asc = sorted(rows);
  const current = asc.find((r) => r.level === level);
  const next = asc.find((r) => r.level === level + 1);
  const floor = current?.xpRequired ?? 0;
  return {
    xpIntoLevel: Math.max(0, xp - floor),
    xpForNextLevel: next ? next.xpRequired - floor : null,
  };
}

// The 0..1 fill for a progress bar. Full at the top of the curve, where there is no next level to climb to.
export function levelProgressFraction(span: LevelSpan): number {
  if (span.xpForNextLevel === null || span.xpForNextLevel <= 0) return 1;
  return Math.max(0, Math.min(1, span.xpIntoLevel / span.xpForNextLevel));
}
