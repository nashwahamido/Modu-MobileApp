import type { ClusterDriver, IslandDriverRegistry } from "./offsetDriver";
import type { PartId, PushOpenSpec } from "@/src/game/core/type";

/** Registry key for one telescoping rigid group (level × ratio). */
const pushKey = (level: string, ratio: number) => `push:${level}:${ratio}`;

/** partId → the ClusterDriver of its telescoping group. Parts in a group share one driver, so the whole group moves as a rigid body — same mechanism the combine/park staging uses. */
export function buildPushDriverMap(
  spec: PushOpenSpec,
  registry: IslandDriverRegistry,
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

/** Set one level's travel: every group of that level offsets by axis·d·ratio. */
function setTravel(spec: PushOpenSpec, registry: IslandDriverRegistry, level: string, d: number) {
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

/** The finishing beat's motion: each drawer level pops OPEN (ease-out, the spring), rests a moment, then glides CLOSED — one level after the other. Ends with every driver back at zero, so the scene is bit-identical to the static flush render. */
export async function runPushOpen(
  spec: PushOpenSpec,
  registry: IslandDriverRegistry,
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
