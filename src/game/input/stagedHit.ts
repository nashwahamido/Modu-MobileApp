import type { PartId, Vec3 } from "@/src/game/core/type";

/** A staged part the player could be reaching for, at the world position it is CURRENTLY resting at (baked pose + the carrier's stageOffset) — not its assembled pose. */
export interface StagedCandidate {
  partId: PartId;
  worldPos: Vec3;
}

/** How close a long-press must land to a staged part, in screen pixels, to count as grabbing it. Generous enough for a thumb on a small rod, tight enough to keep an open-space press from being misread as a grab. */
export const STAGED_HIT_RADIUS_PX = 64;

/** Which staged part a press landed on, or null if none. Nearest in SCREEN space wins, because the finger's aim is 2D — depth must never decide this for the player. Returning null is a real answer meaning "grab nothing" — a defensive no-op for the race between this gesture arming and the press actually landing on a staged part, not a fallthrough to the camera strafe: by the time this runs, the long-press has already won its Gesture.Race on native activation, so a null here does not revive an already-cancelled strafe. What actually protects the strafe is that usePartDrag.tsx only attaches this gesture (stagedGrabGesture, gated by stagedGrabArmed) when stagedGrabCandidates() has something to grab in the first place. Projection is injected so this stays testable without a camera. */
export function nearestStagedHit(
  candidates: readonly StagedCandidate[],
  press: { x: number; y: number },
  project: (w: Vec3) => { x: number; y: number } | null,
  radiusPx: number = STAGED_HIT_RADIUS_PX,
): PartId | null {
  let best: PartId | null = null;
  let bestD = Infinity;
  for (const c of candidates) {
    const sp = project(c.worldPos);
    // a candidate behind the camera or otherwise unprojectable is not on screen, so it cannot be under the finger
    if (!sp) continue;
    const d = Math.hypot(press.x - sp.x, press.y - sp.y);
    if (d < bestD) {
      bestD = d;
      best = c.partId;
    }
  }
  return bestD <= radiusPx ? best : null;
}
