export interface BundledArt<T> {
  default: T;
  byVariation: Record<string, T>;
}

export function pickBundled<T>(
  entry: BundledArt<T> | undefined,
  variation: string | null | undefined,
): { exact: T | undefined; standIn: T | undefined } {
  if (!entry) return { exact: undefined, standIn: undefined };
  return { exact: variation ? entry.byVariation[variation] : entry.default, standIn: entry.default };
}

export function chooseThumbArt<T>(
  exactBundled: T | undefined,
  remote: T | undefined,
  bundledStandIn: T | undefined,
): T | undefined {
  return exactBundled ?? remote ?? bundledStandIn;
}
