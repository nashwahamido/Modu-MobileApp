// The renderer-truth half of the socket visibility gate.
// The box gate (dragPlane.sightlineGapM) is conservative by construction — AABB ⊇ mesh, so it can only over-block — and that one-way error is the whole contract: a box "visible" is trusted instantly, and ONLY a box "blocked" is sent to the renderer for a second opinion.
// So a wrong answer here can never open a socket the box maths would have closed on real geometry. The sweep found 48 sockets box-blocked from every camera (round plates' corner air, hollow runner channels), reachable only through this path.
// The pick needs DEPTH, not just the entity: at a hole's pixel the frontmost entity is legitimately the receiver panel, from the bore side (visible) and through its far side (hidden) alike.
// Every identity-only rule was falsified — receiver exemptions made a part transparent to its own sockets, face heuristics died twice on EKET's cam lock. Depth splits the cases exactly, so the verdict reuses the box gate's own rule on rendered geometry.
// RNF drops Filament's depth on the floor; patches/react-native-filament+1.11.0.patch adds pickEntityWithDepth to carry it across.
import type { ActionId, Vec3 } from "@/src/game/core/type";
import type { PickHit } from "@/src/game/scene/pickProbe";
import { VIS_GAP_SLACK_M } from "./dragPlane";

// Filament's depth buffer is reversed-Z with an infinite far plane — 1.0 at the near plane falling to 0.0 at infinity — so axial depth is near/d.
// Device-verified on an EKET runner screw seen through sidePanelL: raw 0.1337 → 0.748m against the anchor's 0.767m, a 20mm gap = the panel's thickness, and it tracked the zoom (0.1469 → 0.681 vs 0.698).
// A wrong near plane would scale `ax` by a constant, an inverted convention would move it the wrong way with zoom; neither showed.
export function axialDepthFromBuffer(bufferValue: number, nearM: number): number {
  if (!(bufferValue > 0)) return Infinity;
  return nearM / bufferValue;
}

// What one pick sample says about a candidate socket. `ignore` = the probe told us nothing: the frontmost thing was the held part or a ghost, never an occluder but still hiding what is behind it.
export type PickVerdict = "visible" | "blocked" | "ignore";

export interface PickJudgeInput {
  // The resolved hit, or null when the pick found open background.
  hit: PickHit | null;
  // Part ids that are NOT occluders even when frontmost. A ghost hit is ignored by its flag regardless of id.
  heldSet: ReadonlySet<string>;
  // The candidate anchor's depth along the view axis (projectToScreen's `depth`).
  anchorAxialDepthM: number;
  // Straight-line eye→anchor distance, converting the axial gap onto the sightline so the threshold means what it means in sightlineGapM.
  anchorEuclidDistM: number;
  // Camera near plane (metres).
  nearM: number;
}

// One sample, judged by the box gate's rule on rendered geometry: the frontmost surface at the socket's pixel must sit within the slack of the anchor along the sightline. Open background = visible.
// No box burial in the allowance, deliberately — burial is an upper bound on the true recess (AABB ⊇ mesh), safe only against a gap that is itself box-derived, and against the renderer's exact gap it loosens the gate in the one place meant to be precise.
// Measured on BEKVAM's leg screw, whose head sits ON the splayed leg but 17.9mm inside its 64mm-fat box: the 24mm allowance pardoned the true 18mm plank from the wrong side.
// The seat is the shaft mouth (targets.seatOffsetFor), so a true recess is at most a countersink, inside the slack.
export function judgePick(inp: PickJudgeInput): PickVerdict {
  if (inp.hit === null) return "visible";
  if (inp.hit.ghost || (inp.hit.partId !== null && inp.heldSet.has(inp.hit.partId))) return "ignore";
  const hitAxial = axialDepthFromBuffer(inp.hit.depth, inp.nearM);
  // Both points sit on the same pick ray, so the along-ray gap is the axial gap scaled by obliquity. An anchor behind the camera or a degenerate depth judges blocked, never visible.
  if (!(inp.anchorAxialDepthM > 0) || !Number.isFinite(hitAxial)) return "blocked";
  const oblique = inp.anchorEuclidDistM / inp.anchorAxialDepthM;
  const gapRayM = (inp.anchorAxialDepthM - hitAxial) * oblique;
  // A hit AT or BEHIND the anchor (gap <= 0) is the socket's own surface or something past it — clear sightline.
  return gapRayM <= VIS_GAP_SLACK_M ? "visible" : "blocked";
}

