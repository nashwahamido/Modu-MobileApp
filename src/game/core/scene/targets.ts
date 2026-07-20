import {
  ActionId,
  AssemblyAction,
  GroupId,
  PartDef,
  PartId,
  Quat,
  Vec3,
} from "@/src/game/core/type";
import { loosePosition } from "@/src/game/core/geometry/fastenerPose";
import { engageAxis } from "../evaluation/engagement";
import { stageShiftFor } from "../model/staging";

type Parts = Record<PartId, PartDef>;

/** All parts in a group, in stable partId order. */
export function groupParts(parts: Parts, group: GroupId): PartDef[] {
  return Object.values(parts)
    .filter((p) => p.group === group)
    .sort((a, b) => a.partId.localeCompare(b.partId));
}

export interface PartActionIds {
  snap?: ActionId;
  insert?: ActionId;
  tighten?: ActionId;
}

/** Map each part to the action ids that touch it. */
export function buildPartActions(
  actions: readonly AssemblyAction[],
): Record<PartId, PartActionIds> {
  const out: Record<PartId, PartActionIds> = {};
  for (const a of actions) {
    if (!a.partId) continue;
    const e = (out[a.partId] ??= {});
    if (a.type === "placePart" || a.type === "combineClusters") e.snap = a.actionId;
    else if (a.type === "insertFastener") e.insert = a.actionId;
    else if (a.type === "tightenFastener") e.tighten = a.actionId;
  }
  return out;
}

/** Earliest stage each part appears in (its snap/insert stage). */
export function buildPartStage(
  actions: readonly AssemblyAction[],
): Record<PartId, number> {
  const out: Record<PartId, number> = {};
  for (const a of actions) {
    if (!a.partId) continue;
    if (out[a.partId] === undefined || a.stage < out[a.partId]) {
      out[a.partId] = a.stage;
    }
  }
  return out;
}

/** World drop target for a snap/insert action: the baked pose, or — for a hand-inserted fastener — the loose pose backed out along its engage axis. Pass `done` so the axis is SIGNED by the engaged endpoint (reverse path: a bolt entering the LEG backs out of the opposite side). */
export function targetPositionForAction(
  action: AssemblyAction,
  parts: Parts,
  done?: ReadonlySet<ActionId>,
): Vec3 {
  const part = parts[action.partId!];
  const shift = stagingShiftFor(action, parts);
  if (action.type !== "insertFastener") {
    return shift ? add3(part.pose.position, shift) : part.pose.position;
  }
  const axis = done ? engageAxis(part, done) : (part.engageDir ?? [0, 0, 0]);
  const loose = loosePosition(part.pose, axis);
  return shift ? add3(loose, shift) : loose;
}

const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** How far this action's drop target moves because a sub-assembly is out of the furniture. Delegates the displacement itself to model/staging.ts so the ghost and this target cannot drift apart; the only thing decided here is the ACTION-level exemption — seating the finished sub-assembly aims at the real socket, because that gesture is precisely the journey home. */
function stagingShiftFor(action: AssemblyAction, parts: Parts): Vec3 | undefined {
  if (action.type === "placePart" || !action.partId) return undefined;
  const part = parts[action.partId];
  return part ? stageShiftFor(part, parts) : undefined;
}

export function targetRotationForAction(
  action: AssemblyAction,
  parts: Parts,
): Quat {
  return parts[action.partId!].pose.rotation;
}

export interface GroupCandidate {
  action: AssemblyAction;
  position: Vec3;
  rotation: Quat;
  visualPosition: Vec3;
}

/** Every currently-available socket interchangeable with the picked representative: same action type and same part GROUP (e.g. all open leg sockets). Lets the player drop a grouped part on whichever match is nearest, not just the one the tray card happened to reference. */
export function groupCandidates(
  avail: readonly AssemblyAction[],
  rep: AssemblyAction,
  parts: Parts,
  done?: ReadonlySet<ActionId>,
): GroupCandidate[] {
  const repGroup = parts[rep.partId!].group;
  return avail
    .filter(
      (a) => a.type === rep.type && a.partId && parts[a.partId].group === repGroup,
    )
    .map((a) => {
      const part = parts[a.partId!];
      const position = targetPositionForAction(a, parts, done);
      const visualOffset = part.visualCenterOffset ?? [0, 0, 0];
      return {
        action: a,
        position,
        rotation: targetRotationForAction(a, parts),
        visualPosition: [
          position[0] + visualOffset[0],
          position[1] + visualOffset[1],
          position[2] + visualOffset[2],
        ],
      };
    });
}
