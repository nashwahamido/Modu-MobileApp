// What a live part drag remembers between frames, plus the two pure predicates the gesture asks about the part it is holding. Split out of usePartDrag so the state a drag carries can be read without scrolling past the gesture that mutates it.
import { isStaged } from "@/src/game/core/model/staging";
import type { GroupCandidate } from "@/src/game/core/scene/targets";
import type { ActionId, Furniture, PartDef, PartId, Quat, Vec3 } from "@/src/game/core/type";
import type { PickConfirmCache } from "./pickConfirm";

export type Float3 = [number, number, number];

export interface DragSession {
  base: Float3;
  /** Interchangeable sockets the held part may snap to (same part group). */
  /** matchVisual is where the fit is MEASURED — the park pose for a part that enters along an axis, the seated hold point for everything else. GroupCandidate's own position stays what the release path places at. */
  candidates: (GroupCandidate & { matchVisual: Vec3; seatVisual: Vec3; parkVisual?: Vec3; burial: number })[];
  /** Live sockets outside the group, for wrong-target detection. */
  otherSockets: Vec3[];
  bakedPos: Vec3;
  /** Baked rotation of the held (representative) part. The held part eases from  this toward the matched socket's rotation as it approaches. */
  bakedRot: Quat;
  /** Offset from snap origin to the visible center the finger should control. */
  grabOffset: Vec3;
  /** Height of the horizontal drag plane. DYNAMIC: eases toward the matched socket's height each frame (multi-height groups like DALFRED's screw105251), back to basePlaneY when nothing is matched. */
  planeY: number;
  /**
   * Set for parts that enter VERTICALLY, and null for everything else.
   *
   * A horizontal plane maps screen-Y to DEPTH — drag up and the part moves away from the camera. That is right for a part sliding across a surface, and wrong for one that drops in from above: no height of horizontal plane can express downward travel, and raising it only brings the part toward the lens. When set, the drag runs on a plane FACING the camera through this anchor, where screen-up is world-up and the part stays at the model's own depth.
   */
  uprightAnchor: Vec3 | null;
  /** The action's own target height — the drag plane's resting height. */
  basePlaneY: number;
  matchedActionId: ActionId | null;
  /** Current hover lift (m) applied to the held part — eased in as it nears a  socket; subtracted back out when computing the true pose for fit. */
  hoverLift: number;
  /** Time-eased socket-depth blend: 0 = the plain carry depth, 1 = fully at the matched socket's depth. Eased rather than recomputed from the aim each frame — see the blend site for why the instantaneous form dragged the part backwards. */
  depthBlend: number;
  /** The socket point the depth blend is easing toward. Held after a match is lost so the blend can ease back OUT instead of snapping, and cleared once it reaches zero. */
  depthTarget: Vec3 | null;
  startX: number;
  startY: number;
  /** Last time the aim sat on a blocked socket — the chip's debounce clock: showing is instant, clearing waits, so grazing sightlines and the 160px rim don't strobe the label. */
  blockedStamp: number;
  /** EXPERIMENT (drag-no-plane): assembly bounding radius around the pivot at pickup — sets the ray-carry depth "just in front of the model". */
  modelR: number;
  /** Every part placed at pickup time. Fixed for the drag (actions cannot complete mid-gesture) — kept so the occluder refresh below can re-read the same parts' boxes without re-deriving the set. */
  placedIds: readonly PartId[];
  /** The sightline-gap gate's occluder list: the placed parts, boxed at the pose the renderer is actually drawing them at (with owner ids, so the probe can name the blocker). Refreshed on a throttle during the drag (OCCLUDER_REFRESH_MS): the boxes are world-space so camera motion never stales them, but parts can MOVE mid-drag — a second finger toggling cluster focus, the previous part's commit animation still easing home at pickup. */
  placedBoxes: { min: Vec3; max: Vec3; pid: string }[];
  /** Last time placedBoxes was read from the renderer — the refresh throttle's clock. */
  boxesStamp: number;
  /** Renderer second opinions on box-blocked candidates — the pickEntity confirmer's per-drag verdict cache (see pickConfirm.ts). */
  pickCache: PickConfirmCache;
  /** The held part and everything riding with it — parts a pick may legitimately find covering the socket's pixel without that meaning occlusion (the part in hand is what is ABOUT to fill the socket). Captured at pickup; the riding set is fixed for the drag. */
  heldSet: ReadonlySet<string>;
  /** How far this part reaches from the point the finger controls — what the carry must clear so no end of it crosses the lens. Captured at pickup because the bounds and the hold point are both fixed for the drag. */
  holdReach: number;
  /**
   * Axial depth (m) of the socket the carry is referenced to — see SOCKET_DEPTH_CARRY_ENABLED.
   *
   * Seeded at pickup from the first candidate so frame ONE is already at socket depth (the "it is huge the moment I grab it" complaint is about frame one), then re-read each frame from whichever candidate is matched, or the nearest one when nothing is. It lags the matcher by one frame, because the carry point is computed before the matcher runs; a frame is invisible next to restructuring the update, and the value only moves when the aim crosses between sockets at different depths. Null = nothing to reference, so the model-derived carry stands.
   */
  socketDepth: number | null;
  /**
   * Eased occlusion cap on the carry depth (m, axial), Infinity while the finger is over open space.
   *
   * The socket-referenced carry above answers "how far away does this part belong"; this answers "how far away may it be drawn before the player stops seeing it". They disagree whenever the finger wanders off the socket onto the body of the furniture — the socket is behind a panel the finger is now pointing at — and the cap wins there, because a part carried behind the model is a part in hand that cannot be seen. Eased rather than taken raw: the underlying measurement steps discontinuously at every silhouette edge (see CARRY_CAP_EASE).
   */
  carryCap: number;
}

/** What the combine drag remembers between frames — the cluster counterpart of DragSession, and a ref for the same reason: setCombiningCluster in onStart re-renders ClusterTray, which rebuilds the gesture object, and gesture-handler carries the active touch onto the NEW object without re-firing onStart, so closure locals would reset mid-drag. */
export interface ClusterSession {
  ref: Float3;
  planeY: number;
  lastO: Float3;
  /** Camera-plane anchor for a vertically-parking cluster or a seed (see clusterCarryAnchor); null keeps the horizontal glide. */
  anchor: Float3 | null;
}

/**
 * How far a part is held OFF its seat while being dragged.
 *
 * A part with an authored placeDir enters along that axis and PARKS before it is driven home. The work plane, the fit match and the release all have to agree on that parked pose: pinning the drag to the seated height means the part can never hover above its socket, so a match measured at the park pose is unreachable and the fit only turns green once the part is underneath — which is the opposite of how it goes in.
 */
export function parkShiftFor(part: PartDef | undefined): Vec3 {
  const dir = part?.placeDir;
  const back = part?.parkBackoff ?? 0;
  if (!dir || !back) return [0, 0, 0];
  return [-dir[0] * back, -dir[1] * back, -dir[2] * back];
}

/** True when dragging `partId` carries other bodies with it on slideDriver (PartModel's "riding" mode / useSceneState's riding set): the LEAD of a multi-body component, or the carrier of a staged sub-assembly bringing its fitted hardware home. One predicate for both, so a part that is somehow both needs no extra case. */
export function hasRidingBodies(
  furniture: Furniture | null | undefined,
  partId: PartId | null | undefined,
): boolean {
  if (!furniture || !partId) return false;
  if (isStaged(furniture.parts[partId])) return true;
  const comp = furniture.components?.byBody[partId];
  return !!comp && furniture.components!.lead[comp] === partId;
}
