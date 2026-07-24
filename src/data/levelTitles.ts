// Level -> flavour title. Title is DERIVED from level, not stored per user: the tiers live in one place (the level_titles table in Supabase, this constant on fixtures) and both adapters resolve through titleForLevel. Keep DEFAULT_LEVEL_TITLES in sync with the migration's seed rows.
export interface LevelTitle {
  minLevel: number;
  title: string;
}

// A tier applies from its minLevel up until the next tier. Must match the seed in the migration.
export const DEFAULT_LEVEL_TITLES: LevelTitle[] = [
  { minLevel: 1, title: "an ambitious newbie" },
  { minLevel: 2, title: "a budding builder" },
  { minLevel: 3, title: "a steady hand" },
  { minLevel: 5, title: "a seasoned builder" },
  { minLevel: 8, title: "a master assembler" },
];

// The title for a level: the highest tier whose minLevel is still <= level. Null if none applies.
export function titleForLevel(level: number, tiers: LevelTitle[] = DEFAULT_LEVEL_TITLES): string | null {
  let best: LevelTitle | null = null;
  for (const tier of tiers) {
    if (tier.minLevel <= level && (best === null || tier.minLevel > best.minLevel)) best = tier;
  }
  return best ? best.title : null;
}
