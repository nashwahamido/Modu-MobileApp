// TODO: settle down the part marked as dev-setting: magnetic pull + auto return vs float +auto retuen btn

import * as Haptics from "expo-haptics";
import { useCallback, useMemo, useRef } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { Gesture, GestureType } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import {
  groupCandidates,
  holdOffsetFor,
  targetPositionForAction,
} from "@/src/game/core/scene/targets";
import type { GroupCandidate } from "@/src/game/core/scene/targets";
import { deriveJointFrames, partAnchorOffsets } from "@/src/game/core/model/jointFrames";
import { actionCluster, actionsForClusterFocus, clusterStarted } from "@/src/game/core/evaluation/clusters";
import { clusterDriveKind } from "@/src/game/core/evaluation/clusterCombine";
import {
  placeEngagement,
  pressParkInfo,
  screwParkOffset,
  slideParkInfo,
} from "@/src/game/core/evaluation/engagement";
import type { ParkInfo } from "@/src/game/core/evaluation/engagement";
import type { ISharedValue } from "react-native-worklets-core";
import type { OffsetSink } from "../../scene/combineDriver";
import type { CarryOffset } from "../../scene/CombineCarry";
import { computeFit, APPROACH_FACTOR } from "@/src/game/core/geometry/fit";
import { isStaged } from "@/src/game/core/model/staging";
import { isPickupType, placeId } from "@/src/game/core/ids";
import { quatConjugate, quatMultiply, quatRotateVec3, quatSlerp, screenRay } from "@/src/game/core/geometry/math";
import { AIM_BAND_MAX_PX, aimBandScale, clusterCarryAnchor, dragPlanePoint, dragRayPoint, holdReachFrom, leashAlongRay, boxSurfaceSamples, pointToSegmentPx, rayPointNearest, segmentHitsBox, segmentInFrame } from "./dragPlane";
import { ActionId, AssemblyAction, Furniture, PartBox, PartDef, PartId, Quat, Vec3 } from "@/src/game/core/type";
import { selectFirstDrop, useGameStore } from "@/src/game/core/store";
import type { OrbitManipulator } from "../../scene/AssemblyScene";
import { FOV_Y_DEG } from "../../scene/cameraConfig";
import {
  animateClusterDriver,
  animateDriver,
  ClusterDriver,
  OffsetDriver,
} from "../../scene/offsetDriver";

// Physical dimensions shared by the gesture maths and the stylesheet: the maths divides by them, so changing one moves the pixels AND retunes the gesture together.
const RING = 64;
const TARGET_RING = 92;

type Float3 = [number, number, number];

// Timestamp gate for the DEV drag probe below — module scope so it survives gesture rebuilds.
let lastDragLog = 0;
// One-shot gate for the DEV rotation probe: log once per matched-target change, not per frame.
let lastRotLogId: ActionId | null = null;

const PICKUP_MS = 450;
/** The held part rides just above the fingertip so the finger doesn't cover it. */
const FINGER_LIFT_DP = 22;
/** Ghost/magnet targeting starts before the final snap threshold. */
const APPROACH_RADIUS_M = 0.3;
/** Magnetic POSITION pull band, decoupled from rotation: rotation eases in over the whole approach (0.3m), but position stays under the finger until this close and is fully seated at POS_PULL_FULL_M — capping finger→part drift at ~3cm (it used to reach snapDist, 14–19cm, which felt uncontrollable). */
const POS_PULL_START_M = 0.09;
const POS_PULL_FULL_M = 0.025;
/** Per-frame ease for the socket-depth blend, and the weight below which it is treated as fully out. Lower = more lag between the aim and the depth, which is what stops the depth racing the finger; 0.12 is roughly a 130 ms time constant at 60 fps, against the ~90 ms the finger spends crossing the band at a typical drag speed. Device-tunable: raise it toward the 0.25 the work plane uses if delivery starts to feel sluggish, lower it if the part still swings. */
const DEPTH_BLEND_EASE = 0.12;
const DEPTH_BLEND_EPS = 0.002;
/** Master switch for the socket-depth blend. OFF while we A/B the drag: with it off the part holds its carry depth right up until the position magnet takes over, so delivery is posT's job alone. Flip to true to restore the eased approach. */
const DEPTH_BLEND_ENABLED = false;
/** Prevent target flicker when hovering between equivalent sockets — expressed in SCREEN pixels because candidate matching is done on the projected screen positions (the finger's aim is 2D; depth must never hide a socket). */
const SWITCH_MARGIN_PX = 14;
/** Snap ACCEPTANCE radius comes from settings.snapDistance (per-profile, default 0.14); clamped here so no profile can exceed the geometry-safe cap. APPROACH/SWITCH_MARGIN above stay constants — they own anti-jumping. */
const SNAP_DIST_MIN = 0.06;
const SNAP_DIST_MAX = 0.2;
/** How far past the screen edge an ALREADY-matched socket keeps its match. Acquisition needs the socket in frame (a snap must not be earnable against a hole the player can't see); release is this much more lenient so a mid-drag orbit that nudges the socket over the edge doesn't pop the magnet mid-pull. */
const HOLD_OFFSCREEN_MARGIN_PX = 96;
/** Minimum visible fraction of a fastener's exposed seated-geometry samples for it to be assemblable — the user's ">=30% of the target geometry in sight" rule. */
const VIS_FRACTION_MIN = 0.3;
/** Absolute end margin (m) for sample sightlines. The default fractional margin exists for anchor tests where the endpoint sits INSIDE geometry; samples are already pushed clear of all geometry, so their margin only absorbs surface contact — and a fractional margin at bench distance (4% of 1m = 4cm) swallows the very panel a rear sample hides behind. */
const SAMPLE_HIT_MARGIN_M = 0.008;

/** True when dragging `partId` carries other bodies with it on slideDriver (PartModel's "riding" mode / useSceneState's riding set): the LEAD of a multi-body component, or the carrier of a staged sub-assembly bringing its fitted hardware home. One predicate for both, so a part that is somehow both needs no extra case. */
function hasRidingBodies(furniture: Furniture | null | undefined, partId: PartId | null | undefined): boolean {
  if (!furniture || !partId) return false;
  if (isStaged(furniture.parts[partId])) return true;
  const comp = furniture.components?.byBody[partId];
  return !!comp && furniture.components!.lead[comp] === partId;
}

interface Params {
  manipulator: OrbitManipulator;
  heldDriver: OffsetDriver;
  /** Drives a component's non-lead bodies while the lead is held/dragged, so they track the same live offset ("riding" mode). */
  slideDriver: ClusterDriver;
  /** The combine carry offset, applied to the dragged cluster's entities on the RENDER thread (scene/CombineCarry) — carrying ~60 entities per frame from the JS thread froze the app. */
  carryShared: ISharedValue<CarryOffset>;
  getFocusPoint: () => Vec3;
  /** Camera strafe callbacks — the canvas gesture falls back to these when the one-finger drag isn't re-grabbing a floating part. */
  onPanStart?: (x: number, y: number) => void;
  onPanMove?: (x: number, y: number) => void;
  onPanEnd?: () => void;
}

interface DragSession {
  base: Float3;
  /** Interchangeable sockets the held part may snap to (same part group). */
  /** matchVisual is where the fit is MEASURED — the park pose for a part that enters along an axis,
   *  the seated hold point for everything else. GroupCandidate's own position stays what the
   *  release path places at. */
  candidates: (GroupCandidate & { matchVisual: Vec3; seatVisual: Vec3; visSamples: Vec3[] | null; receiverIds: Set<PartId> })[];
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
   * A horizontal plane maps screen-Y to DEPTH — drag up and the part moves away from the camera.
   * That is right for a part sliding across a surface, and wrong for one that drops in from above:
   * no height of horizontal plane can express downward travel, and raising it only brings the part
   * toward the lens. When set, the drag runs on a plane FACING the camera through this anchor, where
   * screen-up is world-up and the part stays at the model's own depth.
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
  /** Parts placed at pickup time — the occluder set for the socket line-of-sight gate. */
  placedIds: Set<PartId>;
  /** How far this part reaches from the point the finger controls — what the carry must clear so no end of it crosses the lens. Captured at pickup because the bounds and the hold point are both fixed for the drag. */
  holdReach: number;
}

