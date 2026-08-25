import type { Entity, TransformManager } from 'react-native-filament';
import { quatFromAxisAngle, quatMultiply, quatRotateVec3, quatToAxisAngle } from '@/src/game/core/geometry/math';
import type { Quat, Vec3 } from '@/src/game/core/type';

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
  /** Set offset AND rotation together in a single apply — the drag hot path calls this every frame, where separate set+setRotation would push the entity's transform twice. */
  setPose(offset: Float3, rotation: Quat): void;
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
    setPose(nextOffset, nextRotation) {
      offset = [...nextOffset];
      rotation = nextRotation;
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
  /** Offset PLUS a rigid spin of the whole cluster: every member orbits the axis line through the members' shared centroid by `angleRad` (its own orientation turning with it) — the screwing motion of a threaded combine. A plain `set` clears the spin. */
  setSpin(offset: Float3, axis: Vec3, angleRad: number): void;
  readonly value: Float3;
}

export function createClusterDriver(): ClusterDriver {
  let offset: Float3 = [0, 0, 0];
  let spin: { axis: Vec3; angleRad: number } | null = null;
  interface Member {
    tm: TransformManager;
    entity: Entity;
    base: Base;
    /** Baked rotation as axis-angle, computed ONCE at register — it never changes, and recomputing it per member per frame was pure waste on the drag hot path. */
    aa: ReturnType<typeof quatToAxisAngle>;
  }
  const members = new Set<Member>();

  // Spin pivot: the axis line runs through the members' shared centroid (a screwing cluster is built around its thread axis, so the centroid sits on it); the y component is irrelevant to a rotation about that vertical line but harmless.
  const centroid = (): Float3 => {
    const c: Float3 = [0, 0, 0];
    for (const m of members) {
      c[0] += m.base.position[0] / members.size;
      c[1] += m.base.position[1] / members.size;
      c[2] += m.base.position[2] / members.size;
    }
    return c;
  };

  const applyOne = (m: Member, q: Quat | null, pivot: Float3 | null) => {
    if (q && pivot) {
      const r = quatRotateVec3(q, [
        m.base.position[0] - pivot[0],
        m.base.position[1] - pivot[1],
        m.base.position[2] - pivot[2],
      ]);
      const pos: Float3 = [
        pivot[0] + r[0] + offset[0],
        pivot[1] + r[1] + offset[1],
        pivot[2] + r[2] + offset[2],
      ];
      const aa = quatToAxisAngle(quatMultiply(q, m.base.rotation));
      if (!aa) {
        m.tm.setEntityPosition(m.entity, pos, false);
        return;
      }
      m.tm.setEntityRotation(m.entity, aa.angleRad, aa.axis, false);
      m.tm.setEntityPosition(m.entity, pos, true);
      return;
    }
    const pos: Float3 = [
      m.base.position[0] + offset[0],
      m.base.position[1] + offset[1],
      m.base.position[2] + offset[2],
    ];
    if (!m.aa) {
      m.tm.setEntityPosition(m.entity, pos, false);
      return;
    }
    m.tm.setEntityRotation(m.entity, m.aa.angleRad, m.aa.axis, false);
    m.tm.setEntityPosition(m.entity, pos, true);
  };

  // IMMEDIATE, exactly like OffsetDriver: the caller's frame is the frame the entities move on.
  //
  // This used to hop through a requestAnimationFrame to coalesce a 120 Hz pan down to one apply per
  // frame, because ~60 members × 2 native calls per touch sample made the cluster CARRY crawl. The
  // carry does not come through here any more — it writes one shared value and Filament's own render
  // callback moves the entities (scene/CombineCarry) — so the coalescer was left protecting nothing
  // and charging a frame of latency to the gestures that DO still use this: the combine drives
  // (SlideControl / ScrewControl) and the push-open groups, all under ~10 members. That latency is
  // the whole difference between this and a fastener tighten, which drives its one entity straight
  // from the touch handler and reads as glued to the finger. If a genuinely big group ever needs
  // driving from JS again, the answer is the render-thread pattern the carry already uses, not a
  // deferral that makes every small drive feel dragged.
  const apply = () => {
    if (members.size === 0) return;
    const q = spin && Math.abs(spin.angleRad) > 1e-6 ? quatFromAxisAngle(spin.axis, spin.angleRad) : null;
    const pivot = q ? centroid() : null;
    for (const m of members) applyOne(m, q, pivot);
  };

  return {
    register(tm, entity, base) {
      const m: Member = { tm, entity, base, aa: quatToAxisAngle(base.rotation) };
      members.add(m);
      applyOne(m, null, null);
      return () => members.delete(m);
    },
    set(next) {
      offset = [...next];
      spin = null;
      apply();
    },
    setSpin(next, axis, angleRad) {
      offset = [...next];
      spin = { axis, angleRad };
      apply();
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

/** A lazily-populated map of ClusterDrivers, so independent moving groups (each parked stage, or each telescoping push-open group) can be staged and animated separately in the shared scene. */
export interface DriverRegistry {
  /** The driver for `id`, created on first access. */
  get(id: string): ClusterDriver;
  /** Ids that have a driver so far. */
  ids(): string[];
}

export function createDriverRegistry(): DriverRegistry {
  const map = new Map<string, ClusterDriver>();
  return {
    get(id) {
      let d = map.get(id);
      if (!d) {
        d = createClusterDriver();
        map.set(id, d);
      }
      return d;
    },
    ids() {
      return [...map.keys()];
    },
  };
}
