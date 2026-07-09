// Derived lookups the scene/drag layer reads: which actions touch each part,
// each part's earliest stage, and the world drop position/rotation for an
// action. Generic — every function takes a furniture's actions/parts.
import { AssemblyAction, PartDef, Quat, Vec3 } from "@/src/adhd/core/type";
import { loosePosition } from "@/src/adhd/core/geometry/fastenerPose";

type Parts = Record<string, PartDef>;

/** All parts in a group, in stable partId order. */
export function groupParts(parts: Parts, group: string): PartDef[] {
  return Object.values(parts)
    .filter((p) => p.group === group)
    .sort((a, b) => a.partId.localeCompare(b.partId));
}

export interface PartActionIds {
  snap?: string;
  insert?: string;
  tighten?: string;
}

/** Map each part to the action ids that touch it. */
export function buildPartActions(
  actions: readonly AssemblyAction[],
): Record<string, PartActionIds> {
  const out: Record<string, PartActionIds> = {};
  for (const a of actions) {
    if (!a.partId) continue;
    const e = (out[a.partId] ??= {});
    if (a.type === "snapPart" || a.type === "combine") e.snap = a.actionId;
    else if (a.type === "insertFastener") e.insert = a.actionId;
    else if (a.type === "tightenFastener") e.tighten = a.actionId;
  }
  return out;
}

/** Earliest stage each part appears in (its snap/insert stage). */
export function buildPartStage(
  actions: readonly AssemblyAction[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of actions) {
    if (!a.partId) continue;
    if (out[a.partId] === undefined || a.stage < out[a.partId]) {
      out[a.partId] = a.stage;
    }
  }
  return out;
}

/**
 * World drop target for a snap/insert action: the baked pose, or — for a
 * hand-inserted fastener — the loose pose backed out along its engage axis.
 */
export function targetPositionForAction(
  action: AssemblyAction,
  parts: Parts,
): Vec3 {
  const part = parts[action.partId!];
  if (action.type !== "insertFastener") return part.pose.position;
  return loosePosition(part.pose, part.engageDir ?? [0, 0, 0]);
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
}

/**
 * Every currently-available socket interchangeable with the picked
 * representative: same action type and same part GROUP (e.g. all open leg
 * sockets). Lets the player drop a grouped part on whichever match is nearest,
 * not just the one the tray card happened to reference.
 */
export function groupCandidates(
  avail: readonly AssemblyAction[],
  rep: AssemblyAction,
  parts: Parts,
): GroupCandidate[] {
  const repGroup = parts[rep.partId!].group;
  return avail
    .filter(
      (a) => a.type === rep.type && a.partId && parts[a.partId].group === repGroup,
    )
    .map((a) => ({
      action: a,
      position: targetPositionForAction(a, parts),
      rotation: targetRotationForAction(a, parts),
    }));
}
