import type { Entity, TransformManager } from 'react-native-filament';
import { quatFromAxisAngle, quatMultiply, quatRotateVec3, quatToAxisAngle } from '@/src/game/core/geometry/math';
import type { Quat, Vec3 } from '@/src/game/core/type';

type Float3 = [number, number, number];

interface Base {
  position: Float3;
  rotation: Quat;
}

export interface OffsetDriver {
  attach(tm: TransformManager, entity: Entity, initial: Float3, base: Base): void;
  set(offset: Float3): void;
  setRotation(rotation: Quat): void;
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

export interface ClusterDriver {
  register(tm: TransformManager, entity: Entity, base: Base): () => void;
  set(offset: Float3): void;
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
    aa: ReturnType<typeof quatToAxisAngle>;
  }
  const members = new Set<Member>();

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

export interface DriverRegistry {
  get(id: string): ClusterDriver;
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
