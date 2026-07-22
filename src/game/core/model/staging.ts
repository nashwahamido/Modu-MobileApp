import { insertId, placeId, stageId } from "@/src/game/core/ids";
import type {
  ActionId,
  Furniture,
  PartDef,
  PartId,
  Vec3,
} from "@/src/game/core/type";
import { isNonLeadBody } from "./components";

type Parts = Record<PartId, PartDef>;

/**
 * A STAGED part is one the player pulls out to a rest pose away from its seat, fits hardware to there, and installs as a finished sub-assembly (the EKET stabiliser rod: a dowel pressed into each end, then the whole bridge dropped between the runner frames and the dowels rotated home).
 *
 * Nothing about a staged group is authored as a list. `stageOffset` on the carrier is the only switch; membership, sequencing and the scene's riding set are all derived from `attached` + action state, so they can never drift out of sync with Γ.
 */
export const isStaged = (p: PartDef | undefined): boolean => !!p?.stageOffset;

/** The staged part a fastener is fitted INTO, if any — the first of its `attached` endpoints that is itself staged. A fastener bridging two staged parts is an authoring error (validateFurniture rejects it), so "first" is unambiguous in valid data. */
export function stagedCarrierOf(
  p: PartDef,
  parts: Parts,
): PartId | undefined {
  if (p.type !== "fastener") return undefined;
  return (p.attached ?? []).find((t) => isStaged(parts[t]));
}

/** Every fastener fitted into `carrier`, in parts order. */
export function hardwareOn(parts: Parts, carrier: PartId): PartId[] {
  return Object.values(parts)
    .filter((p) => stagedCarrierOf(p, parts) === carrier)
    .map((p) => p.partId);
}

/** Every part id in `carrier`'s staged group, whether or not it is out yet: the carrier, its component siblings if it leads one, and all hardware fitted into it. */
export function stagedGroupOf(f: Furniture, carrier: PartId): PartId[] {
  const bodies = f.components?.byBody[carrier]
    ? [...(f.components.bodies[f.components.byBody[carrier]] ?? [])]
    : [carrier];
  return [...bodies, ...hardwareOn(f.parts, carrier)];
}

/** The parts CURRENTLY resting at `carrier`'s staging offset — the carrier's bodies once it is staged, plus each piece of hardware that has actually been fitted. Empty once the group is seated (or before it is taken out), which is what makes undo of the seating gesture restore the group with no special case. */
export function stagedMembers(
  f: Furniture,
  carrier: PartId,
  done: ReadonlySet<ActionId>,
): PartId[] {
  if (!done.has(stageId(carrier)) || done.has(placeId(carrier))) return [];
  return stagedGroupOf(f, carrier).filter(
    (p) => p === carrier || done.has(insertId(p)) || isNonLeadBody(f.components, p),
  );
}

/** The staged carrier a part currently belongs to, if it is out right now. Drives the scene's shared-offset driver and the drag layer's riding set. */
export function stagedCarrierFor(
  f: Furniture,
  partId: PartId,
  done: ReadonlySet<ActionId>,
): PartId | undefined {
  for (const p of Object.values(f.parts)) {
    if (!isStaged(p)) continue;
    if (stagedMembers(f, p.partId, done).includes(partId)) return p.partId;
  }
  return undefined;
}

/** Ids of every staged carrier in a furniture. */
export function stagedCarriers(parts: Parts): PartId[] {
  return Object.values(parts).filter(isStaged).map((p) => p.partId);
}

/** Every part that can ever rest at a staging offset → the offset it rests at. Static (it depends only on authoring, not on progress), so the scene can build it once and hand each part its resting offset without knowing which group it belongs to. */
export function stageOffsetMap(parts: Parts): Record<PartId, Vec3> {
  const out: Record<PartId, Vec3> = {};
  for (const carrier of stagedCarriers(parts)) {
    const offset = parts[carrier].stageOffset!;
    for (const member of [carrier, ...hardwareOn(parts, carrier)]) {
      out[member] = offset;
    }
  }
  return out;
}

/** How far a part's interaction pose is displaced because a sub-assembly is out of the furniture: the carrier's own `stageOffset`, or — for hardware fitted into a carrier — that same offset, so the dowel is pressed into the rod where the rod actually is. Undefined when nothing is displaced. Callers that act on an ACTION must still exempt `placePart`: seating the carrier is the journey home and aims at the real socket. Single source of truth on purpose — this number is consumed by both the drop target (scene/targets.ts) and the ghost (scene/PartModel.tsx), and when they computed it separately they disagreed. */
export function stageShiftFor(p: PartDef, parts: Parts): Vec3 | undefined {
  if (p.stageOffset) return p.stageOffset;
  const carrier = stagedCarrierOf(p, parts);
  return carrier ? parts[carrier]?.stageOffset : undefined;
}
