import { ACTIONS, AssemblyAction, Stage } from './assembly';
import { PARTS, PartId } from './parts';
import { loosePosition } from './fastenerPose';
import { ENGAGE_DIR } from './fastenerAxes.gen';
import type { Vec3, Quat } from './math';

export interface PartActionIds {
  snap?: string;
  insert?: string;
  tighten?: string;
}

/** Lookup: which assembly actions touch each part. */
export const PART_ACTIONS: Partial<Record<PartId, PartActionIds>> = {};
for (const a of ACTIONS) {
  if (!a.partId) continue;
  const entry = (PART_ACTIONS[a.partId] ??= {});
  if (a.type === 'snapPart' || a.type === 'combine') entry.snap = a.id;
  if (a.type === 'insertFastener') entry.insert = a.id;
  if (a.type === 'tightenFastener') entry.tighten = a.id;
}

/** Earliest stage each part belongs to (its snap/insert stage). */
export const PART_STAGE: Partial<Record<PartId, Stage>> = {};
for (const a of ACTIONS) {
  if (!a.partId) continue;
  const cur = PART_STAGE[a.partId];
  if (cur === undefined || a.stage < cur) PART_STAGE[a.partId] = a.stage;
}

/** World drop target for a snap/insert action: baked pose, or loose pose for hand-inserted fasteners. */
export function targetPositionForAction(action: AssemblyAction): Vec3 {
  const pose = PARTS[action.partId!].pose;
  if (action.type !== 'insertFastener') return pose.position;
  return loosePosition(pose, ENGAGE_DIR[action.partId!] ?? [0, 0, 0]);
}

export function targetRotationForAction(action: AssemblyAction): Quat {
  return PARTS[action.partId!].pose.rotation;
}

export interface GroupCandidate {
  action: AssemblyAction;
  position: Vec3;
  rotation: Quat;
}

/**
 * Every currently-available socket interchangeable with the picked
 * representative: same action type and same part label (e.g. all open leg
 * sockets, or both open sockets for a repeated screw). Lets the player drop a
 * grouped part on whichever matching socket is nearest, not just the one the
 * tray card happened to reference.
 */
export function groupCandidates(avail: readonly AssemblyAction[], rep: AssemblyAction): GroupCandidate[] {
  const repLabel = PARTS[rep.partId!].label;
  return avail
    .filter((a) => a.type === rep.type && a.partId && PARTS[a.partId].label === repLabel)
    .map((a) => ({ action: a, position: targetPositionForAction(a), rotation: targetRotationForAction(a) }));
}
