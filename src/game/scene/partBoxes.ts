import type { PartBox, PartId } from "@/src/game/core/type";

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
  return { min, max };
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
): { min: PartBox["min"]; max: PartBox["max"]; pid: string }[] {
  const out: { min: PartBox["min"]; max: PartBox["max"]; pid: string }[] = [];
  for (const pid of placedIds) {
    const bx = live ? live[pid] : baked[pid];
    if (bx) out.push({ min: bx.min, max: bx.max, pid });
  }
  return out;
}
