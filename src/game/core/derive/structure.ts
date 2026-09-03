// The GENERATION-TIME composition of a furniture's structure: the authored overlay with its JOINTS lowered in and its FASTENERS' role facts landed on every instance — what derive-structure.mts writes to structure.gen.ts, and therefore the ONLY thing applyStructure spreads over the mesh facts on device. Everything a human authors as an entity (a joint, a hardware group) is flattened here, once, offline, and validated with named errors; the device never lowers anything.
import type { FastenerMap, JointGeometry, PartDef, PartId } from "@/src/game/core/type";
import { applyStructure, type StructureOverlay } from "../model/liaisons";
import { fastenerFacts, withFastenerFacts } from "./fasteners";
import { lowerJoints, mergeOverlays, type JointDef } from "./joints";

export interface StructureInputs {
  joints?: readonly JointDef[];
  /** The generated travel table (joints.gen.ts), consulted for any joint that does not override it. Without `joints` it does nothing. */
  geometry?: JointGeometry;
  fasteners?: FastenerMap;
}

/** Compose against the RAW parts: the bridged-pair rule in joint lowering looks for a fastener that already names both endpoints, and a RE-TYPED one (EKET's suspCap) only becomes a fastener once the overlay is applied. Fastener facts are then lowered against the parts WITH joints and overlay applied, so a re-typed instance is a fastener by the time its def is checked and a connector's liaison is checked against the joins the joints actually emitted. */
export function composeStructure(raw: Record<PartId, PartDef>, overlay: StructureOverlay, inputs: StructureInputs = {}): StructureOverlay {
  const merged = inputs.joints?.length ? mergeOverlays(lowerJoints(inputs.joints, raw, inputs.geometry), overlay) : overlay;
  if (!inputs.fasteners) return merged;
  return withFastenerFacts(merged, fastenerFacts(inputs.fasteners, applyStructure(raw, merged)));
}
