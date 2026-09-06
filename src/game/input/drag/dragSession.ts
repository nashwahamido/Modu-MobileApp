// What a live part drag remembers between frames, plus the two pure predicates the gesture asks about the part in hand.
// Split out of usePartDrag so the state can be read without scrolling past the gesture that mutates it.
import { isStaged } from "@/src/game/core/model/staging";
import type { GroupCandidate } from "@/src/game/core/scene/targets";
import type { ActionId, Furniture, PartDef, PartId, Quat, Vec3 } from "@/src/game/core/type";
import type { PickConfirmCache } from "./pickConfirm";

export type Float3 = [number, number, number];

export interface DragSession {
  base: Float3;
  // Interchangeable sockets the held part may snap to (same part group).
  // `matchVisual` is where the fit is MEASURED — the park pose for an axis-entering part, the seated hold point otherwise; GroupCandidate's own position stays what release places at.
  // `clearPoints` is the visibility gate's second chance when the seat is box-blocked: a structural part's ghost body, a fastener's park point. Empty when it has neither.
  // `ungated` is the authored opt-out (PartDef.noVisibilityGate), read once at pickup so the per-frame loop stays pure geometry.
  candidates: (GroupCandidate & { matchVisual: Vec3; seatVisual: Vec3; clearPoints: Vec3[]; burial: number; ungated: boolean })[];
  // Live sockets outside the group, for wrong-target detection.
  otherSockets: Vec3[];
  bakedPos: Vec3;
  // Baked rotation of the held part, eased toward the matched socket's rotation as it approaches.
  bakedRot: Quat;
  // Offset from snap origin to the visible center the finger should control.
  grabOffset: Vec3;
  // Height of the horizontal drag plane. DYNAMIC: eases toward the matched socket's height (multi-height groups like DALFRED's screw105251), back to basePlaneY when unmatched.
  planeY: number;
  // Set for parts that enter VERTICALLY, null for everything else.
  // A horizontal plane maps screen-Y to DEPTH, which is right for a part sliding across a surface and wrong for one dropping in from above — no height of it can express downward travel, and raising it only brings the part toward the lens.
  // When set, the drag runs on a plane FACING the camera through this anchor, where screen-up is world-up and the part holds the model's own depth.
  uprightAnchor: Vec3 | null;
  // The action's own target height — the drag plane's resting height.
  basePlaneY: number;
  matchedActionId: ActionId | null;
  // Current hover lift (m) on the held part — eased in as it nears a socket, subtracted back out to compute the true pose for fit.
  hoverLift: number;
  // Time-eased socket-depth blend: 0 = plain carry depth, 1 = fully at the matched socket's depth. Eased rather than recomputed from the aim each frame — the instantaneous form dragged the part backwards.
  depthBlend: number;
  // The socket point the blend eases toward. Held after a match is lost so it can ease back OUT instead of snapping, cleared once it reaches zero.
  depthTarget: Vec3 | null;
  startX: number;
  startY: number;
  // Last time the aim sat on a blocked socket — the chip's debounce clock. Showing is instant, clearing waits, so grazing sightlines don't strobe the label.
  blockedStamp: number;
  // EXPERIMENT (drag-no-plane): assembly bounding radius around the pivot at pickup — sets the ray-carry depth "just in front of the model".
  modelR: number;
  // Every part placed at pickup. Fixed for the drag (no action completes mid-gesture), so the occluder refresh can re-read their boxes without re-deriving the set.
  placedIds: readonly PartId[];
  // The sightline gate's occluder list: placed parts boxed at the pose the renderer actually draws them at, with owner ids so the probe can name the blocker.
  // Refreshed on a throttle (OCCLUDER_REFRESH_MS) — camera motion never stales world-space boxes, but parts MOVE mid-drag: a cluster-focus toggle, or the previous part's commit still easing home.
  placedBoxes: { min: Vec3; max: Vec3; pid: string }[];
  // Last time placedBoxes was read from the renderer — the refresh throttle's clock.
  boxesStamp: number;
  // Renderer second opinions on box-blocked candidates — the pickEntity confirmer's per-drag verdict cache (see pickConfirm.ts).
  pickCache: PickConfirmCache;
  // The held part and everything riding with it — a pick may legitimately find these over the socket's pixel, since the part in hand is what is ABOUT to fill it. Captured at pickup.
  heldSet: ReadonlySet<string>;
  // How far the part reaches from the point the finger controls — what the carry must clear so no end of it crosses the lens. Captured at pickup; bounds and hold point are both fixed.
  holdReach: number;
  // Axial depth (m) of the socket the carry is referenced to — see SOCKET_DEPTH_CARRY_ENABLED. Null = nothing to reference, so the model-derived carry stands.
  // Seeded at pickup from the first candidate so frame ONE is already at socket depth ("it is huge the moment I grab it" is a frame-one complaint), then re-read each frame from the matched candidate, or the nearest one.
  // Lags the matcher by one frame, since the carry point is computed first — invisible next to restructuring the update, and it only moves when the aim crosses between sockets at different depths.
  socketDepth: number | null;
  // Eased occlusion cap on the carry depth (m, axial), Infinity over open space.
  // socketDepth answers "how far away does this part belong", this answers "how far may it be drawn before the player stops seeing it" — they disagree once the finger wanders off the socket onto the body of the furniture, and the cap wins, because a part carried behind the model cannot be seen.
  // Eased, not raw: the measurement steps discontinuously at every silhouette edge (CARRY_CAP_EASE).
  carryCap: number;
}

// What the combine drag remembers between frames — the cluster counterpart of DragSession, and a ref for the same reason.
// setCombiningCluster in onStart re-renders ClusterTray, rebuilding the gesture object, and gesture-handler carries the live touch onto the NEW one without re-firing onStart, so closure locals would reset mid-drag.
export interface ClusterSession {
  ref: Float3;
  planeY: number;
  lastO: Float3;
  // Camera-plane anchor for a vertically-parking cluster or a seed (see clusterCarryAnchor); null keeps the horizontal glide.
  anchor: Float3 | null;
}

// How far a part is held OFF its seat while being dragged.
// A part with an authored placeDir enters along that axis and PARKS before being driven home, and the work plane, the fit match and the release all have to agree on that parked pose.
// Pinning the drag to the seated height instead makes a park-pose match unreachable: the fit only turns green once the part is underneath its socket, the opposite of how it goes in.
export function parkShiftFor(part: PartDef | undefined): Vec3 {
  const dir = part?.placeDir;
  const back = part?.parkBackoff ?? 0;
  if (!dir || !back) return [0, 0, 0];
  return [-dir[0] * back, -dir[1] * back, -dir[2] * back];
}

// True when dragging `partId` carries other bodies with it (PartModel's "riding" mode): the LEAD of a multi-body component, or the carrier of a staged sub-assembly bringing its hardware home.
// One predicate for both, so a part that is somehow both needs no extra case.
export function hasRidingBodies(
  furniture: Furniture | null | undefined,
  partId: PartId | null | undefined,
): boolean {
  if (!furniture || !partId) return false;
  if (isStaged(furniture.parts[partId])) return true;
  const comp = furniture.components?.byBody[partId];
  return !!comp && furniture.components!.lead[comp] === partId;
}
