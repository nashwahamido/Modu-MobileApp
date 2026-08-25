import { quatRotateVec3 } from "@/src/game/core/geometry/math";
import type { PartBox, PartId, Quat, Vec3 } from "@/src/game/core/type";

/** Sweep a renderable's OBJECT-space AABB through a world transform. Filament hands the box back in object space and every mesh node in these GLBs carries a translation with most carrying a rotation, so the box means nothing to world-space geometry until it is pushed through. All EIGHT corners are swept and re-bounded — transforming only the centre would keep a rotated part's extent wrong, and the extent is what decides whether two parts overlap at all. `m` is filament's mat4f::asArray() — COLUMN-major, so the basis columns are m[0..2]/m[4..6]/m[8..10] and the translation is m[12..14]. */
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
  // The oriented box is the same object-space box carried through the transform WITHOUT re-bounding: each basis column's direction is an axis, its length scales that half-extent, and the centre is pushed through whole. Kept alongside min/max because the visibility gate needs the tight box and everything else the aligned one.
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

/**
 * The world matrix of a part's BAKED pose (column-major, filament's layout), composed from parts.gen alone — no node in the corpus carries scale (verified across all four GLBs; the extractor does not record one, so a scaled node would need parts.gen to bake it before this could stay pose-only).
 *
 * This exists because the load-time harvest must NOT read the transform manager: React runs child effects before parent effects, so PartModel's initial writes — a resumed build's loose fastener at its backed-off pose, a parked cluster, a staged carrier — land before AssemblyScene's harvest effect reads. Read live, those poses put a box centre >2mm from pose+visualCenterOffset, and the harvest's gate then rightly published NO boxes — for the whole session (measured: `boxes=0 reach=0.000` on a resumed DALFRED, seats falling back to mid-shaft visual centres, the ghost rule inert). The harvest's contract is baked-pose geometry by definition, so it composes the baked transform instead of asking the renderer what it happens to be drawing; the 2mm gate keeps its real job, catching mesh↔parts.gen drift after a re-export.
 */
export function bakedWorldMatrix(position: Vec3, rotation: Quat): number[] {
  const bx = quatRotateVec3(rotation, [1, 0, 0]);
  const by = quatRotateVec3(rotation, [0, 1, 0]);
  const bz = quatRotateVec3(rotation, [0, 0, 1]);
  return [bx[0], bx[1], bx[2], 0, by[0], by[1], by[2], 0, bz[0], bz[1], bz[2], 0, position[0], position[1], position[2], 1];
}

/** Answers, for each part asked about, where it is being DRAWN — and omits any part that is not on screen at all. Both halves matter: a part off at a staging offset has a box nowhere near its baked one, and a part the scene has hidden (another cluster's work while this one has focus) has a perfectly good baked transform behind an entity nobody is rendering. */
export type LiveBoxReader = (ids: readonly PartId[]) => Record<PartId, PartBox>;

let liveBoxReader: LiveBoxReader | null = null;

/** The scene registers its reader on model load and clears it on unload. A module singleton rather than store state on purpose: the reader is a native-bridge closure, not data, and putting it in the store would wake every subscriber on load for a value nobody renders. */
export function registerLiveBoxReader(reader: LiveBoxReader | null): void {
  liveBoxReader = reader;
}

/** Where these parts are RIGHT NOW, or null if no scene is mounted to ask. Null and empty mean different things and callers must keep them apart: null is "nobody knows", {} is "the scene knows, and none of them are on screen". */
export function readLiveBoxes(ids: readonly PartId[]): Record<PartId, PartBox> | null {
  return liveBoxReader ? liveBoxReader(ids) : null;
}

/**
 * The boxes that can hide a socket: every PLACED part the scene is actually drawing, at the pose it is drawn at.
 *
 * Live geometry is the whole point. The baked harvest is one snapshot of the ASSEMBLED furniture taken at model load, so it answers "where does this part belong" — a different question, and a dangerous stand-in. A placed part can be somewhere else entirely (a staged sub-assembly out on the bench, a cluster parked off-screen for the combine) or nowhere at all (hidden while another cluster has focus), and in every one of those cases its baked box sits across an assembly it is not in front of. EKET's phantom drawer front over the visibly open cabinet face was exactly this.
 *
 * So a part the reader omits is NOT an obstacle — the scene was asked and said it is not there. Baked boxes are used only when there is no reader at all (`live === null`, no scene mounted), where the alternative is an empty obstacle list and a gate that passes everything.
 */
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
