import type { PartId } from "@/src/game/core/type";

/** One renderer pick, resolved to game terms: which PART owns the frontmost fragment at a screen point (dp), whether that was its ghost copy (instance 1), and the depth-buffer value there. `partId` null = the pick hit an entity outside the furniture (room shell, tool model). The promise resolves null when the pick found nothing at all — open background, which for the confirmer means a clear sightline. */
export interface PickHit {
  partId: PartId | null;
  ghost: boolean;
  depth: number;
}

export type PickProber = (xDp: number, yDp: number) => Promise<PickHit | null>;

let prober: PickProber | null = null;

/** The scene registers on model load and clears on unload — same module-singleton pattern, and reason, as partBoxes' live-box reader: the prober is a native-bridge closure, not data. Registration also only happens when the patched `pickEntityWithDepth` actually exists on the view, so an unpatched build simply never confirms and every box verdict stands. */
export function registerPickProber(p: PickProber | null): void {
  prober = p;
}

/** Fire one pick, or null when no scene (or no patched native) is mounted — the caller keeps the box verdict. */
export function probePick(xDp: number, yDp: number): Promise<PickHit | null> | null {
  return prober ? prober(xDp, yDp) : null;
}