/** Tray-item drag: long-press a tray card (progress ring) to take the part in hand — it materializes at the spawn point on the work plane — then keep the finger down to pan it; release snaps or returns it to the tray. */
export function usePartDrag({
  manipulator,
  heldDriver,
  slideDriver,
  carryShared,
  getFocusPoint,
  onPanStart,
  onPanMove,
  onPanEnd,
}: Params) {
  const session = useRef<DragSession | null>(null);
  // Combine-drag state lives in a ref, NOT gesture-closure locals: setCombiningCluster in onStart re-renders ClusterTray, which rebuilds the cluster gesture object, and gesture-handler carries the active touch onto the NEW object without re-firing its onStart — so closure-local ref/planeY/lastO would reset to null and onUpdate would stop tracking. A ref survives the swap, exactly as `session` does for part drags.
  const clusterSession = useRef<{
    ref: Float3;
    planeY: number;
    lastO: Float3;
    // Camera-plane anchor for a vertically-parking cluster (see clusterCarryAnchor); null keeps the horizontal glide.
    anchor: Float3 | null;
  } | null>(null);

  const ringX = useSharedValue(0);
  const ringY = useSharedValue(0);
  const ringProgress = useSharedValue(0);
  // Screen position of the combine drag's target marker (the seat / park pose), driven from the cluster gesture.
  const clusterRingX = useSharedValue(0);
  const clusterRingY = useSharedValue(0);
  const { width: winW, height: winH } = useWindowDimensions();

  const fingerOnCameraPlaneAt = useCallback(
    (absX: number, absY: number, anchor: Vec3): Float3 | null => {
      const la = manipulator?.getLookAt();
      if (!la) return null;
      const [eye, center, up] = la;
      const f: Vec3 = [
        center[0] - eye[0],
        center[1] - eye[1],
        center[2] - eye[2],
      ];
      const fl = Math.hypot(f[0], f[1], f[2]) || 1;
      const fwd: Vec3 = [f[0] / fl, f[1] / fl, f[2] / fl];
      const r: Vec3 = [
        fwd[1] * up[2] - fwd[2] * up[1],
        fwd[2] * up[0] - fwd[0] * up[2],
        fwd[0] * up[1] - fwd[1] * up[0],
      ];
      const rl = Math.hypot(r[0], r[1], r[2]) || 1;
      const right: Vec3 = [r[0] / rl, r[1] / rl, r[2] / rl];
      const camUp: Vec3 = [
        right[1] * fwd[2] - right[2] * fwd[1],
        right[2] * fwd[0] - right[0] * fwd[2],
        right[0] * fwd[1] - right[1] * fwd[0],
      ];
      const dist =
        (anchor[0] - eye[0]) * fwd[0] +
        (anchor[1] - eye[1]) * fwd[1] +
        (anchor[2] - eye[2]) * fwd[2];
      if (!Number.isFinite(dist) || dist <= 0) return null;
      const tanV = Math.tan((FOV_Y_DEG * Math.PI) / 360);
      const tanH = tanV * (winW / winH);
      const ndcX = (2 * absX) / winW - 1;
      const ndcY = 1 - (2 * (absY - FINGER_LIFT_DP)) / winH;
      const p: Float3 = [
        anchor[0] +
          right[0] * ndcX * tanH * dist +
          camUp[0] * ndcY * tanV * dist,
        anchor[1] +
          right[1] * ndcX * tanH * dist +
          camUp[1] * ndcY * tanV * dist,
        anchor[2] +
          right[2] * ndcX * tanH * dist +
          camUp[2] * ndcY * tanV * dist,
      ];
      return leashAlongRay(eye, center, eye as Float3, p);
    },
    [manipulator, winW, winH],
  );

/**
 * How far a part is held OFF its seat while being dragged.
 *
 * A part with an authored placeDir enters along that axis and PARKS before it is driven home. The
 * work plane, the fit match and the release all have to agree on that parked pose: pinning the drag
 * to the seated height means the part can never hover above its socket, so a match measured at the
 * park pose is unreachable and the fit only turns green once the part is underneath — which is the
 * opposite of how it goes in.
 */
function parkShiftFor(part: PartDef | undefined): Vec3 {
  const dir = part?.placeDir;
  const back = part?.parkBackoff ?? 0;
  if (!dir || !back) return [0, 0, 0];
  return [-dir[0] * back, -dir[1] * back, -dir[2] * back];
}

  /** EXPERIMENT (drag-no-plane): the finger's point with no plane — on the ray, just in front of the model's near boundary (see dragRayPoint). The adaptive default; level mode keeps fingerOnPlane. */
  const fingerOnRay = useCallback(
    (absX: number, absY: number, modelRadius: number, holdReach = 0): Float3 | null => {
      const la = manipulator?.getLookAt();
      if (!la) return null;
      return dragRayPoint(
        { eye: la[0], center: la[1], up: la[2] },
        FOV_Y_DEG,
        winW,
        winH,
        absX,
        absY - FINGER_LIFT_DP,
        modelRadius,
        holdReach,
      );
    },
    [manipulator, winW, winH],
  );

  /** Bounding radius of the assembly around the current orbit pivot, from the baked poses — what "in front of the model" measures against. Baked poses are the finished-furniture layout, so the radius is stable for the whole drag. */
  const assemblyRadius = useCallback(
    (furniture: Furniture): number => {
      const piv = getFocusPoint();
      let r2 = 0;
      for (const pt of Object.values(furniture.parts)) {
        const off = pt.visualCenterOffset ?? [0, 0, 0];
        const dx = pt.pose.position[0] + off[0] - piv[0];
        const dy = pt.pose.position[1] + off[1] - piv[1];
        const dz = pt.pose.position[2] + off[2] - piv[2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > r2) r2 = d2;
      }
      return Math.sqrt(r2) + 0.05;
    },
    [getFocusPoint],
  );

  /** World point on the work plane under (just above) the finger. Null only when there is no camera yet — a finger aimed past the horizon is answered by the limit, not by a miss (see dragPlanePoint). */
  const fingerOnPlane = useCallback(
    (absX: number, absY: number, planeY: number): Float3 | null => {
      const la = manipulator?.getLookAt();
      if (!la) return null;
      const [eye, center, up] = la;
      return dragPlanePoint(
        { eye, center, up },
        FOV_Y_DEG,
        winW,
        winH,
        absX,
        absY - FINGER_LIFT_DP,
        planeY,
      );
    },
    [manipulator, winW, winH],
  );

  const fingerOnCameraPlane = useCallback(
    (absX: number, absY: number, s: DragSession): Float3 | null => {
      const la = manipulator?.getLookAt();
      if (!la) return null;
      const [eye, center, up] = la;
      const anchor: Vec3 = [
        s.bakedPos[0] + s.base[0] + s.grabOffset[0],
        s.bakedPos[1] + s.base[1] + s.grabOffset[1],
        s.bakedPos[2] + s.base[2] + s.grabOffset[2],
      ];
      const f: Vec3 = [
        center[0] - eye[0],
        center[1] - eye[1],
        center[2] - eye[2],
      ];
      const fl = Math.hypot(f[0], f[1], f[2]) || 1;
      const fwd: Vec3 = [f[0] / fl, f[1] / fl, f[2] / fl];
      const r: Vec3 = [
        fwd[1] * up[2] - fwd[2] * up[1],
        fwd[2] * up[0] - fwd[0] * up[2],
        fwd[0] * up[1] - fwd[1] * up[0],
      ];
      const rl = Math.hypot(r[0], r[1], r[2]) || 1;
      const right: Vec3 = [r[0] / rl, r[1] / rl, r[2] / rl];
      const camUp: Vec3 = [
        right[1] * fwd[2] - right[2] * fwd[1],
        right[2] * fwd[0] - right[0] * fwd[2],
        right[0] * fwd[1] - right[1] * fwd[0],
      ];
      const dist = Math.hypot(
        anchor[0] - eye[0],
        anchor[1] - eye[1],
        anchor[2] - eye[2],
      );
      const metersPerPx =
        (2 * dist * Math.tan((FOV_Y_DEG * Math.PI) / 360)) / winH;
      const dx = (absX - s.startX) * metersPerPx;
      const dy = (absY - s.startY) * metersPerPx;
      const p: Float3 = [
        anchor[0] + right[0] * dx - camUp[0] * dy,
        anchor[1] + right[1] * dx - camUp[1] * dy,
        anchor[2] + right[2] * dx - camUp[2] * dy,
      ];
      return leashAlongRay(eye, center, eye as Float3, p);
    },
    [manipulator, winH],
  );

  /** Projects a world point to screen pixels (+ axial depth along the view axis). Used to match candidates by where the finger AIMS on screen. */
  const worldToScreen = useCallback(
    (w: Vec3): { x: number; y: number; depth: number } | null => {
      const la = manipulator?.getLookAt();
      if (!la) return null;
      const [eye, center, up] = la;
      const f: Vec3 = [center[0] - eye[0], center[1] - eye[1], center[2] - eye[2]];
      const fl = Math.hypot(f[0], f[1], f[2]) || 1;
      const fwd: Vec3 = [f[0] / fl, f[1] / fl, f[2] / fl];
      const r: Vec3 = [
        fwd[1] * up[2] - fwd[2] * up[1],
        fwd[2] * up[0] - fwd[0] * up[2],
        fwd[0] * up[1] - fwd[1] * up[0],
      ];
      const rl = Math.hypot(r[0], r[1], r[2]) || 1;
      const right: Vec3 = [r[0] / rl, r[1] / rl, r[2] / rl];
      const camUp: Vec3 = [
        right[1] * fwd[2] - right[2] * fwd[1],
        right[2] * fwd[0] - right[0] * fwd[2],
        right[0] * fwd[1] - right[1] * fwd[0],
      ];
      const d: Vec3 = [w[0] - eye[0], w[1] - eye[1], w[2] - eye[2]];
      const depth = d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2];
      if (!Number.isFinite(depth) || depth <= 0) return null;
      const tanV = Math.tan((FOV_Y_DEG * Math.PI) / 360);
      const tanH = tanV * (winW / winH);
      const ndcX = (d[0] * right[0] + d[1] * right[1] + d[2] * right[2]) / (depth * tanH);
      const ndcY = (d[0] * camUp[0] + d[1] * camUp[1] + d[2] * camUp[2]) / (depth * tanV);
      return { x: ((ndcX + 1) / 2) * winW, y: ((1 - ndcY) / 2) * winH, depth };
    },
    [manipulator, winW, winH],
  );

  // Read at HOOK level, not inside the gesture callback. The callback that sets the drag plane runs
  // from gesture-handler's event path, and reaching into the store from there was throwing on a
  // snapshot that had not resolved — a subscription here is resolved before any gesture can fire.
  const dragPlaneSetting = useGameStore((s) => s.settings.dragPlane);
  const partBoxes = useGameStore((s) => s.partBoxes);
  const furnitureForAnchors = useGameStore((s) => s.furniture);
  // Derived once per (furniture, boxes) rather than per drag frame: anchors are baked-pose geometry and cannot change while a furniture is loaded. Empty until the scene's harvest lands, and every consumer falls back to the visual-center clamp until it does. Frames ride along for the pickup-time facing derivation, which additionally depends on what is PLACED and so cannot be memoized here.
  const jointGeom = useMemo(() => {
    if (!furnitureForAnchors || !Object.keys(partBoxes).length)
      return { anchors: {} as Record<PartId, Vec3>, frames: null, liaisons: null };
    const liaisons = furnitureForAnchors.liaisons ?? {};
    const frames = deriveJointFrames(furnitureForAnchors.parts, liaisons, partBoxes);
    return { anchors: partAnchorOffsets(furnitureForAnchors.parts, liaisons, frames), frames, liaisons };
  }, [furnitureForAnchors, partBoxes]);
  const jointAnchors = jointGeom.anchors;

  /** A part is "floating": float releaseBehavior is ON (the canvas re-grab has no separate toggle — it comes with float mode), the part is held with no live drag session, and it isn't in a post-release park/snap phase that owns the driver (this also keeps re-grab out of auto-return's recover animation window). */
  const isFloating = useCallback(() => {
    const store = useGameStore.getState();
    return (
      store.settings.releaseBehavior === "float" &&
      !!store.heldActionId &&
      !session.current &&
      !store.orientationActionId &&
      store.fitState !== "nearCorrect" &&
      store.fitState !== "nearRotation"
    );
  }, []);

  const buildGesture = useCallback(
    (action: AssemblyAction, canvas = false) => {
      // Canvas variant: same drag session, no long-press and no pickup ring. Routing happens in plain-JS onStart (manualActivation's state manager only works in worklet callbacks, and our gating reads the JS store): floating part → re-grab it; otherwise fall back to the camera strafe callbacks (own toggle) or do nothing. canvasStarted: only a canvas gesture that actually began a DRAG may finalize one — a stray canvas touch during a live card drag must not steal its session.
      let canvasStarted = false;
      let canvasStrafing = false;
      let g = Gesture.Pan().runOnJS(true);
      g = canvas
        ? g.maxPointers(1).minDistance(10)
        : g.activateAfterLongPress(PICKUP_MS);
      g = g
        .onTouchesDown((e) => {
          if (canvas) return;
          const store = useGameStore.getState();
          if (store.heldActionId) {
            // Mid-drag or mid-orientation: ignore card touches entirely.
            if (session.current || store.orientationActionId) return;
            if (store.heldActionId !== action.actionId) {
              // A different part is floating (releaseBehavior "float"): put it back; a fresh long-press then picks this card's part.
              store.cancelHeld();
              return;
            }
            // This card's own part is floating — fall through so the pickup ring runs and onStart re-picks it (float-mode resume).
          }
          if (!store.available().some((a) => a.actionId === action.actionId)) {
            if (store.mode !== "free") return;
            // An untouched cluster's greyed cards don't run the pickup ring — beginPickup will refuse them anyway.
            const cluster = store.furniture ? actionCluster(store.furniture, action) : undefined;
            if (
              cluster &&
              store.furniture &&
              !clusterStarted(store.furniture, cluster, new Set(store.completed))
            ) {
              return;
            }
          }
          const t = e.allTouches[0];
          ringX.value = t.absoluteX;
          ringY.value = t.absoluteY;
          ringProgress.value = 0;
          ringProgress.value = withTiming(1, { duration: PICKUP_MS });
        })
        .onTouchesUp(() => {
          if (canvas) return;
          ringProgress.value = withTiming(0, { duration: 80 });
        })
        .onStart((e) => {
          if (canvas) {
            const st = useGameStore.getState();
            if (!(isFloating() && st.heldActionId === action.actionId)) {
              // Not a re-grab → camera strafe fallback (always on).
              if (onPanStart) {
                canvasStrafing = true;
                onPanStart(e.x, e.y);
              }
              return;
            }
            canvasStarted = true;
          }
          if (!action.partId) return;
          const store = useGameStore.getState();
          const furniture = store.furniture;
          if (!furniture) return;
          const part = furniture.parts[action.partId];
          // Drag plane at the action's OWN target height (her model): on-screen overlap with a socket then means genuine 3D proximity — a finger on a 2D screen cannot steer depth.
          const doneSet0 = new Set(store.completed);
          const ownTarget = targetPositionForAction(action, furniture.parts, doneSet0);
          // The finger owns the part's HOLD POINT — the visual center for compact parts, clamped near the snap origin for lengthy ones (a DALFRED leg is steered by its foot, not mid-shaft; see holdOffsetFor).
          const grabOffset = holdOffsetFor(part, jointAnchors);
          // The plane pins the hold point (what the finger holds), so anchor it at the socket's hold-point height — a plane whose height disagrees with the pinned point left tall parts (DALFRED legs: +0.27m center offset) vertically unreachable in level mode.
          // The plane sits at the PARK height for a part that enters along an axis, so the pin can
          // actually hover over its hole instead of being held at the depth it ends up at.
          const ownPark = parkShiftFor(part);
          const planeY = ownTarget[1] + grabOffset[1] + ownPark[1];
          // VERTICAL-ENTRY PARTS ONLY.
          //
          // A camera-facing plane fixes depth at the socket's own — which is what a part that drops
          // in from above needs, because no horizontal plane can express downward travel. But it
          // also pins the part to THAT depth while the finger is somewhere else on screen, so for an
          // ordinary part the two visibly separate: the part sits at the socket's distance while the
          // finger is at its own. Making this the default traded one problem for a worse one.
          //
          // So it stays scoped to parts authored to enter along a mostly-vertical axis — DALFRED's
          // support pin and pole, EKET's panels — where the gesture is impossible otherwise.
          // Everything else keeps the horizontal plane, which tracks the finger.
          const uprightAnchor: Vec3 | null =
            dragPlaneSetting !== "level" &&
            part.placeDir &&
            Math.abs(part.placeDir[1]) > 0.7
              ? [
                  ownTarget[0] + grabOffset[0] + ownPark[0],
                  planeY,
                  ownTarget[2] + grabOffset[2] + ownPark[2],
                ]
              : null;
          // Where the part materializes. Both spawn paths now answer every finger position the
          // pickup can happen at, so this is a no-camera guard and nothing more.
          //
          // It used to carry the horizon: a card's ray never reaches a work plane at the socket's
          // height under a near-level camera, fingerOnPlane returned null, and the part spawned at
          // the SOCKET — yards from the finger, until the first connecting ray teleported it there.
          // (The fallback before that put it on a camera-facing plane through the focus point, which
          // spawned it close to the lens and jumped just as badly.) fingerOnPlane takes the horizon
          // limit itself now, so the part starts under the finger and stays there.
          const socketStart: Float3 = [ownTarget[0], planeY, ownTarget[2]];
          // EXPERIMENT (drag-no-plane): adaptive spawns on the ray just in front of the model instead of on the work plane; level keeps the plane as the comparison engine.
          const modelR = assemblyRadius(furniture);
          // What the carry has to clear so no end of this part crosses the lens. Measured from the HOLD point, which since joint anchors is the part's joint at one END of it: a LACK leg held at its top reaches its full 0.40 m downward, and at the 0.65 m zoom floor the other carry floors land near 0.29 m — which put that foot end behind the camera.
          const holdReach = holdReachFrom(useGameStore.getState().partBoxes[action.partId], [
            part.pose.position[0] + grabOffset[0],
            part.pose.position[1] + grabOffset[1],
            part.pose.position[2] + grabOffset[2],
          ]);
          const visualStart = uprightAnchor
            ? (fingerOnCameraPlaneAt(e.absoluteX, e.absoluteY, uprightAnchor) ?? socketStart)
            : dragPlaneSetting === "level"
              ? (fingerOnPlane(e.absoluteX, e.absoluteY, planeY) ?? socketStart)
              : (fingerOnRay(e.absoluteX, e.absoluteY, modelR, holdReach) ?? socketStart);
          const base: Float3 = [
            visualStart[0] - grabOffset[0] - part.pose.position[0],
            visualStart[1] - grabOffset[1] - part.pose.position[1],
            visualStart[2] - grabOffset[2] - part.pose.position[2],
          ];
          heldDriver.set(base);
          // A component lead's siblings start riding from the same offset the instant it's picked up, so there's no pop between grab and the first drag frame.
          if (hasRidingBodies(furniture, action.partId)) slideDriver.set(base);
          store.beginPickup(action.actionId);
          if (useGameStore.getState().heldActionId !== action.actionId) return;
          // A WRONG part still picks up and drags — taking the part away was worse than the
          // mistake — but the toast arrives NOW, as the drag begins, not seconds later when the
          // fly-back lands. (The sound is the audio layer's call: useAssemblySfx plays the error
          // cue instead of the pickup cue for a blocked pickup, so the two never stack.)
          if (!store.available().some((a) => a.actionId === action.actionId)) {
            store.noteBlocked(action.actionId);
          }
          Haptics.selectionAsync();
          if (!canvas) ringProgress.value = withTiming(0, { duration: 120 });

          const nextStore = useGameStore.getState();
          const avail = actionsForClusterFocus(
            furniture,
            nextStore.available(),
            nextStore.activeCluster,
          );
          const doneSet = new Set(nextStore.completed);
          const allCandidates = groupCandidates(
            avail,
            action,
            furniture.parts,
            doneSet,
            jointAnchors,
          );
          const rawCandidates = selectFirstDrop(nextStore)
            ? allCandidates.filter((c) => c.action.actionId === action.actionId)
            : allCandidates;
          // Match against the PARK pose, not the seated one, for any part that parks before it is
          // driven home. A candidate's position is where the part ends up AFTER the drive — for
          // DALFRED's support pin that is down inside circleUpp's hole, so the fit only went green
          // once the pin was already through the socket, when the whole point is that it enters from
          // above. Backing the match point off along the authored placeDir puts the green where the
          // part is genuinely ready to be released: hovering, lined up, about to drop in.
          const candidates = rawCandidates.map((c) => {
            const cPart = furniture.parts[c.action.partId!];
            const dir = cPart?.placeDir;
            const back = cPart?.parkBackoff ?? 0;
            // seatVisual is the candidate's FLUSH pose — the hole the player can actually see. For inserts, position/holdPosition are already the loose pose proud of the hole, so without this the whole match segment floats out along the screw axis and zoomed in it projects off-screen while the hole sits centered (measured: aim stuck at 0.167 with the finger dead on the hole).
            // The joint anchor IS the visible hole, so it replaces the visual center here as well as in holdPosition — a segment measured anchor-to-visual-center would not describe any real approach line.
            const off = (cPart && jointAnchors[cPart.partId]) ?? cPart?.visualCenterOffset ?? [0, 0, 0];
            const seatVisual: Vec3 = cPart
              ? [
                  cPart.pose.position[0] + off[0],
                  cPart.pose.position[1] + off[1],
                  cPart.pose.position[2] + off[2],
                ]
              : c.holdPosition;
            // matchVisual only — position and holdPosition stay AS AUTHORED. The release path
            // applies the park offset itself, so shifting the real position here parked the part
            // twice: the pin jumped a further 12cm up on release and had to be slid all the way back
            // down. Matching and placing are two different questions about the same socket.
            if (!dir || !back) return { ...c, matchVisual: c.holdPosition, seatVisual };
            const shift: Vec3 = [-dir[0] * back, -dir[1] * back, -dir[2] * back];
            return {
              ...c,
              matchVisual: [
                c.holdPosition[0] + shift[0],
                c.holdPosition[1] + shift[1],
                c.holdPosition[2] + shift[2],
              ] as Vec3,
              seatVisual,
            };
          });
          // Facing gate data (layer 1 of socket visibility): the direction each candidate's bench contact looks out of, from the joint frames and what is currently placed. A socket facing away from the camera is hidden by its own receiver — DALFRED's back-leg spots from a front view — and must not be acquirable however close the aim gets in pixels.
          // Occluders must be parts actually STANDING at their baked pose. A placed part whose cluster is not yet combined renders stashed off to the side, but its harvested box sits at the assembled pose — on EKET that put a phantom drawerFront across the cabinet's open face and blocked the stabilizer rod from the very view that plainly shows its spot (probe: occ=drawerFront_1 with the cabinet visibly open). Un-combined cluster parts are therefore not occluders; seed-cluster and cluster-less parts are. Known residual gap, same family: hardware fitted onto a STAGED carrier renders at the stage offset while its box stays baked — accept until it bites, the staged window is short.
          const combinedClusters = new Set(
            furniture.actions
              .filter((a) => a.type === "combineClusters" && a.cluster && doneSet.has(a.actionId))
              .map((a) => a.cluster!),
          );
          const atBakedPose = (pid: PartId): boolean => {
            const cl = furniture.parts[pid]?.cluster;
            if (!cl) return true;
            return !!furniture.clusters?.[cl]?.seed || combinedClusters.has(cl);
          };
          const placedSet = new Set<PartId>(
            furniture.actions
              .filter((a) => a.type === "placePart" && a.partId && doneSet.has(a.actionId))
              .map((a) => a.partId!)
              .filter(atBakedPose),
          );
          const liaisonMap = furniture.liaisons ?? {};
          const candidatesWithFacing = candidates.map((c) => {
            // The candidate's RECEIVERS (liaison partners) are exempt from the occlusion gate: the seat anchor is clamped INTO the receiver's box, so every legitimate sightline ends inside it — treating the receiver as an occluder blocks all its own sockets from any angle (measured: the steep-camera approach crosses 5.5cm of DALFRED's plate to reach a rim anchor).
            const receiverIds = new Set<PartId>();
            for (const l of Object.values(liaisonMap)) {
              if (l.a === c.action.partId) receiverIds.add(l.b);
              if (l.b === c.action.partId) receiverIds.add(l.a);
            }
            // FASTENER visibility is measured against the seated part's own GEOMETRY (the user's rule): sample the fastener's baked box surface, discard samples buried inside placed geometry, and per frame require >=30% of the exposed remainder to have a clear line of sight. Face heuristics were falsified twice on EKET's cam lock — arrival direction (-engageDir) points along the panel and blocked legitimate views of the bore face; nearest-receiver-face picked the interior face and allowed assembling the rear cam THROUGH the panel from the front. Sampling makes the receiver a legitimate occluder of the fastener's buried side, which is the physical truth both heuristics missed. Structural parts keep the anchor line-of-sight test.
            const cPart2 = c.action.partId ? furniture.parts[c.action.partId] : undefined;
            let visSamples: Vec3[] | null = null;
            {
              // Structural parts sample a HALO around the seat anchor (the socket neighborhood — "the target pos geometry"); fasteners sample their own seated box, which is the same idea at their scale. No receiver exemptions anywhere in sampling: burial replaces them — samples inside placed geometry drop at pickup, and the receiver hiding its own socket is then honest occlusion of the exposed remainder (a plate DOES hide its underside leg sockets from above; the old exempt-the-receiver line-of-sight said it couldn't, which let legs snap through plates and screws through panels).
              const H = 0.025;
              const halo: PartBox = {
                min: [c.seatVisual[0] - H, c.seatVisual[1] - H, c.seatVisual[2] - H],
                max: [c.seatVisual[0] + H, c.seatVisual[1] + H, c.seatVisual[2] + H],
              };
              const inside = (pt: Vec3, bx: { min: Vec3; max: Vec3 }) =>
                pt[0] >= bx.min[0] && pt[0] <= bx.max[0] &&
                pt[1] >= bx.min[1] && pt[1] <= bx.max[1] &&
                pt[2] >= bx.min[2] && pt[2] <= bx.max[2];
              const exposedOf = (bx: PartBox) =>
                boxSurfaceSamples(bx).filter((pt) => {
                  for (const pid of placedSet) {
                    const ob = partBoxes[pid];
                    if (ob && inside(pt, ob)) return false;
                  }
                  return true;
                });
              // Fasteners sample their seated box — but a FLUSH/countersunk fastener's box is fully inside its receiver, every sample buries, and a null here used to fall back to the exemption-based test whose transparent receivers were the very hole (user: "the screw still snaps when hidden"). The anchor halo is the retry: a countersunk head's halo still pokes out of the entry face.
              const fb = cPart2?.type === "fastener" ? partBoxes[cPart2.partId] : null;
              let exposed = fb ? exposedOf(fb) : [];
              if (!exposed.length) exposed = exposedOf(halo);
              visSamples = exposed.length ? exposed : null;
            }
            return {
              ...c,
              visSamples,
              receiverIds,
            };
          });
          // DEV pickup probe: one line per pickup with the first candidate's WORLD anchors, to catch an anchor landing in the wrong space (a seat that projects fine can still sit centimetres from the LENS — band collapse, unmatched drags).
          if (__DEV__ && candidates[0]) {
            const c0 = candidates[0];
            const j = jointAnchors[c0.action.partId!];
            console.log(
              `[pickup] ${c0.action.actionId} pos=${c0.position.map((v) => v.toFixed(3)).join(",")} hold=${c0.holdPosition.map((v) => v.toFixed(3)).join(",")} seat=${c0.seatVisual.map((v) => v.toFixed(3)).join(",")} match=${c0.matchVisual.map((v) => v.toFixed(3)).join(",")} anchor=${j ? j.map((v) => v.toFixed(3)).join(",") : "none"} BUILD=noplane17`,
            );
          }
          const groupIds = new Set(candidates.map((c) => c.action.actionId));
          const otherSockets = avail
            .filter(
              (a) => a.partId && isPickupType(a.type) && !groupIds.has(a.actionId),
            )
            .map((a) => targetPositionForAction(a, furniture.parts, doneSet));
          session.current = {
            base,
            candidates: candidatesWithFacing,
            otherSockets,
            bakedPos: part.pose.position,
            bakedRot: part.pose.rotation,
            grabOffset,
            planeY,
            basePlaneY: planeY,
            uprightAnchor,
            matchedActionId: null,
            hoverLift: 0,
            depthBlend: 0,
            depthTarget: null,
            startX: e.absoluteX,
            startY: e.absoluteY,
            blockedStamp: 0,
            modelR,
            holdReach,
            placedIds: placedSet,
          };
        })
        .onUpdate((e) => {
          if (canvas && canvasStrafing) {
            onPanMove?.(e.x, e.y);
            return;
          }
          const s = session.current;
          const store = useGameStore.getState();
          const furniture = store.furniture;
          if (!s || !furniture || store.heldActionId !== action.actionId)
            return;
          // Exact per-frame projection onto the (dynamic) horizontal drag plane — absolute mapping, so the part cannot drift from the finger. The camera-plane delta math is no longer the horizon's fallback (fingerOnPlane takes that limit itself); what is left for it is the upright path's own miss, an anchor gone behind the lens.
          // EXPERIMENT (drag-no-plane): adaptive rides the ray at cap depth every frame — no plane, no grazing pathologies; the socket blend below still owns delivery depth. Level keeps the plane.
          let p = s.uprightAnchor
            ? (fingerOnCameraPlaneAt(e.absoluteX, e.absoluteY, s.uprightAnchor) ??
              fingerOnCameraPlane(e.absoluteX, e.absoluteY, s))
            : store.settings.dragPlane === "level"
              ? (fingerOnPlane(e.absoluteX, e.absoluteY, s.planeY) ??
                fingerOnCameraPlane(e.absoluteX, e.absoluteY, s))
              : (fingerOnRay(e.absoluteX, e.absoluteY, s.modelR, s.holdReach) ??
                fingerOnCameraPlane(e.absoluteX, e.absoluteY, s));
          let nearest = s.candidates[0];
          let bestD = Infinity;
          let target: (GroupCandidate & { matchVisual: Vec3 }) | null = null;
          // Socket-depth policy staging: the matched socket's nearest point on the finger's ray, plus the aim distance the blend weight rides on (set in the adaptive branch below, applied once snapDist is known).
          let depthAim: { d: number } | null = null;
          // The finger's ray this frame, kept so the depth blend can recompute its socket point on the CURRENT ray even on frames where nothing is matched and the blend is easing back out.
          let frameRay: { eye: Vec3; dir: Vec3 } | null = null;
          // Pixel cap on the whole aim-band family (see aimBandScale): 1 at bench range, shrinking zoomed-in so match/magnet/snap never span a third of the screen. Level mode keeps 1 — its bands are true 3D distances, part of the demo contract.
          let band = 1;
          // The slerp-rotated grab anchor of this frame, for the probe: with hold-point pinning the visual center rides at grabOffset only while unrotated.
          let probeAnchor: Vec3 | null = null;
          // Whether the aim is parked on a facing-blocked socket with nothing matchable — drives the "Try turning the camera" chip.
          let aimBlockedNow = false;
          // Which placed part's box blocked the nearest skipped candidate — probe-only, names the occluder in one log line.
          let blockedBy: PartId | null = null;
          // Visible/total sample count of the winning candidate — probe-only, so an "arms while hidden" report carries its own numbers.
          let nearestVis = "-";
          // Per-profile acceptance radius; also the magnet's full-strength point so "looks seated" and "is accepted" stay the same distance. Read before the matcher because the crowding cap below is expressed against it.
          const snapDist = Math.min(
            SNAP_DIST_MAX,
            Math.max(SNAP_DIST_MIN, store.settings.snapDistance),
          );
          // Aim distance to the matched socket's PARK POINT — what the visible magnet ramps ride on. Defaults to bestD (level mode measures true 3D distance and keeps it).
          let pullD = Infinity;
          if (store.settings.dragPlane === "level") {
            // "level" — the on-release engine's mechanism, kept for comparison/demo: plane FIXED at the session target's height, candidates matched by TRUE 3D distance, no hysteresis. Depth can hide a socket here — the multi-height blind spot (wool stool two-height legs, DALFRED screw105251) is intentional to demonstrate.
            s.planeY = s.basePlaneY;
            const offB = heldDriver.value;
            const dragX = p?.[0] ?? s.bakedPos[0] + offB[0] + s.grabOffset[0];
            const dragY = p?.[1] ?? s.bakedPos[1] + offB[1] + s.grabOffset[1];
            const dragZ = p?.[2] ?? s.bakedPos[2] + offB[2] + s.grabOffset[2];
            for (const c of s.candidates) {
              const d = Math.hypot(
                dragX - c.matchVisual[0],
                dragY - c.matchVisual[1],
                dragZ - c.matchVisual[2],
              );
              if (d < bestD) {
                bestD = d;
                nearest = c;
              }
            }
            if (nearest && bestD <= APPROACH_RADIUS_M) target = nearest;
            s.matchedActionId = target?.action.actionId ?? null;
          } else {
            // "adaptive" — candidate matching in SCREEN space: the finger's aim is 2D, so depth must never hide a socket. Distances are converted back to world meters at the candidate's depth so the approach/snap radii keep their meaning.
            const fingerPx = { x: e.absoluteX, y: e.absoluteY - FINGER_LIFT_DP };
            // Aim is measured to the SEGMENT hole→park, not the park point alone: zoomed in, the park hover pose can project off-screen while the hole is visibly centered — the player aims at what they can see, so any point on the approach line counts (pointToSegmentPx's rationale).
            const distPx = (c: GroupCandidate & { matchVisual: Vec3; seatVisual?: Vec3 }) => {
              const spA = worldToScreen(c.seatVisual ?? c.holdPosition);
              const spB = worldToScreen(c.matchVisual);
              const one = spA ?? spB;
              if (!one) return { px: Infinity, mPerPx: 1, inFrame: false, nearFrame: false };
              const a = spA ?? one;
              const b = spB ?? one;
              const inFrame = segmentInFrame(a.x, a.y, b.x, b.y, winW, winH, 0);
              const nearFrame = inFrame || segmentInFrame(a.x, a.y, b.x, b.y, winW, winH, HOLD_OFFSCREEN_MARGIN_PX);
              if (!spA || !spB) {
                return {
                  px: Math.hypot(fingerPx.x - one.x, fingerPx.y - one.y),
                  mPerPx: (2 * one.depth * Math.tan((FOV_Y_DEG * Math.PI) / 360)) / winH,
                  inFrame,
                  nearFrame,
                };
              }
              const seg = pointToSegmentPx(fingerPx.x, fingerPx.y, spA.x, spA.y, spB.x, spB.y);
              const depth = spA.depth + (spB.depth - spA.depth) * seg.u;
              return {
                px: seg.px,
                mPerPx: (2 * depth * Math.tan((FOV_Y_DEG * Math.PI) / 360)) / winH,
                inFrame,
                nearFrame,
              };
            };
            let nearestPx = Infinity;
            let nearestMPerPx = 1;
            // Occlusion gate (layer 1 of socket visibility): a socket whose line of sight from the camera passes through another PLACED part's box is hidden — DALFRED's back-leg spots behind the plate from a front view — and is skipped for acquisition exactly like an off-frame one. The receiver excludes itself for free: the anchor is clamped INTO the receiver's box, so its own slab never spans the segment interior past the margin. The nearest skipped-px is remembered so the chip can say WHY nothing matches ("Try turning the camera") instead of hunting silently — the off-frame gate shipped silent and read as a bug.
            const laF = manipulator?.getLookAt();
            const occludedOf = (c: (typeof s.candidates)[number]): PartId | null => {
              if (!laF) return null;
              for (const pid of s.placedIds) {
                if (pid === c.action.partId || c.receiverIds.has(pid)) continue;
                const bx = partBoxes[pid];
                if (!bx) continue;
                // A box CONTAINING the seat anchor is the destination's home, not an obstacle — EKET's stabilizer rod anchors AT its bridging dowel's box center, so without this the placed dowel self-occludes the rod from every camera and the part is unplaceable.
                const e2 = 0.005;
                if (
                  c.seatVisual[0] >= bx.min[0] - e2 && c.seatVisual[0] <= bx.max[0] + e2 &&
                  c.seatVisual[1] >= bx.min[1] - e2 && c.seatVisual[1] <= bx.max[1] + e2 &&
                  c.seatVisual[2] >= bx.min[2] - e2 && c.seatVisual[2] <= bx.max[2] + e2
                )
                  continue;
                if (segmentHitsBox(laF[0], c.seatVisual, bx)) return pid;
              }
              return null;
            };
            let blockedPx = Infinity;
            for (const c of s.candidates) {
              const d = distPx(c);
              // A socket the player cannot SEE cannot be aimed at — off-frame candidates are skipped for acquisition (a snap must never be earned against an invisible hole; measured: a seat at y=-88 was still inside the capture band near the top edge). The CURRENT match is not acquired here either — it is held through the more generous nearFrame test below, so a mid-drag orbit that nudges the socket just past the edge does not pop the magnet.
              if (!d.inFrame) continue;
              // Visibility gate: >=30% of the exposed seated-geometry samples must be in clear sight.
              let visStat: string | null = null;
              if (c.visSamples && laF) {
                let vis = 0;
                let blocker: PartId | null = null;
                for (const pt of c.visSamples) {
                  let hit: PartId | null = null;
                  for (const pid of s.placedIds) {
                    if (pid === c.action.partId) continue;
                    const bx = partBoxes[pid];
                    const segLen = Math.hypot(pt[0] - laF[0][0], pt[1] - laF[0][1], pt[2] - laF[0][2]) || 1;
                    if (bx && segmentHitsBox(laF[0], pt, bx, SAMPLE_HIT_MARGIN_M / segLen)) {
                      hit = pid;
                      break;
                    }
                  }
                  if (hit) blocker = hit;
                  else vis++;
                }
                visStat = `${vis}/${c.visSamples.length}`;
                if (vis / c.visSamples.length < VIS_FRACTION_MIN) {
                  if (d.px < blockedPx) {
                    blockedPx = d.px;
                    blockedBy = blocker ?? c.action.partId ?? null;
                  }
                  continue;
                }
                // Sampling answered visibility outright; the anchor line-of-sight test in the other branch is for structural parts.
              } else {
                const occ = occludedOf(c);
                if (occ) {
                  if (d.px < blockedPx) {
                    blockedPx = d.px;
                    blockedBy = occ;
                  }
                  continue;
                }
              }
              if (d.px < nearestPx) {
                nearestPx = d.px;
                nearestMPerPx = d.mPerPx;
                nearest = c;
                nearestVis = visStat ?? "-";
              }
            }
            bestD = nearestPx * nearestMPerPx; // world-equivalent aim distance
            band = aimBandScale(nearestMPerPx, APPROACH_RADIUS_M);
            // Crowding cap, measured in WORLD metres. Its job: the acceptance radius must never span two sibling sockets, or a near-miss seats into the wrong hole ("I can only snap on the two at the back", measured on DALFRED at the zoom floor). The first cut measured the gap in PIXELS, which is azimuth-dependent: from the home framing two of DALFRED's four leg anchors project nearly on top of each other (depth-aligned pair, ~12 px apart while 15 cm apart in world), so the band was crushed to 0.13 at any zoom and nothing could match or seat at all — the "totally not work" regression. Pixel-coincident-but-depth-separated siblings are exactly what screen-space matching plus hysteresis already tolerate; the seating hazard the cap exists for lives in world space, so the gap is measured there.
            if (nearest && snapDist > 0) {
              let gapM = Infinity;
              for (const c of s.candidates) {
                if (c.action.actionId === nearest.action.actionId) continue;
                const g = Math.hypot(
                  c.matchVisual[0] - nearest.matchVisual[0],
                  c.matchVisual[1] - nearest.matchVisual[1],
                  c.matchVisual[2] - nearest.matchVisual[2],
                );
                if (g < gapM) gapM = g;
              }
              if (Number.isFinite(gapM)) {
                band = Math.min(band, gapM / (2 * snapDist));
              }
            }

            const current = s.candidates.find(
              (c) => c.action.actionId === s.matchedActionId,
            );
            // The hold test runs on the current match's OWN scale and band: when the only in-approach socket is the held one and every rival is off-frame, the loop above never set nearestMPerPx, and judging the hold by a defaulted scale would drop a perfectly on-screen match.
            // The current match keeps its own laxer facing threshold: acquisition needs the socket clearly presented, but a match already in hand survives a grazing angle so an orbit through edge-on does not strobe the magnet.
            const currentD = current ? distPx(current) : null;
            const currentPx = currentD?.nearFrame ? currentD.px : Infinity;
            const currentBand = currentD
              ? aimBandScale(currentD.mPerPx, APPROACH_RADIUS_M)
              : band;
            if (
              current &&
              currentD &&
              currentPx * currentD.mPerPx <= APPROACH_RADIUS_M * currentBand
            ) {
              target = nearestPx + SWITCH_MARGIN_PX < currentPx ? nearest : current;
            } else if (nearest && bestD <= APPROACH_RADIUS_M * band) {
              target = nearest;
            }
            s.matchedActionId = target?.action.actionId ?? null;
            // The chip's "turn the camera" case: nothing matched, and the closest thing to the finger was a blocked socket within chip-worthy aim range. Debounced asymmetrically — ON immediately, OFF only after 300ms clear of every trigger — because the raw condition rides three sharp edges (the 160px rim, match acquisition, grazing sightlines) and read as flicker on device. A real match still silences it the same frame: fit language outranks coaching.
            const rawBlocked = !target && blockedPx <= AIM_BAND_MAX_PX;
            if (rawBlocked) s.blockedStamp = Date.now();
            aimBlockedNow = !target && (rawBlocked || Date.now() - s.blockedStamp < 300);
            // The SEGMENT distance owns matching only. The VISIBLE pulls (magnet position, rotation ease, fit) measure to the park point itself: on-device, letting the magnet feed on the segment turned the whole hole→park corridor into a capture zone — the screw leapt to the socket the moment the finger crossed the corridor and stayed there while the finger travelled ("it does not ride my finger", phone screenshot with Drop it! stuck on). Screen-invisible consumers (depth blend) keep the segment aim.
            if (target) {
              const spT = worldToScreen(target.matchVisual);
              pullD = spT
                ? Math.hypot(fingerPx.x - spT.x, fingerPx.y - spT.y) *
                  ((2 * spT.depth * Math.tan((FOV_Y_DEG * Math.PI) / 360)) / winH)
                : Infinity;
            }
            // Ease the drag plane toward the matched socket's height (multi-height groups); slides the part ALONG the finger's view ray, so it is invisible on screen. Same hold-point anchoring as the session plane.
            const wantY = target
              ? target.position[1] +
                s.grabOffset[1] +
                parkShiftFor(furniture.parts[target.action.partId!])[1]
              : s.basePlaneY;
            // Only the horizontal plane has a height to ease. On the upright plane the finger owns
            // world-Y directly, and moving the plane under it would fight the drag.
            if (!s.uprightAnchor) s.planeY += (wantY - s.planeY) * 0.25;
            // Socket-depth policy — the second half of the on-ray contract: the plane owns depth only while it is trustworthy. Near a matched socket the depth eases to the point on the finger's RAY nearest that socket — screen-invisible (movement along the ray never moves the part on screen), but it swaps a grazing plane's metres-per-pixel runaway for the socket's own depth, so the snap window is pixels of AIM rather than pixels of tremor. The aim distance is recomputed for the CHOSEN target (hysteresis can keep `current` while bestD measured the rival). Upright parts skip it: their anchor already pins depth.
            if (!s.uprightAnchor) {
              const la = manipulator?.getLookAt();
              if (la) {
                frameRay = screenRay(
                  { eye: la[0], center: la[1], up: la[2] },
                  FOV_Y_DEG,
                  winW,
                  winH,
                  e.absoluteX,
                  e.absoluteY - FINGER_LIFT_DP,
                );
              }
              if (target) {
                const dT = distPx(target);
                depthAim = { d: dT.px * dT.mPerPx };
                s.depthTarget = target.matchVisual;
              }
            }
          }

          // Level mode (and any path that didn't set a park-point pull) keeps the classic single distance for the ramps.
          if (!Number.isFinite(pullD)) pullD = bestD;
          if (p) {
            // The depth blend eases over TIME toward the aim-derived weight instead of taking it outright each frame. Taking it outright made depth a direct function of where the finger IS, and near a socket that function is steep and non-monotonic — measured on a zoomed DALFRED leg the depth ran 0.120 -> 0.462 -> 0.120 m as the aim crossed the socket band. Since the part's body hangs off the carry point by a fixed WORLD offset (a leg's whole length, now that the hold point is its real joint) and its screen offset is that over depth, a depth moving that fast moved the body faster than the finger — and backwards on the way out of the band, at a measured gain of -0.30. Easing decouples depth from the aim's moment-to-moment value, so it can no longer race the finger.
            const wantBlend = DEPTH_BLEND_ENABLED && depthAim
              ? Math.max(
                  0,
                  Math.min(
                    1,
                    (APPROACH_RADIUS_M * band - depthAim.d) /
                      ((APPROACH_RADIUS_M - snapDist) * band),
                  ),
                )
              : 0;
            s.depthBlend += (wantBlend - s.depthBlend) * DEPTH_BLEND_EASE;
            if (s.depthBlend <= DEPTH_BLEND_EPS) {
              s.depthBlend = 0;
              s.depthTarget = null;
            } else if (s.depthTarget && frameRay) {
              // The socket point is recomputed on THIS frame's ray, never remembered from the last one: a stale point belongs to the ray the finger was on a frame ago, and blending toward it would slide the part off the finger — the one invariant the whole on-ray design exists to hold.
              const q = rayPointNearest(frameRay.eye, frameRay.dir, s.depthTarget);
              p = [
                p[0] + (q[0] - p[0]) * s.depthBlend,
                p[1] + (q[1] - p[1]) * s.depthBlend,
                p[2] + (q[2] - p[2]) * s.depthBlend,
              ];
            }
            // Magnetic snap: once a socket is matched, the part eases toward it as it approaches (no match = it stays pinned under the finger, t = 0). Fit feedback (color states) is independent of the pull.
            const magnetic = !!target;
            // Rotation factor: eases over the whole approach band (the gradual turn toward the socket's orientation).
            const rotT = magnetic
              ? Math.max(
                  0,
                  Math.min(
                    1,
                    (APPROACH_RADIUS_M * band - pullD) /
                      ((APPROACH_RADIUS_M - snapDist) * band),
                  ),
                )
              : 0;
            // Position factor: a much tighter band so the part stays under the finger (responsive control) and only commits to the socket when genuinely close.
            const posT = magnetic
              ? Math.max(
                  0,
                  Math.min(
                    1,
                    (POS_PULL_START_M * band - pullD) /
                      ((POS_PULL_START_M - POS_PULL_FULL_M) * band),
                  ),
                )
              : 0;
            // DEV rotation probe (one-shot per target change): whether there is any rotation to magnetize AT ALL — flat-node GLBs bake identity on every part, making the slerp a structural no-op.
            if (__DEV__ && target && s.matchedActionId !== lastRotLogId) {
              lastRotLogId = s.matchedActionId;
              console.log(
                `[rot] tgt=${target.action.actionId} rotT=${rotT.toFixed(2)} bakedRot=${s.bakedRot.map((v) => v.toFixed(3)).join(",")} targetRot=${target.rotation.map((v) => v.toFixed(3)).join(",")}`,
              );
            }
            // No hover-lift: the part eases straight to the socket so there's no vertical "drop" on release — it just moves to where it should rest (the loose state for screws/legs is still applied on release).
            s.hoverLift = 0;
            // Hold-point-pinned rotation. The driver composes T·R about the NODE ORIGIN (native updateTransform is new*current), and the node origin is not the hold point — a DALFRED leg's origin is its FOOT, 0.43 m from the held joint. Rotating about the origin swept the joint and the whole body away from the finger in an arc, which read as "the part is not magnetic to the rotation" while the probe swore gapPx=0 (it measures intent, not the entity). Pinning: the magnet pulls the JOINT toward the socket's holdPosition, and the node position is re-aimed through the slerp-rotated anchor so the joint stays exactly where the drag put it at every rotT. At rotT=0 the delta is identity and this is byte-for-byte the old translation.
            const rotQ = target
              ? quatSlerp(s.bakedRot, target.rotation, rotT)
              : s.bakedRot;
            const gRot = quatRotateVec3(
              quatMultiply(rotQ, quatConjugate(s.bakedRot)),
              s.grabOffset,
            );
            const holdT: Vec3 = target
              ? [
                  p[0] + (target.holdPosition[0] - p[0]) * posT,
                  p[1] + (target.holdPosition[1] - p[1]) * posT,
                  p[2] + (target.holdPosition[2] - p[2]) * posT,
                ]
              : p;
            probeAnchor = gRot;
            heldDriver.setPose(
              [
                holdT[0] - gRot[0] - s.bakedPos[0],
                holdT[1] - gRot[1] - s.bakedPos[1],
                holdT[2] - gRot[2] - s.bakedPos[2],
              ],
              rotQ,
            );
            // Mirror the held lead's live world-space offset onto its riding siblings every drag frame, so the whole slide moves as one object in hand.
            if (hasRidingBodies(furniture, action.partId)) slideDriver.set(heldDriver.value);
          }
          const off = heldDriver.value;
          const held: Vec3 = [
            s.bakedPos[0] + off[0],
            s.bakedPos[1] + off[1] - s.hoverLift,
            s.bakedPos[2] + off[2],
          ];
          // Acceptance under the no-plane carry measures the PLAYER's error — 2D aim to the delivery point — not the transient world distance. The depth glide is SYSTEM-owned and finishes on its own clock; judging fit on the world gap meant a release with the finger dead on the socket bounced back to the tray purely because the glide had frames left (emulator run: 3 px of aim, 0.3 m of unfinished depth, fit stuck at held). Level mode and upright parts keep computeFit: their held depth is real, not a glide in progress.
          const fs =
            target && depthAim
              ? // Acceptance arms on the SEGMENT aim (depthAim.d): the player aims at the HOLE they can see, and the park/stage delivery pose sits a fixed world offset from it along the part's axis — measuring the green to the delivery point (pullD) made that offset the required aim error, negligible zoomed out and 100+px zoomed in ("must aim lower than the target to snap"). The MAGNET stays on pullD: position pull keyed to the segment is the corridor-capture regression; a state flag keyed to it is not, and the release animation carries the part in from wherever it visually hovers.
                depthAim.d <= snapDist * band
                ? "nearCorrect"
                : depthAim.d <= snapDist * band * APPROACH_FACTOR
                  ? "approaching"
                  : "held"
              : target
                ? computeFit(
                    held,
                    target.rotation,
                    { position: target.position, rotation: target.rotation },
                    s.otherSockets,
                    { distance: snapDist * band, angleDeg: 25 },
                  )
                : "held";
          if (
            fs !== store.fitState ||
            s.matchedActionId !== store.matchedActionId
          )
            store.setDragFit(fs, s.matchedActionId);
          if (aimBlockedNow !== store.aimBlocked) store.setAimBlocked(aimBlockedNow);
          // DEV drag probe (throttled): one line per ~quarter second into the Metro console, enough to reconstruct which mechanism owns the part when it separates from the finger. gapPx is the user-facing invariant — the held part's visual center vs the touch, on screen.
          if (__DEV__ && Date.now() - lastDragLog > 250) {
            lastDragLog = Date.now();
            const pa = probeAnchor ?? s.grabOffset;
            const heldVisual: Vec3 = [
              held[0] + pa[0],
              held[1] + pa[1],
              held[2] + pa[2],
            ];
            const hp = worldToScreen(heldVisual);
            const gapPx = hp
              ? Math.hypot(hp.x - e.absoluteX, hp.y - (e.absoluteY - FINGER_LIFT_DP)).toFixed(0)
              : "offscreen";
            // Zoom and carry depth, so an on-device report says WHICH zoom it happened at instead of leaving it to be guessed — the clearance floor is a function of both, and the last round of reports could not be reproduced without them.
            const la2 = manipulator?.getLookAt();
            const camDist = la2
              ? Math.hypot(la2[1][0] - la2[0][0], la2[1][1] - la2[0][1], la2[1][2] - la2[0][2])
              : 0;
            const carryDepth =
              la2 && p
                ? (() => {
                    const fx = la2[1][0] - la2[0][0], fy = la2[1][1] - la2[0][1], fz = la2[1][2] - la2[0][2];
                    const fl = Math.hypot(fx, fy, fz) || 1;
                    return (((p[0] - la2[0][0]) * fx + (p[1] - la2[0][1]) * fy + (p[2] - la2[0][2]) * fz) / fl).toFixed(3);
                  })()
                : "?";
            const nSeat = nearest?.seatVisual ? worldToScreen(nearest.seatVisual) : null;
            const nPark = nearest?.matchVisual ? worldToScreen(nearest.matchVisual) : null;
            console.log(
              `[drag] f=(${e.absoluteX.toFixed(0)},${e.absoluteY.toFixed(0)}) part=(${hp ? `${hp.x.toFixed(0)},${hp.y.toFixed(0)}` : "?"}) gapPx=${gapPx} p=${p ? p.map((v) => v.toFixed(2)).join(",") : "null"} plane=${s.planeY.toFixed(2)} upright=${!!s.uprightAnchor} aim=${Number.isFinite(bestD) ? bestD.toFixed(3) : "inf"} pull=${Number.isFinite(pullD) ? pullD.toFixed(3) : "inf"} band=${band.toFixed(2)} cam=${camDist.toFixed(3)} reach=${s.holdReach.toFixed(3)} carry=${carryDepth} blend=${s.depthBlend.toFixed(2)} tgt=${s.matchedActionId ?? "-"} blk=${aimBlockedNow ? 1 : 0} occ=${blockedBy ?? "-"} vis=${nearestVis} near=${nearest?.action.actionId ?? "-"} seat=(${nSeat ? `${nSeat.x.toFixed(0)},${nSeat.y.toFixed(0)}` : "?"}) park=(${nPark ? `${nPark.x.toFixed(0)},${nPark.y.toFixed(0)}` : "?"}) fit=${fs} BUILD=noplane17`,
            );
          }
        })
        .onFinalize(() => {
          if (canvas) {
            if (canvasStrafing) {
              canvasStrafing = false;
              onPanEnd?.();
              return;
            }
            if (!canvasStarted) return;
            canvasStarted = false;
          } else {
            ringProgress.value = withTiming(0, { duration: 80 });
          }
          const store = useGameStore.getState();
          if (store.heldActionId !== action.actionId) return;
          const s = session.current;
          session.current = null;
          if (!s) {
            // Card only: a tap/failed long-press on the held part's card puts it back. A canvas touch that never activated must NOT put it back. No live session ever ran here, but a prior drag could have left slideDriver at a floated offset — clear it so a stale value can't leak into the next lead pickup.
            if (!canvas) {
              if (hasRidingBodies(store.furniture, action.partId)) slideDriver.set([0, 0, 0]);
              store.cancelHeld();
            }
            return;
          }
          const ready = store.fitState === "nearCorrect";
          const needsRotation = store.fitState === "nearRotation";
          const matched =
            s.candidates.find(
              (c) => c.action.actionId === store.matchedActionId,
            ) ?? s.candidates[0];
          if ((ready || needsRotation) && matched) {
            // Committing to the socket: siblings drop the ride and revert to their normal (pop-in) placed presentation right away — the frame still eases into the socket over the animation below, unchanged from before this phase.
            if (hasRidingBodies(store.furniture, action.partId)) slideDriver.set([0, 0, 0]);
            const st = useGameStore.getState();
            const doneSet = new Set(st.completed);
            const eng =
              st.furniture && matched.action.type === "placePart"
                ? placeEngagement(st.furniture, matched.action, doneSet)
                : "drop";
            const isScrew = eng === "screw";
            const backoff = !st.furniture
              ? null
              : eng === "screw"
                ? screwParkOffset(st.furniture, matched.action, doneSet)
                : eng === "slide"
                  ? (slideParkInfo(st.furniture, matched.action, doneSet)
                      ?.offset ?? null)
                  : eng === "press"
                    ? (pressParkInfo(st.furniture, matched.action, doneSet)
                        ?.offset ?? null)
                    : null;
            const dest: Float3 = [
              matched.position[0] - s.bakedPos[0] + (backoff?.[0] ?? 0),
              matched.position[1] - s.bakedPos[1] + (backoff?.[1] ?? 0),
              matched.position[2] - s.bakedPos[2] + (backoff?.[2] ?? 0),
            ];
            animateDriver(heldDriver, dest, 250, () => {
              const store = useGameStore.getState();
              if (needsRotation || isScrew) {
                store.parkOrientation(matched.action.actionId);
                Haptics.selectionAsync();
              } else if (eng === "slide" || eng === "press") {
                store.parkDrive(matched.action.actionId, eng);
                Haptics.selectionAsync();
              } else {
                store.releaseHeld();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }
            });
          } else if (store.settings.releaseBehavior === "float") {
            // FLOAT: leave the part exactly where it was set down. heldActionId stays set (we don't cancelHeld), so the driver keeps its offset and the part renders in place — drag it again on the canvas or use the tray Put-back to return it. Ported from the on-release engine. slideDriver is intentionally left as-is (not zeroed): the lead is still logically held, just parked, so its siblings should keep riding at the same offset until the next drag frame or an explicit cancel.
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          } else {
            // complimentary function for FLOAT: AUTO-RETURN: the part flies to a recover spot in front of the camera and returns to the tray.
            const la = manipulator?.getLookAt();
            const off = heldDriver.value;
            let dest: Float3 = s.base;
            if (la) {
              const [eye, center] = la;
              const fx = center[0] - eye[0];
              const fz = center[2] - eye[2];
              const fl = Math.hypot(fx, fz) || 1;
              dest = [
                off[0] + (-fz / fl) * 0.55,
                off[1] + 0.08,
                off[2] + (fx / fl) * 0.55,
              ];
            }
            // A held lead's riding siblings fly back WITH it as one coherent object (heldActionId stays set through the whole tween, so they render in "riding" mode the entire flight — an immediate zero here would pop them to their assembled pose at the empty socket while the frame visibly recovers).
            const lead = hasRidingBodies(store.furniture, action.partId);
            if (lead) animateClusterDriver(slideDriver, dest, 220);
            animateDriver(heldDriver, dest, 220, () => {
              const st = useGameStore.getState();
              st.cancelHeld();
              // cancelHeld FIRST (clears heldActionId → riding parts unmount), THEN zero the driver so it's clean for the next lead pickup and nothing ever renders the transient reset.
              if (lead) slideDriver.set([0, 0, 0]);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              st.noteBlocked(action.actionId);
            });
          }
        });
      return g;
    },
    [
      manipulator,
      heldDriver,
      slideDriver,
      getFocusPoint,
      fingerOnCameraPlaneAt,
      fingerOnPlane,
      fingerOnRay,
      assemblyRadius,
      fingerOnCameraPlane,
      worldToScreen,
      ringX,
      ringY,
      ringProgress,
      isFloating,
      onPanStart,
      onPanMove,
      onPanEnd,
      // The gesture closure captures this, so a settings change has to rebuild it.
      dragPlaneSetting,
      jointAnchors,
    ],
  );

  /** Ease the carried cluster's shared offset home over `ms` — a JS rAF loop writing ONE shared value per frame; the render-thread loop does the actual moving. */
  const animateCarryHome = useCallback(
    (from: Float3, ms: number, onDone: () => void) => {
      const t0 = Date.now();
      const step = () => {
        const k = Math.min(1, (Date.now() - t0) / ms);
        const e = 1 - (1 - k) * (1 - k);
        carryShared.value = {
          x: from[0] * (1 - e),
          y: from[1] * (1 - e),
          z: from[2] * (1 - e),
        };
        if (k < 1) requestAnimationFrame(step);
        else onDone();
      };
      requestAnimationFrame(step);
    },
    [carryShared],
  );

  /** Combine drag: a cluster card behaves like a part card. CARRY phase — the whole cluster materializes under the finger on the work plane (camera-projected, exactly like a part pickup) and follows it as ONE rigid body, gliding at its own baked height; the gesture only writes `carryShared`, and the render-thread loop (scene/CombineCarry) moves the entities. Release near its target: the seed cluster eases home and completes; a slide-joined cluster snaps to its park pose — the telescoping `sink` extends the runners out to meet it — and hands off to SlideControl for the drive home. Release anywhere else returns it to its card. */
  const buildClusterGesture = useCallback(
    (
      action: AssemblyAction,
      sink: OffsetSink,
      park: ParkInfo | null,
    ) => {
      const target: Float3 = park ? ([...park.offset] as Float3) : [0, 0, 0];
      // Long-press activation, exactly like a part card: the tray's ScrollView claims a bare pan the moment the finger clears its slop (the drag froze a step outside the tray), but it cannot steal a gesture that is already ACTIVE when the hold completes.
      return Gesture.Pan()
        .runOnJS(true)
        .activateAfterLongPress(PICKUP_MS)
        .onTouchesDown((e) => {
          const t = e.allTouches[0];
          ringX.value = t.absoluteX;
          ringY.value = t.absoluteY;
          ringProgress.value = 0;
          ringProgress.value = withTiming(1, { duration: PICKUP_MS });
        })
        .onTouchesUp(() => {
          ringProgress.value = withTiming(0, { duration: 80 });
        })
        .onStart((e) => {
          ringProgress.value = withTiming(0, { duration: 120 });
          const store = useGameStore.getState();
          const f = store.furniture;
          if (!action.cluster || !f) return;
          // the finger carries the cluster's baked centroid; the carry plane sits at that height so the cluster glides level across the bench
          const members = Object.values(f.parts).filter(
            (p) => p.cluster === action.cluster,
          );
          const c: Float3 = [0, 0, 0];
          for (const p of members) {
            c[0] += p.pose.position[0] / members.length;
            c[1] += p.pose.position[1] / members.length;
            c[2] += p.pose.position[2] / members.length;
          }
          const planeY = c[1];
          // A vertically-parking cluster rides the camera-facing plane through its park pose instead of the horizontal glide: its glide plane hangs at the TOP of the assembly where a level orbit sees it edge-on and the finger's ray lands metres out, so the in-plane snap was unreachable from most of the screen (DALFRED's seat, measured at every zoom).
          const anchor = clusterCarryAnchor(c, target);
          const p = anchor
            ? (fingerOnCameraPlaneAt(e.absoluteX, e.absoluteY, anchor) ??
              fingerOnPlane(e.absoluteX, e.absoluteY, planeY))
            : (fingerOnPlane(e.absoluteX, e.absoluteY, planeY) ??
              fingerOnCameraPlaneAt(e.absoluteX, e.absoluteY, getFocusPoint()));
          const lastO: Float3 = p ? [p[0] - c[0], 0, p[2] - c[2]] : target;
          clusterSession.current = { ref: c, planeY, lastO, anchor };
          store.setCombiningCluster(action.cluster);
          store.setDragFit("held", null);
          // pin the target marker where the release must land: the centroid shifted by the park offset (or the seat itself for the seed)
          const sp = worldToScreen([c[0] + target[0], c[1] + target[1], c[2] + target[2]]);
          if (sp) {
            clusterRingX.value = sp.x;
            clusterRingY.value = sp.y;
          }
          // the carry rides at the LOOSE height: the park offset's out-of-plane (vertical) component lifts the whole glide, so a vertically-parked cluster (DALFRED's seat) hovers above its seat instead of reading as already screwed in; zero for horizontal parks (EKET)
          carryShared.value = { x: lastO[0], y: target[1], z: lastO[2] };
        })
        .onUpdate((e) => {
          const s = clusterSession.current;
          if (!s) return;
          // Same plane choice as onStart, per frame: the anchored camera plane for a vertical park, the horizontal glide otherwise. The getFocusPoint fallback survives for the glide's true misses (anchor behind the lens / no camera yet), though dragPlanePoint answers the horizon itself now.
          const p = s.anchor
            ? (fingerOnCameraPlaneAt(e.absoluteX, e.absoluteY, s.anchor) ??
              fingerOnPlane(e.absoluteX, e.absoluteY, s.planeY))
            : (fingerOnPlane(e.absoluteX, e.absoluteY, s.planeY) ??
              fingerOnCameraPlaneAt(e.absoluteX, e.absoluteY, getFocusPoint()));
          if (!p) return;
          const o: Float3 = [p[0] - s.ref[0], 0, p[2] - s.ref[2]];
          s.lastO = o;
          carryShared.value = { x: o[0], y: target[1], z: o[2] };
          // re-project the marker each move so it survives a mid-drag zoom
          const sp = worldToScreen([s.ref[0] + target[0], s.ref[1] + target[1], s.ref[2] + target[2]]);
          if (sp) {
            clusterRingX.value = sp.x;
            clusterRingY.value = sp.y;
          }
          const snapDist = Math.min(
            SNAP_DIST_MAX,
            Math.max(SNAP_DIST_MIN, useGameStore.getState().settings.snapDistance),
          );
          // the carry glides in the horizontal plane (o[1] is structurally 0), so a VERTICAL park offset (DALFRED's seat parks 0.15 straight up) must not count against the snap — measure the miss in-plane only
          const d = Math.hypot(o[0] - target[0], o[2] - target[2]);
          const fit =
            d <= snapDist
              ? "nearCorrect"
              : d <= snapDist * APPROACH_FACTOR
                ? "approaching"
                : "held";
          if (fit !== useGameStore.getState().fitState) {
            useGameStore.getState().setDragFit(fit, null);
          }
        })
        .onFinalize(() => {
          const s = clusterSession.current;
          clusterSession.current = null;
          const store = useGameStore.getState();
          const ready = store.fitState === "nearCorrect";
          store.setDragFit("idle", null);
          if (!ready) {
            // back to its card: the mode flip pulls the entities out of the scene, so the offset reset is invisible
            store.setCombiningCluster(null);
            carryShared.value = { x: 0, y: 0, z: 0 };
            return;
          }
          if (park) {
            // snap the carry to the park pose and hand off to the drive gesture (SlideControl glide or ScrewControl dial, per the cluster's authored driveMotion) for park -> 0
            carryShared.value = { x: park.offset[0], y: park.offset[1], z: park.offset[2] };
            sink.set([...park.offset] as Float3);
            store.parkDrive(
              action.actionId,
              action.cluster ? clusterDriveKind(store.furniture?.clusters, action.cluster) : "slide",
            );
            Haptics.selectionAsync();
            return;
          }
          // the seed cluster eases the last stretch home, then the placement commits
          animateCarryHome(s?.lastO ?? [0, 0, 0], 180, () => {
            const st = useGameStore.getState();
            st.completeAction(action.actionId);
            st.setCombiningCluster(null);
            carryShared.value = { x: 0, y: 0, z: 0 };
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          });
        });
    },
    [fingerOnPlane, fingerOnCameraPlaneAt, getFocusPoint, worldToScreen, clusterRingX, clusterRingY, ringX, ringY, ringProgress, carryShared, animateCarryHome],
  );

  // Cluster gestures are cached like part gestures so a ClusterTray re-render hands GestureDetector the SAME object and gesture-handler never swaps callbacks mid-drag (the swap that reset the closure state before the clusterSession fix; the cache kills the rebuild at the source).
  const clusterGestureCache = useMemo(
    () => new Map<string, { action: AssemblyAction; gesture: GestureType }>(),
    [buildClusterGesture],
  );
  // Hits require the same action OBJECT, not just the same id: action ids can collide across furnitures, and this hook never observes furniture swaps, so an id-only hit could serve a gesture with a stale baked action/park.
  const clusterGestureFor = useCallback(
    (action: AssemblyAction, sink: OffsetSink, park: ParkInfo | null) => {
      const hit = clusterGestureCache.get(action.actionId);
      if (hit && hit.action === action) return hit.gesture;
      const gesture = buildClusterGesture(action, sink, park);
      clusterGestureCache.set(action.actionId, { action, gesture });
      return gesture;
    },
    [clusterGestureCache, buildClusterGesture],
  );

  const gestureCache = useMemo(
    () => new Map<string, GestureType>(),
    [buildGesture],
  );
  const gestureFor = useCallback(
    (action: AssemblyAction) => {
      let g = gestureCache.get(action.actionId);
      if (!g) {
        g = buildGesture(action);
        gestureCache.set(action.actionId, g);
      }
      return g;
    },
    [gestureCache, buildGesture],
  );

  /** Canvas re-grab: the same drag for `action`, but activated by a one-finger drag anywhere on the scene while that part is FLOATING (releaseBehavior "float"). Compose it into the scene gesture alongside (and before) the camera strafe. */
  const canvasGestureFor = useCallback(
    (action: AssemblyAction) => {
      const key = `canvas:${action.actionId}`;
      let g = gestureCache.get(key);
      if (!g) {
        g = buildGesture(action, true);
        gestureCache.set(key, g);
      }
      return g;
    },
    [gestureCache, buildGesture],
  );

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringProgress.value > 0.02 ? 0.9 : 0,
    transform: [
      { translateX: ringX.value - RING / 2 },
      { translateY: ringY.value - RING / 2 },
      { scale: 0.7 + 0.5 * ringProgress.value },
    ],
    borderWidth: 3 + 5 * ringProgress.value,
  }));

  const ringOverlay = (
    <>
      <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />
      <ClusterTargetRing x={clusterRingX} y={clusterRingY} />
    </>
  );

  return { gestureFor, canvasGestureFor, clusterGestureFor, ringOverlay };
}

/** Where to set the carried cluster down: a dashed ring at the seat (park pose for a drawer), the cluster-drag counterpart of the part drag's socket ghost. Turns solid green inside snap range. Hidden once the drive gesture owns the motion. */
function ClusterTargetRing({
  x,
  y,
}: {
  x: SharedValue<number>;
  y: SharedValue<number>;
}) {
  const visible = useGameStore(
    (s) => s.combiningCluster !== null && s.driveActionId === null,
  );
  const ready = useGameStore((s) => s.fitState === "nearCorrect");
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value - TARGET_RING / 2 },
      { translateY: y.value - TARGET_RING / 2 },
    ],
  }));
  if (!visible) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.targetRing, ready && styles.targetRingReady, style]}
    />
  );
}

const styles = StyleSheet.create({
  ring: {
    position: "absolute",
    top: 0,
    left: 0,
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderColor: "#e8842c",
  },
  targetRing: {
    position: "absolute",
    top: 0,
    left: 0,
    width: TARGET_RING,
    height: TARGET_RING,
    borderRadius: TARGET_RING / 2,
    borderWidth: 3,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.9)",
  },
  targetRingReady: {
    borderStyle: "solid",
    borderColor: "#37c871",
  },
});