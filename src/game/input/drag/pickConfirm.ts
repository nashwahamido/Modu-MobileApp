// The renderer-truth half of the socket visibility gate.
//
// The box gate (dragPlane.sightlineGapM) is conservative by construction: AABB ⊇ mesh, so it can only over-block, never under-block. That one-way error is the whole contract here — a box "visible" is trusted instantly, and ONLY a box "blocked" is submitted to the renderer for a second opinion, so a wrong answer from this module can never open a socket the box maths would have closed on real geometry. The sweep measured 48 sockets box-blocked from every camera (round plates' corner air, hollow runner channels); each is reachable only through this path.
//
// Why the pick needs DEPTH and not just the entity: at a hole's pixel the frontmost entity is legitimately the receiver panel — from the bore side (visible) AND through the panel's far side (hidden), the same entity answers. Every identity-only rule tried before was falsified: receiver exemptions made a part transparent to its own sockets (legs snapped through plates), face heuristics died twice on EKET's cam lock. Depth splits the cases exactly: the depth buffer says WHERE the frontmost surface is, so the verdict can reuse the very same rule as the box gate — first surface within (burial + slack) of the anchor — measured on rendered geometry instead of boxes. RNF drops Filament's depth on the floor; patches/react-native-filament+1.11.0.patch adds pickEntityWithDepth to carry it across.
import type { ActionId, Vec3 } from "@/src/game/core/type";
import type { PickHit } from "@/src/game/scene/pickProbe";
import { VIS_GAP_SLACK_M } from "./dragPlane";

/** Filament's depth buffer is reversed-Z with an infinite far plane: 1.0 at the near plane falling to 0.0 at infinity, so axial (view-space) depth is near/d. DEVICE-CHECK PENDING: this mapping is from View.h's documentation ("1 (near plane) to 0 (infinity)"); before trusting verdicts on-device, probe a pick against a surface at known camera distance and compare. */
export function axialDepthFromBuffer(bufferValue: number, nearM: number): number {
  if (!(bufferValue > 0)) return Infinity;
  return nearM / bufferValue;
}

/** What one pick sample says about a candidate socket. `ignore` = the probe told us nothing — the frontmost thing was the held part itself (or a ghost), which is never an occluder but hides whatever is behind it. */
export type PickVerdict = "visible" | "blocked" | "ignore";

export interface PickJudgeInput {
  /** The resolved hit, or null when the pick found open background. */
  hit: PickHit | null;
  /** Part ids that are NOT occluders even when frontmost: the held part and everything riding with it. A ghost hit is ignored by its flag regardless of id. */
  heldSet: ReadonlySet<string>;
  /** The candidate anchor's depth along the view axis (projectToScreen's `depth`). */
  anchorAxialDepthM: number;
  /** Straight-line eye→anchor distance, to convert the axial gap onto the sightline so the threshold means the same thing it means in sightlineGapM. */
  anchorEuclidDistM: number;
  /** The candidate's own burial (box-derived, computed at pickup) — its personal allowance, same as the box gate's. */
  burialM: number;
  /** Camera near plane (metres). */
  nearM: number;
}

/** One sample, judged by the same rule as the box gate but on rendered geometry: the frontmost surface at the socket's pixel must sit within (burial + slack) of the anchor along the sightline. Open background = nothing in front at all = visible. */
export function judgePick(inp: PickJudgeInput): PickVerdict {
  if (inp.hit === null) return "visible";
  if (inp.hit.ghost || (inp.hit.partId !== null && inp.heldSet.has(inp.hit.partId))) return "ignore";
  const hitAxial = axialDepthFromBuffer(inp.hit.depth, inp.nearM);
  // Both points sit on the same pick ray, so the along-ray gap is the axial gap scaled by the ray's obliquity (euclid/axial of the anchor). Guard: an anchor behind the camera or a degenerate depth judges blocked, never visible.
  if (!(inp.anchorAxialDepthM > 0) || !Number.isFinite(hitAxial)) return "blocked";
  const oblique = inp.anchorEuclidDistM / inp.anchorAxialDepthM;
  const gapRayM = (inp.anchorAxialDepthM - hitAxial) * oblique;
  // A hit AT or BEHIND the anchor (gap <= 0) is the socket's own surface or something past it — clear sightline.
  return gapRayM <= inp.burialM + VIS_GAP_SLACK_M ? "visible" : "blocked";
}

/** How many consecutive agreeing samples flip a verdict — one noisy pick (grazing pixel, mid-orbit frame) must not strobe the gate. */
export const PICK_HYSTERESIS = 2;
/** Minimum interval between picks; the confirmer is a ~5Hz sensor, not a per-frame test. */
export const PICK_INTERVAL_MS = 200;
/** A confirmed verdict dies when the eye moves this far — visibility is a property of the viewpoint. */
export const PICK_STALE_EYE_M = 0.02;
/** ...or when this much time passes without reconfirmation (the scene itself can change: a part placed, a cluster combined). */
export const PICK_STALE_MS = 900;

interface Entry {
  verdict: PickVerdict;
  streak: number;
  eye: Vec3;
  stamp: number;
}

/** Per-drag verdict cache. Plain mutable object owned by the DragSession — it lives and dies with one pickup, so there is nothing to invalidate across drags. */
export class PickConfirmCache {
  private entries = new Map<ActionId, Entry>();
  private inFlight = false;
  private lastFiredAt = 0;

  /** Whether a candidate that the BOX called blocked may be acquired anyway: only on a live, confirmed-visible verdict from the current viewpoint. Missing/stale/blocked all answer no — the conservative box verdict stands. */
  isConfirmedVisible(id: ActionId, eye: Vec3, now: number): boolean {
    const e = this.entries.get(id);
    if (!e || e.verdict !== "visible" || e.streak < PICK_HYSTERESIS) return false;
    if (now - e.stamp > PICK_STALE_MS) return false;
    const dx = eye[0] - e.eye[0];
    const dy = eye[1] - e.eye[1];
    const dz = eye[2] - e.eye[2];
    return dx * dx + dy * dy + dz * dz <= PICK_STALE_EYE_M * PICK_STALE_EYE_M;
  }

  /** Gate for firing a probe: throttled, one in flight. The caller fires only for the nearest box-blocked candidate — one socket is all the player can be aiming at. */
  shouldFire(now: number): boolean {
    return !this.inFlight && now - this.lastFiredAt >= PICK_INTERVAL_MS;
  }

  markFired(now: number): void {
    this.inFlight = true;
    this.lastFiredAt = now;
  }

  /** Record one judged sample. `ignore` releases the in-flight slot and touches nothing else — the held part covering the socket's pixel is normal while aiming, and the sticky previous verdict (bounded by staleness) is what carries the gate through those frames. */
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
