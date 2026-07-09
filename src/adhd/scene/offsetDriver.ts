import type { Entity, TransformManager } from 'react-native-filament';

type Float3 = [number, number, number];

/**
 * Imperatively drives one entity's world-space offset from its baked pose by
 * applying translation deltas through filament's TransformManager.
 *
 * Plain JS arrays only — worklets-core 1.6 shared-value arrays arrive in
 * filament's native layer as objects and are rejected ("expected an array").
 */
export interface OffsetDriver {
  attach(tm: TransformManager, entity: Entity, initial: Float3): void;
  /** Move to a new offset (delta vs the current one is applied). */
  set(offset: Float3): void;
  detach(): void;
  readonly value: Float3;
}

export function createOffsetDriver(): OffsetDriver {
  let tm: TransformManager | null = null;
  let entity: Entity | null = null;
  let current: Float3 = [0, 0, 0];

  return {
    attach(t, e, initial) {
      tm = t;
      entity = e;
      current = [...initial];
      tm.setEntityPosition(e, initial, true);
    },
    set(offset) {
      if (!tm || !entity) {
        current = [...offset];
        return;
      }
      const delta: Float3 = [offset[0] - current[0], offset[1] - current[1], offset[2] - current[2]];
      if (delta[0] === 0 && delta[1] === 0 && delta[2] === 0) return;
      tm.setEntityPosition(entity, delta, true);
      current = [...offset];
    },
    detach() {
      tm = null;
      entity = null;
      current = [0, 0, 0];
    },
    get value() {
      return current;
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
