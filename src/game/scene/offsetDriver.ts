import type { Entity, TransformManager } from 'react-native-filament';
import { quatToAxisAngle } from '@/src/game/core/geometry/math';
import type { Quat } from '@/src/game/core/type';

type Float3 = [number, number, number];

/** The baked pose an offset is measured from. */
interface Base {
  position: Float3;
  rotation: Quat;
}

/**
 * Imperatively drives one entity's pose: a world-space translation offset from its baked position, plus an (optional) absolute rotation. Both are applied together each frame via the same `setEntityRotation(false)+setEntityPosition` sequence the static placement uses, so a held part can ease its orientation toward the socket it's approaching without an orientation pop on drop.
 *
 * Plain JS arrays only — worklets-core 1.6 shared-value arrays arrive in filament's native layer as objects and are rejected ("expected an array").
 */
export interface OffsetDriver {
  attach(tm: TransformManager, entity: Entity, initial: Float3, base: Base): void;
  /** Move to a new translation offset from the baked position. */
  set(offset: Float3): void;
  /** Set the absolute rotation (xyzw). Defaults to the baked rotation. */
  setRotation(rotation: Quat): void;
  detach(): void;
  readonly value: Float3;
}

export function createOffsetDriver(): OffsetDriver {
  let tm: TransformManager | null = null;
  let entity: Entity | null = null;
  let base: Base | null = null;
  let offset: Float3 = [0, 0, 0];
  let rotation: Quat = [0, 0, 0, 1];

  const apply = () => {
    if (!tm || !entity || !base) return;
    const pos: Float3 = [
      base.position[0] + offset[0],
      base.position[1] + offset[1],
      base.position[2] + offset[2],
    ];
    const aa = quatToAxisAngle(rotation);
    if (!aa) {
      tm.setEntityPosition(entity, pos, false);
      return;
    }
    tm.setEntityRotation(entity, aa.angleRad, aa.axis, false);
    tm.setEntityPosition(entity, pos, true);
  };

  return {
    attach(t, e, initial, b) {
      tm = t;
      entity = e;
      base = b;
      offset = [...initial];
      rotation = b.rotation;
      apply();
    },
    set(next) {
      offset = [...next];
      apply();
    },
    setRotation(next) {
      rotation = next;
      apply();
    },
    detach() {
      tm = null;
      entity = null;
      base = null;
      offset = [0, 0, 0];
      rotation = [0, 0, 0, 1];
    },
    get value() {
      return offset;
    },
  };
}

/** Like OffsetDriver but for a WHOLE cluster: many entities share one offset and move in unison (used to lower a finished sub-assembly onto another at combine). Each part registers its entity; `set` applies the offset to all of them. */
export interface ClusterDriver {
  /** Register one part's entity at its baked pose; returns an unregister fn. */
  register(tm: TransformManager, entity: Entity, base: Base): () => void;
  set(offset: Float3): void;
  readonly value: Float3;
}

export function createClusterDriver(): ClusterDriver {
  let offset: Float3 = [0, 0, 0];
  const members = new Set<{ tm: TransformManager; entity: Entity; base: Base }>();

  const applyOne = (m: { tm: TransformManager; entity: Entity; base: Base }) => {
    const pos: Float3 = [
      m.base.position[0] + offset[0],
      m.base.position[1] + offset[1],
      m.base.position[2] + offset[2],
    ];
    const aa = quatToAxisAngle(m.base.rotation);
    if (!aa) {
      m.tm.setEntityPosition(m.entity, pos, false);
      return;
    }
    m.tm.setEntityRotation(m.entity, aa.angleRad, aa.axis, false);
    m.tm.setEntityPosition(m.entity, pos, true);
  };

  return {
    register(tm, entity, base) {
      const m = { tm, entity, base };
      members.add(m);
      applyOne(m);
      return () => members.delete(m);
    },
    set(next) {
      offset = [...next];
      for (const m of members) applyOne(m);
    },
    get value() {
      return offset;
    },
  };
}

/** Ease-out tween of a driver's offset (JS-thread rAF). */
export function animateDriver(driver: OffsetDriver, to: Float3, ms: number, onDone?: () => void) {
  const from: Float3 = [...driver.value];
  const t0 = Date.now();
  const step = () => {
    const k = Math.min(1, (Date.now() - t0) / ms);
    const e = 1 - (1 - k) * (1 - k);
    driver.set([
      from[0] + (to[0] - from[0]) * e,
      from[1] + (to[1] - from[1]) * e,
      from[2] + (to[2] - from[2]) * e,
    ]);
    if (k < 1) requestAnimationFrame(step);
    else onDone?.();
  };
  requestAnimationFrame(step);
}

/** Ease-out tween of a cluster driver's offset (JS-thread rAF). */
export function animateClusterDriver(
  driver: ClusterDriver,
  to: Float3,
  ms: number,
  onDone?: () => void,
) {
  const from: Float3 = [...driver.value];
  const t0 = Date.now();
  const step = () => {
    const k = Math.min(1, (Date.now() - t0) / ms);
    const e = 1 - (1 - k) * (1 - k);
    driver.set([
      from[0] + (to[0] - from[0]) * e,
      from[1] + (to[1] - from[1]) * e,
      from[2] + (to[2] - from[2]) * e,
    ]);
    if (k < 1) requestAnimationFrame(step);
    else onDone?.();
  };
  requestAnimationFrame(step);
}
