import type { ClusterDriver, DriverRegistry } from "./offsetDriver";
import type { PartId, PushOpenSpec } from "@/src/game/core/type";

const pushKey = (level: string, ratio: number) => `push:${level}:${ratio}`;

export function buildPushDriverMap(
  spec: PushOpenSpec,
  registry: DriverRegistry,
): Partial<Record<PartId, ClusterDriver>> {
  const map: Partial<Record<PartId, ClusterDriver>> = {};
  for (const g of spec.groups) {
    const driver = registry.get(pushKey(g.level, g.ratio));
    for (const p of g.parts) map[p] = driver;
  }
  return map;
}

const easeOutCubic = (k: number) => 1 - (1 - k) ** 3;
const easeInOutQuad = (k: number) =>
  k < 0.5 ? 2 * k * k : 1 - (1 - k) * (1 - k) * 2;
const easeOutBack = (k: number) => {
  const c1 = 1.70158;
  return 1 + (c1 + 1) * (k - 1) ** 3 + c1 * (k - 1) ** 2;
};

export function setTravel(spec: PushOpenSpec, registry: DriverRegistry, level: string, d: number) {
  for (const g of spec.groups) {
    if (g.level !== level) continue;
    registry.get(pushKey(g.level, g.ratio)).set([
      spec.axis[0] * d * g.ratio,
      spec.axis[1] * d * g.ratio,
      spec.axis[2] * d * g.ratio,
    ]);
  }
}

function tween(
  ms: number,
  ease: (k: number) => number,
  apply: (v: number) => void,
): Promise<void> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const step = () => {
      const k = Math.min(1, (Date.now() - t0) / ms);
      apply(ease(k));
      if (k < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

const hold = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const PRESS_IN_M = 0.004;

export async function popOpen(
  spec: PushOpenSpec,
  registry: DriverRegistry,
  level: string,
  pop: number,
  onRelease?: () => void,
): Promise<void> {
  await tween(90, easeInOutQuad, (v) => setTravel(spec, registry, level, -PRESS_IN_M * v));
  onRelease?.();
  await tween(420, easeOutBack, (v) => setTravel(spec, registry, level, -PRESS_IN_M + (pop + PRESS_IN_M) * v));
  setTravel(spec, registry, level, pop);
}

export async function runPushOpen(
  spec: PushOpenSpec,
  registry: DriverRegistry,
  onLevelPop?: (level: string) => void,
): Promise<void> {
  const levels = [...new Set(spec.groups.map((g) => g.level))];
  for (const level of levels) {
    onLevelPop?.(level);
    await tween(480, easeOutCubic, (v) => setTravel(spec, registry, level, spec.distance * v));
    await hold(280);
    await tween(420, easeInOutQuad, (v) => setTravel(spec, registry, level, spec.distance * (1 - v)));
    setTravel(spec, registry, level, 0);
  }
}
