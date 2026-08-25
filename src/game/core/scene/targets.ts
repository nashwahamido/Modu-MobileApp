import {
  ActionId,
  AssemblyAction,
  GroupId,
  PartBox,
  PartDef,
  PartId,
  Quat,
  Vec3,
} from "@/src/game/core/type";
import { rayBoxInterval, type BoxLike } from "@/src/game/core/geometry/obb";
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

/** How far this action's drop target moves because a sub-assembly is out of the furniture. Delegates the displacement itself to model/staging.ts so the ghost and this target cannot drift apart; the only thing decided here is the ACTION-level exemption — seating the finished sub-assembly aims at the real socket, because that gesture is precisely the journey home. Exported for the drag layer's seatVisual: the visibility gate must measure the hole where the part is actually DELIVERED, and when it built the seat from the raw baked pose alone the gate judged a spot 5cm from the staged socket (EKET stabiliser rod). */
export function stagingShiftFor(action: AssemblyAction, parts: Parts): Vec3 | undefined {
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

/** Offset from a part's baked origin to the point the VISIBILITY gate judges — the hole the player can actually see. A structural part's is its joint anchor (the contact slab), falling back to the visual centre. A fastener never gets a joint anchor — frames are per liaison, and a fastener realises a liaison rather than ending one — so it used to fall through to its visual centre, which for a screw is mid-SHAFT: the gate then asked whether a point buried half a screw-length in the wood was visible, and the answer was decided by screw length, not viewpoint (EKET's 13mm runner screw passed, its 41mm drawer-back screw was blocked from all 72 sweep cameras, looking straight at the head included). The mouth is where the shaft axis leaves the fastener's own box on the HEAD side — along the signed engage axis, which in this codebase is the WITHDRAWAL direction (the stage pose is +engageDir·insertStage, "fully out of the hole"), so it already points out toward the head; signing it by the placed endpoint puts a connector's mouth on whichever side it enters from. An authored jointAnchor still wins outright. Measured on EKET's drawer-back screw (box x −125…−83.5, origin −104.3, engageDir −x): the head sits at −125, the withdrawal end, and the −axis end was the tip 20.7mm inside the drawer side. */
export function seatOffsetFor(
  part: PartDef | undefined,
  box: PartBox | undefined,
  anchors?: Record<PartId, Vec3>,
  done?: ReadonlySet<ActionId>,
  receivers: readonly BoxLike[] = [],
  travel?: Vec3 | null,
): Vec3 {
  const anchored = part && anchors?.[part.partId];
  if (anchored) {
    // A structural part's joint anchor is the CENTRE of its contact slab — for a slider or press that is a point inside the receiver (DALFRED's support pin: 10.5mm into the 21mm plate, the middle of the hole), which no camera can see except straight down the bore. The hole the player sees is where the approach axis leaves the receiver, so the anchor is pushed back along −travel until it exits every placed box that contains it. `travel` is the ORDER-ADAPTED direction when the caller has one (engagement.adaptedTravelDir — EKET's back panel enters from opposite sides in the two legal orders, and the visible hole is on whichever side is open), else the authored placeDir. Parts with neither (drops) keep the slab centre; their burial is the slab's own thin half-width.
    const seat: Vec3 = [part.pose.position[0] + anchored[0], part.pose.position[1] + anchored[1], part.pose.position[2] + anchored[2]];
    const pd = travel ?? part.placeDir;
    const pl = pd ? Math.hypot(pd[0], pd[1], pd[2]) : 0;
    if (pd && pl > 0) {
      const back: Vec3 = [-pd[0] / pl, -pd[1] / pl, -pd[2] / pl];
      let out = 0;
      for (const r of receivers) {
        const iv = rayBoxInterval(r, seat, back, -Infinity, Infinity);
        if (iv && iv.lo < 0 && iv.hi > out) out = iv.hi;
      }
      return [anchored[0] + back[0] * out, anchored[1] + back[1] * out, anchored[2] + back[2] * out];
    }
    return [anchored[0], anchored[1], anchored[2]];
  }
  if (part?.type === "fastener" && box) {
    const axis = done ? engageAxis(part, done) : (part.engageDir ?? [0, 0, 0]);
    const len = Math.hypot(axis[0], axis[1], axis[2]);
    if (len > 0) {
      const u: Vec3 = [axis[0] / len, axis[1] / len, axis[2] / len];
      // Ray-box exit from the origin along +axis (withdrawal): the first face of the fastener's aligned∩oriented box the head-side ray leaves through, i.e. the shaft's mouth — so a tilted screw's mouth is found along its real shaft rather than its world-aligned slab.
      const iv = rayBoxInterval(box, part.pose.position, u, -Infinity, Infinity);
      const t = iv?.hi ?? NaN;
      if (Number.isFinite(t) && t > 0) return [u[0] * t, u[1] * t, u[2] * t];
    }
  }
  const vco = part?.visualCenterOffset ?? [0, 0, 0];
  return [vco[0], vco[1], vco[2]];
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