// One-line account of a judged sample for the `[drag]` probe — every number the verdict rests on, so a wrong verdict on device can be traced to its cause.
// A wrong near plane shows as `ax` off by a constant factor, a wrong depth convention as an inverted one. `gap` is the along-ray gap the rule compares against `thr`.
export function describePick(inp: PickJudgeInput, verdict: PickVerdict): string {
  if (inp.hit === null) return `${verdict} hit=bg anc=${inp.anchorAxialDepthM.toFixed(3)}`;
  const hitAxial = axialDepthFromBuffer(inp.hit.depth, inp.nearM);
  const oblique = inp.anchorAxialDepthM > 0 ? inp.anchorEuclidDistM / inp.anchorAxialDepthM : NaN;
  const gapRayM = (inp.anchorAxialDepthM - hitAxial) * oblique;
  const who = inp.hit.partId ?? "other";
  return `${verdict} hit=${inp.hit.ghost ? "ghost:" : ""}${who} raw=${inp.hit.depth.toFixed(4)} ax=${Number.isFinite(hitAxial) ? hitAxial.toFixed(3) : "inf"} anc=${inp.anchorAxialDepthM.toFixed(3)} gap=${Number.isFinite(gapRayM) ? (gapRayM * 1000).toFixed(0) : "?"}mm thr=${(VIS_GAP_SLACK_M * 1000).toFixed(0)}mm`;
}

// How many consecutive agreeing samples flip a verdict — one noisy pick (grazing pixel, mid-orbit frame) must not strobe the gate.
export const PICK_HYSTERESIS = 2;
// Minimum interval between picks; the confirmer is a ~5Hz sensor, not a per-frame test.
export const PICK_INTERVAL_MS = 200;
// A confirmed verdict dies when the eye moves this far — visibility is a property of the viewpoint.
export const PICK_STALE_EYE_M = 0.02;
// ...or when this much time passes without reconfirmation (the scene itself can change: a part placed, a cluster combined).
export const PICK_STALE_MS = 900;

interface Entry {
  verdict: PickVerdict;
  streak: number;
  eye: Vec3;
  stamp: number;
}

// Per-drag verdict cache, owned by the DragSession: it lives and dies with one pickup, so there is nothing to invalidate across drags.
export class PickConfirmCache {
  private entries = new Map<ActionId, Entry>();
  private inFlight = false;
  private lastFiredAt = 0;
  // Probe-only: the last judged sample plus the streak it produced, read by the `[drag]` line's `pk=` field.
  lastDiag = "";

  // Probe-only: the live streak for a candidate, "verdict:streak" — what isConfirmedVisible is about to act on.
  streakOf(id: ActionId): string {
    const e = this.entries.get(id);
    return e ? `${e.verdict}:${e.streak}` : "none";
  }

  // Whether a candidate the BOX called blocked may be acquired anyway: only on a live confirmed-visible verdict from the current viewpoint. Missing, stale and blocked all answer no.
  isConfirmedVisible(id: ActionId, eye: Vec3, now: number): boolean {
    const e = this.entries.get(id);
    if (!e || e.verdict !== "visible" || e.streak < PICK_HYSTERESIS) return false;
    if (now - e.stamp > PICK_STALE_MS) return false;
    const dx = eye[0] - e.eye[0];
    const dy = eye[1] - e.eye[1];
    const dz = eye[2] - e.eye[2];
    return dx * dx + dy * dy + dz * dz <= PICK_STALE_EYE_M * PICK_STALE_EYE_M;
  }

  // Gate for firing a probe: throttled, one in flight. The caller fires only for the nearest box-blocked candidate — one socket is all the player can be aiming at.
  shouldFire(now: number): boolean {
    return !this.inFlight && now - this.lastFiredAt >= PICK_INTERVAL_MS;
  }

  markFired(now: number): void {
    this.inFlight = true;
    this.lastFiredAt = now;
  }

  // Record one judged sample. `ignore` releases the in-flight slot and touches nothing else: the held part covering the socket's pixel is normal while aiming, and the previous verdict carries the gate through those frames.
  record(id: ActionId, verdict: PickVerdict, eye: Vec3, now: number): void {
    this.inFlight = false;
    if (verdict === "ignore") return;
    const e = this.entries.get(id);
    if (e && e.verdict === verdict) {
      e.streak += 1;
      e.eye = eye;
      e.stamp = now;
    } else {
      this.entries.set(id, { verdict, streak: 1, eye, stamp: now });
    }
  }
}
