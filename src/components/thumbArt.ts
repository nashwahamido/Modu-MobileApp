// Which picture a catalogue tile shows, as a PURE rule — the same split as data/catalog/assets.ts and for the same reason. CatalogThumb, the only caller, requires PNG assets and react-native at module load and cannot be imported outside the app, so the policy lives here where node:test can pin it.

/** An item's bundled art: one picture per finish the app ships, plus the model's own. */
export interface BundledArt<T> {
  default: T;
  byVariation: Record<string, T>;
}

/**
 * An item's bundled art, split into the two questions a caller actually has.
 *
 * `exact` — the bundle's picture OF THIS VARIATION, or undefined when it ships none. A null/undefined
 * variation is the item's own default look, so the bundle's default picture is the exact answer for it,
 * not a substitute.
 *
 * `standIn` — any picture of this item, for the last resort where storage has failed and the alternative
 * is a hole in the grid.
 *
 * These used to be ONE lookup that fell back to `default` internally, which meant it never returned
 * undefined for an item with any bundled art at all. A black LACK therefore showed the WOODEN render, and
 * because the answer was never absent, storage — which has black.png — was never asked.
 */
export function pickBundled<T>(
  entry: BundledArt<T> | undefined,
  variation: string | null | undefined,
): { exact: T | undefined; standIn: T | undefined } {
  if (!entry) return { exact: undefined, standIn: undefined };
  return { exact: variation ? entry.byVariation[variation] : entry.default, standIn: entry.default };
}

/**
 * The picture to render, in preference order: the bundle's own picture of this variation, then storage,
 * then any bundled art rather than nothing.
 *
 * The exact bundle outranks storage because storage holds OLDER renders of the built models — leaving it
 * first is what made the inventory and the catalogue disagree about what a LACK looks like. It only
 * outranks storage where it genuinely depicts the variation being asked for; for anything else storage is
 * the better answer, since it is per-variation by construction.
 */
export function chooseThumbArt<T>(
  exactBundled: T | undefined,
  remote: T | undefined,
  bundledStandIn: T | undefined,
): T | undefined {
  return exactBundled ?? remote ?? bundledStandIn;
}
