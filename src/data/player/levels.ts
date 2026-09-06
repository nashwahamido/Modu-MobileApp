export interface LevelRow {
  level: number;
  xpRequired: number;
  title: string | null;
}

function sorted(rows: LevelRow[]): LevelRow[] {
  return [...rows].sort((a, b) => a.level - b.level);
}

export function levelForXp(xp: number, rows: LevelRow[]): number {
  const asc = sorted(rows);
  if (asc.length === 0) return 1;
  let best = asc[0];
  for (const row of asc) {
    if (row.xpRequired <= xp && row.level > best.level) best = row;
  }
  return best.level;
}

// a level title as a LABEL: "a steady hand" -> "A Steady Hand"
export function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// the title for a level: the nearest non-null title at or below it, null if none applies
export function titleForLevel(level: number, rows: LevelRow[]): string | null {
  let best: LevelRow | null = null;
  for (const row of rows) {
    if (
      row.level <= level &&
      row.title !== null &&
      (best === null || row.level > best.level)
    )
      best = row;
  }
  return best ? best.title : null;
}

export interface LevelSpan {
  xpIntoLevel: number;
  xpForNextLevel: number | null;
}

export function levelSpan(
  level: number,
  xp: number,
  rows: LevelRow[],
): LevelSpan {
  const asc = sorted(rows);
  const current = asc.find((r) => r.level === level);
  const next = asc.find((r) => r.level === level + 1);
  const floor = current?.xpRequired ?? 0;
  return {
    xpIntoLevel: Math.max(0, xp - floor),
    xpForNextLevel: next ? next.xpRequired - floor : null,
  };
}

// the 0..1 bar fill
export function levelProgressFraction(span: LevelSpan): number {
  if (span.xpForNextLevel === null || span.xpForNextLevel <= 0) return 1;
  return Math.max(0, Math.min(1, span.xpIntoLevel / span.xpForNextLevel));
}
