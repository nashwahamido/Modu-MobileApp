import {
  ActionId,
  AssemblyAction,
  GroupId,
  PartDef,
  PartId,
  Quat,
  Vec3,
} from "@/src/game/core/type";
import { looseDelta, stageDelta } from "@/src/game/core/geometry/staging";
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
  if (action.type === "placeFastener") {
    // 3-phase drop lands at the STAGE pose (fully out of the hole, +engageDir·insertStage); the press insert then drives it to loose.
    const staged = add3(part.pose.position, stageDelta(part));
    return shift ? add3(staged, shift) : staged;
  }
  if (action.type !== "insertFastener") {
    return shift ? add3(part.pose.position, shift) : part.pose.position;
  }
  const axis = done ? engageAxis(part, done) : (part.engageDir ?? [0, 0, 0]);
  // for a `drawTurn` dowel this is the RETRACTED-into-carrier pose; for a normal fastener it's the proud loose pose — looseDelta owns the sign.
  const loose = add3(part.pose.position, looseDelta(part, axis));
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

/** A lengthy part is held NEAR ITS SNAP ORIGIN, not at its visual center: the finger should own the end that engages the socket (a DALFRED leg's foot), not the middle of the shaft 27cm away from it. Parts whose center offset exceeds the trigger get their hold point clamped to HOLD_CLAMP_M from the origin along the same direction; everything shorter keeps the exact visual-center feel. The trigger sits above the clamp so mid-size parts aren't nudged by a few mm for nothing. */
const HOLD_CLAMP_TRIGGER_M = 0.12;
const HOLD_CLAMP_M = 0.08;

/** Offset from a part's snap origin to the point the FINGER controls while dragging it. Both sides of the match must use this — the held part's pin (usePartDrag's grabOffset) and the candidates' hold points below — or the fit would measure fingertip against mid-shaft. A derived JOINT anchor wins when one exists: the clamp below assumes the node origin sits at the joint, and measured on LACK and DALFRED it does not — the origin is the leg's FOOT, leaving the clamped point 32-35cm from the joint it is being aimed into, further away than the unclamped visual center. The clamp stays as the fallback for parts with no frame (every fastener, whose visual center is within 3cm of its joint anyway). */
export function holdOffsetFor(part: PartDef | undefined, anchors?: Record<PartId, Vec3>): Vec3 {
  const anchored = part && anchors?.[part.partId];
  // Copied, not returned by reference: every other path here hands back a fresh array, and an alias into the caller's anchor map is a trap the next mutation-shaped edit would spring.
  if (anchored) return [anchored[0], anchored[1], anchored[2]];
  const vco = part?.visualCenterOffset ?? [0, 0, 0];
  const len = Math.hypot(vco[0], vco[1], vco[2]);
  if (len <= HOLD_CLAMP_TRIGGER_M) return vco;
  const k = HOLD_CLAMP_M / len;
  return [vco[0] * k, vco[1] * k, vco[2] * k];
}

export interface GroupCandidate {
  action: AssemblyAction;
  position: Vec3;
  rotation: Quat;
  /** position + holdOffsetFor(part) — where the finger must aim to seat this candidate. */
  holdPosition: Vec3;
}

/** Every currently-available socket interchangeable with the picked representative: same action type and same part GROUP (e.g. all open leg sockets). Lets the player drop a grouped part on whichever match is nearest, not just the one the tray card happened to reference. */
export function groupCandidates(
  avail: readonly AssemblyAction[],
  rep: AssemblyAction,
  parts: Parts,
  done?: ReadonlySet<ActionId>,
  anchors?: Record<PartId, Vec3>,
): GroupCandidate[] {
  const repGroup = parts[rep.partId!].group;
  return avail
    .filter(
      (a) => a.type === rep.type && a.partId && parts[a.partId].group === repGroup,
    )
    .map((a) => {
      const part = parts[a.partId!];
      const position = targetPositionForAction(a, parts, done);
      const holdOffset = holdOffsetFor(part, anchors);
      return {
        action: a,
        position,
        rotation: targetRotationForAction(a, parts),
        holdPosition: [
          position[0] + holdOffset[0],
          position[1] + holdOffset[1],
          position[2] + holdOffset[2],
        ],
      };
    });
}
