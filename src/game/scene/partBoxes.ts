import { quatRotateVec3 } from "@/src/game/core/geometry/math";
import type { PartBox, PartId, Quat, Vec3 } from "@/src/game/core/type";

export function worldBoxFromObjectBox(
  center: ArrayLike<number>,
  halfExtent: ArrayLike<number>,
  m: ArrayLike<number>,
): PartBox {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let c = 0; c < 8; c++) {
    const lx = center[0] + (c & 1 ? halfExtent[0] : -halfExtent[0]);
    const ly = center[1] + (c & 2 ? halfExtent[1] : -halfExtent[1]);
    const lz = center[2] + (c & 4 ? halfExtent[2] : -halfExtent[2]);
    const w: [number, number, number] = [
      m[0] * lx + m[4] * ly + m[8] * lz + m[12],
      m[1] * lx + m[5] * ly + m[9] * lz + m[13],
      m[2] * lx + m[6] * ly + m[10] * lz + m[14],
    ];
    for (let k = 0; k < 3; k++) {
      if (w[k] < min[k]) min[k] = w[k];
      if (w[k] > max[k]) max[k] = w[k];
    }
  }
  const axes: [[number, number, number], [number, number, number], [number, number, number]] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const half: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const cx = m[4 * k];
    const cy = m[4 * k + 1];
    const cz = m[4 * k + 2];
    const s = Math.hypot(cx, cy, cz) || 1;
    axes[k] = [cx / s, cy / s, cz / s];
    half[k] = halfExtent[k] * s;
  }
  const obbCenter: [number, number, number] = [
    m[0] * center[0] + m[4] * center[1] + m[8] * center[2] + m[12],
    m[1] * center[0] + m[5] * center[1] + m[9] * center[2] + m[13],
    m[2] * center[0] + m[6] * center[1] + m[10] * center[2] + m[14],
  ];
  return { min, max, obb: { center: obbCenter, axes, half } };
}

export function bakedWorldMatrix(position: Vec3, rotation: Quat): number[] {
  const bx = quatRotateVec3(rotation, [1, 0, 0]);
  const by = quatRotateVec3(rotation, [0, 1, 0]);
  const bz = quatRotateVec3(rotation, [0, 0, 1]);
  return [bx[0], bx[1], bx[2], 0, by[0], by[1], by[2], 0, bz[0], bz[1], bz[2], 0, position[0], position[1], position[2], 1];
}

export type LiveBoxReader = (
  ids: readonly PartId[],
) => Record<PartId, PartBox> | null;

let liveBoxReader: LiveBoxReader | null = null;

export function registerLiveBoxReader(reader: LiveBoxReader | null): void {
  liveBoxReader = reader;
}

export function readLiveBoxes(ids: readonly PartId[]): Record<PartId, PartBox> | null {
  return liveBoxReader ? liveBoxReader(ids) : null;
}

export function occluderBoxes(
  placedIds: Iterable<PartId>,
  live: Record<PartId, PartBox> | null,
  baked: Record<PartId, PartBox>,
): (PartBox & { pid: string })[] {
  const out: (PartBox & { pid: string })[] = [];
  for (const pid of placedIds) {
    const bx = live ? live[pid] : baked[pid];
    if (bx) out.push({ min: bx.min, max: bx.max, obb: bx.obb, pid });
  }
  return out;
}