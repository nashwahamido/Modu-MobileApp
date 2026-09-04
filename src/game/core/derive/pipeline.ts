// The GENERATION passes as functions, so the helper script that WRITES an artifact and the pin test that RECOMPUTES it feed the derivation identical inputs.
// Nothing here touches the disk or the GLB — callers hand in boxes, triangles and the hardware table, keeping core free of content/ imports.
import { composeFurnitureActions } from "../composition/composeActions";
import { buildComponents } from "../model/components";
import { applyStructure, buildLiaisons, type StructureOverlay } from "../model/liaisons";
import { buildSweepMap, type SweepMember } from "../model/sweep";
import type {
  ClusterDef,
  ClusterId,
  ComponentMap,
  DraftAction,
  DriveMotion,
  FastenerMap,
  GroupId,
  PartBox,
  PartDef,
  PartId,
  SweepMap,
  ToolId,
  Vec3,
} from "@/src/game/core/type";
import type { JointDef } from "./joints";
import { deriveJointGeometry, statementsFor } from "./jointGeometry";
import { composeStructure } from "./structure";

/** A furniture's authored.ts as the generators read it. Everything but STRUCTURE is optional so a half-authored furniture still reaches the derivation. */
export interface AuthoredModule {
  STRUCTURE: StructureOverlay;
  AUTHORED_ACTIONS: readonly DraftAction[];
  FASTENERS: FastenerMap;
  CLUSTERS?: Record<ClusterId, ClusterDef>;
  COMPONENTS?: ComponentMap;
  JOINTS?: readonly JointDef[];
}

export type HardwareTable = Partial<Record<GroupId, { tool: ToolId; motion?: DriveMotion }>>;

type Parts = Record<PartId, PartDef>;

/** The parts the SWEEP pass reasons over: joints lowered for their `approach.back`, which bounds the travel span swept, and nothing else.
 * Deliberately NOT the fastener facts and NOT joints.gen — the sweep runs before both, so the two generators cannot deadlock over each other's output. */
export function partsForSweep(raw: Parts, mod: Pick<AuthoredModule, "STRUCTURE" | "JOINTS">): Parts {
  return applyStructure(raw, composeStructure(raw, mod.STRUCTURE, { joints: mod.JOINTS }));
}

/** The parts the JOINT-GEOMETRY pass reasons over: joints lowered for TOPOLOGY only, since a migrated part's edges live in JOINTS and without them every derivation abstains with "no contact frame".
 * Passing no geometry is what keeps this non-circular — Γ needs only the join arrays, and the vectors are what the pass is about to compute.
 * FASTENERS ride along because the hardware rule asks isConnector, which reads the lowered role. */
export function partsForGeometry(raw: Parts, mod: AuthoredModule): Parts {
  return applyStructure(raw, composeStructure(raw, mod.STRUCTURE, { joints: mod.JOINTS, fasteners: mod.FASTENERS }));
}

/** Boxes rekeyed from GLB node name to part id. A part with no mesh gets no box and the derivation abstains for it. */
export function boxesByPart(parts: Parts, named: Record<string, PartBox>): Record<PartId, PartBox> {
  const out: Record<PartId, PartBox> = {};
  for (const p of Object.values(parts)) {
    const b = named[p.meshName as string];
    if (b) out[p.partId] = b;
  }
  return out;
}

/** The canonical build order — the sign rule asks whether a corridor blocker is already standing when this part arrives, which needs it. */
export function placeOrderOf(parts: Parts, mod: AuthoredModule, hardware: HardwareTable): Map<PartId, number> {
  const order = new Map<PartId, number>();
  composeFurnitureActions(mod.AUTHORED_ACTIONS, mod.FASTENERS, parts, hardware, mod.CLUSTERS).forEach((a, i) => {
    if (a.type === "placePart" && a.partId) order.set(a.partId, i);
  });
  return order;
}

/** The whole sweep pass: structural parts grouped by cluster, each cluster swept alone. `tris` is keyed by part id; a part with none is skipped. */
export function sweepFurniture(parts: Parts, tris: ReadonlyMap<string, SweepMember["tris"]>): SweepMap {
  const clusters = new Map<string, SweepMember[]>();
  for (const p of Object.values(parts)) {
    if (p.type !== "structural" || !tris.has(p.partId)) continue;
    const member: SweepMember = { partId: p.partId, tris: tris.get(p.partId)!, ...(p.parkBackoff !== undefined ? { parkBackoff: p.parkBackoff } : {}) };
    (clusters.get(p.cluster as string) ?? clusters.set(p.cluster as string, []).get(p.cluster as string)!).push(member);
  }
  const sweep: SweepMap = {} as SweepMap;
  for (const members of clusters.values()) Object.assign(sweep, buildSweepMap(members));
  return sweep;
}

/** The whole joint-geometry pass: raw parts and authored module in, travel table and explanatory notes out.
 * `named` is the GLB's boxes by node name; `sweep` is the already-generated sweep.gen. */
export function deriveFurnitureGeometry(
  raw: Parts,
  mod: AuthoredModule,
  named: Record<string, PartBox>,
  sweep: SweepMap,
  hardware: HardwareTable,
) {
  const parts = partsForGeometry(raw, mod);
  const liaisons = buildLiaisons(parts);
  const boxes = boxesByPart(parts, named);
  const placeOrder = placeOrderOf(parts, mod, hardware);
  const statements = statementsFor(parts, liaisons, buildComponents(mod.COMPONENTS, parts), mod.JOINTS);
  return { parts, liaisons, placeOrder, ...deriveJointGeometry(parts, liaisons, boxes, sweep, statements, placeOrder) };
}

/** A part's authored travel, where it has one. The generator scores against these and the pins check no derivation contradicts one, so both widen here together. */
export const authoredPlaceDir = (p: PartDef): Vec3 | undefined => (p as PartDef & { placeDir?: Vec3 }).placeDir;
