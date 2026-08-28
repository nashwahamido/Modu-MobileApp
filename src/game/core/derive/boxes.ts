// Per-part world bounds at baked pose, computed from the GLB instead of harvested from Filament at load.
// Same arithmetic the renderer used to do: object-space AABB swept through the part's baked pose. glTF requires
// min/max on every POSITION accessor, so the box is in the JSON chunk and the BIN never has to be decoded.
// Environment-neutral (DataView + TextDecoder), so the codegen script and the pin test share one definition.
import { bakedWorldMatrix, worldBoxFromObjectBox } from "@/src/game/scene/partBoxes";
import type { PartBox, PartDef, PartId, Vec3 } from "@/src/game/core/type";

/** A box centre this far from `pose + visualCenterOffset` means the mesh and parts.gen disagree — a re-export moved something. */
export const TOLERANCE_MM = 2;

/** Micrometre precision: enough for contact tests, and it keeps the generated files stable across machines. `|| 0` normalises -0, which serialises as `0` and would make a freshly derived box unequal to the file it just wrote. */
const round = (v: number): number => Math.round(v * 1e6) / 1e6 || 0;

function readJson(bytes: Uint8Array): {
  nodes?: { name?: string; mesh?: number }[];
  meshes?: { primitives?: { attributes?: Record<string, number> }[] }[];
  accessors?: { min?: number[]; max?: number[] }[];
} {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("not a GLB container");
  const jsonLen = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== 0x4e4f534a) throw new Error("GLB chunk 0 is not JSON");
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen)));
}

/** Every named mesh node's OBJECT-space bounds — what Filament's getAxisAlignedBoundingBox returns, read from the accessors it builds them from. */
export function objectBoxesByNode(bytes: Uint8Array): Record<string, { min: Vec3; max: Vec3 }> {
  const json = readJson(bytes);
  const out: Record<string, { min: Vec3; max: Vec3 }> = {};
  for (const node of json.nodes ?? []) {
    if (node.mesh === undefined || !node.name) continue;
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const prim of json.meshes?.[node.mesh]?.primitives ?? []) {
      const acc = json.accessors?.[prim.attributes?.POSITION ?? -1];
      if (!acc?.min || !acc?.max) continue;
      for (let k = 0; k < 3; k++) {
        if (acc.min[k] < min[k]) min[k] = acc.min[k];
        if (acc.max[k] > max[k]) max[k] = acc.max[k];
      }
    }
    if (min.every((v) => Number.isFinite(v))) out[node.name] = { min, max };
  }
  return out;
}

/** A part whose box centre is further than TOLERANCE_MM from where parts.gen says it sits. */
export interface BoxDrift {
  partId: string;
  mm: number;
}

/**
 * The boxes, plus every part that failed the tolerance check. Callers decide what a drift means:
 * the codegen script refuses to write, the pin test fails by name.
 * Parts with no mesh node are omitted rather than guessed — consumers already fall back per part.
 */
export function deriveBoxes(
  bytes: Uint8Array,
  parts: Record<PartId, PartDef>,
): { boxes: Record<PartId, PartBox>; drift: BoxDrift[] } {
  const objectBoxes = objectBoxesByNode(bytes);
  const boxes: Record<PartId, PartBox> = {};
  const drift: BoxDrift[] = [];

  for (const partId of Object.keys(parts).sort() as PartId[]) {
    const p = parts[partId];
    const ob = objectBoxes[p.meshName];
    if (!ob) continue;

    const center: Vec3 = [(ob.min[0] + ob.max[0]) / 2, (ob.min[1] + ob.max[1]) / 2, (ob.min[2] + ob.max[2]) / 2];
    const half: Vec3 = [(ob.max[0] - ob.min[0]) / 2, (ob.max[1] - ob.min[1]) / 2, (ob.max[2] - ob.min[2]) / 2];
    const { min, max } = worldBoxFromObjectBox(center, half, bakedWorldMatrix(p.pose.position, p.pose.rotation));
    boxes[partId] = {
      min: [round(min[0]), round(min[1]), round(min[2])],
      max: [round(max[0]), round(max[1]), round(max[2])],
    };

    const vco = p.visualCenterOffset ?? [0, 0, 0];
    const mm = Math.hypot(
      (min[0] + max[0]) / 2 - (p.pose.position[0] + vco[0]),
      (min[1] + max[1]) / 2 - (p.pose.position[1] + vco[1]),
      (min[2] + max[2]) / 2 - (p.pose.position[2] + vco[2]),
    ) * 1000;
    if (mm > TOLERANCE_MM) drift.push({ partId, mm });
  }
  return { boxes, drift };
}
