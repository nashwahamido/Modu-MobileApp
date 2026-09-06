import { PartDef, PartPose, Vec3 } from "@/src/game/core/type";
import { LOOSE_OFFSET_M } from "./fastenerPose";

// Where a part materializes (XZ) when picked up from the tray, world meters.
export const SPAWN_POS: Vec3 = [0.28, 0, 0.15];

// Hover lift applied to a held part so it floats above the work area.
export const HOVER_LIFT_M = 0.06;

// Offset from a part's baked pose to the spawn point at the work-plane height.
export function spawnDelta(pose: PartPose, planeY: number): Vec3 {
  return [
    SPAWN_POS[0] - pose.position[0],
    planeY - pose.position[1],
    SPAWN_POS[2] - pose.position[2],
  ];
}

// Offset of a fastener's loose pose from its baked one. Pass the SIGNED axis when the engaged endpoint matters — in the reverse path the bolt backs out of the opposite side.
export function looseDelta(
  part: PartDef,
  axis: Vec3 = part.engageDir ?? [0, 0, 0],
): Vec3 {
  // A `drawTurn` dowel rests RETRACTED into its carrier and the tighten DRAWS it out to flush — the reverse of a normal fastener's proud loose pose.
  // Uses the baked engageDir, not the signed `axis`, so the draw direction is geometry-fixed however the caller signed it.
  if (part.insertRetract) {
    const e = part.engageDir ?? [0, 0, 0];
    const r = -part.insertRetract;
    return [e[0] * r, e[1] * r, e[2] * r];
  }
  // insertProud 0 = the insert lands FLUSH and the tighten works in place (cam locks); ?? keeps the explicit zero.
  const proud = part.insertProud ?? LOOSE_OFFSET_M;
  return [axis[0] * proud || 0, axis[1] * proud || 0, axis[2] * proud || 0];
}

// Delta from a fastener's baked pose to its STAGE pose, fully OUTSIDE the hole. Only meaningful for 3-phase fasteners, [0,0,0] otherwise.
// The press insert then drives stage → loose, and the tighten loose → flush.
export function stageDelta(part: PartDef): Vec3 {
  if (!part.insertStage) return [0, 0, 0];
  const e = part.engageDir ?? [0, 0, 0];
  const s = part.insertStage;
  return [e[0] * s, e[1] * s, e[2] * s];
}

// Camera pivot for a set of parts: the centre of their structural bounding box, over each part's VISUAL centre — an origin can sit at one end of its mesh (a LACK leg's foot), and centring on origins makes a lone first part look off-centre.
// Fasteners are ignored where structural parts exist, so cluster orbit stays on the furniture body rather than surrounding screw heads.
export function clusterPivot(parts: readonly PartDef[]): Vec3 {
  const structural = parts.filter((part) => part.type !== "fastener");
  const pivotParts = structural.length ? structural : parts;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const part of pivotParts) {
    const off = part.visualCenterOffset ?? [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const v = part.pose.position[i] + off[i];
      if (v < min[i]) min[i] = v;
      if (v > max[i]) max[i] = v;
    }
  }
  if (!pivotParts.length) return [0, 0, 0];
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
}
