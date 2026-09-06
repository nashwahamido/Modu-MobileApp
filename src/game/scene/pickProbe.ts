import type { PartId } from "@/src/game/core/type";

export interface PickHit {
  partId: PartId | null;
  ghost: boolean;
  depth: number;
}

export type PickProber = (xDp: number, yDp: number) => Promise<PickHit | null>;

let prober: PickProber | null = null;

export function registerPickProber(p: PickProber | null): void {
  prober = p;
}

export function probePick(xDp: number, yDp: number): Promise<PickHit | null> | null {
  return prober ? prober(xDp, yDp) : null;
}

export function hasPickProber(): boolean {
  return prober !== null;
}
