// Generation-time composition: the authored overlay with JOINTS lowered in and FASTENERS role facts landed on every instance.
// This is what derive-structure.mts writes to structure.gen.ts and all applyStructure spreads on device — nothing lowers at runtime.
import type { FastenerMap, JointGeometry, PartDef, PartId } from "@/src/game/core/type";
import { applyStructure, type StructureOverlay } from "../model/liaisons";
import { fastenerFacts, withFastenerFacts } from "./fasteners";
import { lowerJoints, mergeOverlays, type JointDef } from "./joints";

export interface StructureInputs {
  joints?: readonly JointDef[];
  /** Generated travel table (joints.gen.ts), used by any joint that does not override it. Inert without `joints`. */
  geometry?: JointGeometry;
  fasteners?: FastenerMap;
}

/** Joints lower against RAW parts: their bridged-pair rule looks for a fastener naming both endpoints, and a re-typed one (EKET's suspCap) is only a fastener after the overlay applies.
 * Fastener facts lower against the parts WITH joints applied, so a def is checked against the joins the joints actually emitted. */
export function composeStructure(raw: Record<PartId, PartDef>, overlay: StructureOverlay, inputs: StructureInputs = {}): StructureOverlay {
  const merged = inputs.joints?.length ? mergeOverlays(lowerJoints(inputs.joints, raw, inputs.geometry), overlay) : overlay;
  if (!inputs.fasteners) return merged;
  return withFastenerFacts(merged, fastenerFacts(inputs.fasteners, applyStructure(raw, merged)));
}
