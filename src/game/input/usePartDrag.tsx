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
  targetPositionForAction,
} from "@/src/game/core/scene/targets";
import type { GroupCandidate } from "@/src/game/core/scene/targets";
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
import type { OffsetSink } from "../scene/combineDriver";
import type { CarryOffset } from "../scene/CombineCarry";
import { computeFit, APPROACH_FACTOR } from "@/src/game/core/geometry/fit";
import { isStaged } from "@/src/game/core/model/staging";
import { isPickupType } from "@/src/game/core/ids";
import { quatSlerp, screenPointOnPlane } from "@/src/game/core/geometry/math";
import {
  ActionId,
  AssemblyAction,
  Furniture,
  PartId,
  Quat,
  Vec3,
} from "@/src/game/core/type";
import { selectFirstDrop, useGameStore } from "@/src/game/core/store";
import {
  impactHaptic,
  selectionHaptic,
} from "@/src/game/core/haptics";
import type { OrbitManipulator } from "../scene/AssemblyScene";
import { FOV_Y_DEG } from "../scene/cameraConfig";
import {
  animateClusterDriver,
  animateDriver,
  ClusterDriver,
  OffsetDriver,
} from "../scene/offsetDriver";

// Physical dimensions shared by the gesture maths and the stylesheet: the maths divides by them, so changing one moves the pixels AND retunes the gesture together.
const RING = 64;
const TARGET_RING = 92;

type Float3 = [number, number, number];

const PICKUP_MS = 450;
/** The held part rides just above the fingertip so the finger doesn't cover it. */
const FINGER_LIFT_DP = 22;
/** Held parts are kept within this radius of the bench centre, world meters. */
const BENCH_RADIUS_M = 0.9;
/** Ghost/magnet targeting starts before the final snap threshold. */
const APPROACH_RADIUS_M = 0.3;
/** Magnetic POSITION pull band, decoupled from rotation: rotation eases in over the whole approach (0.3m), but position stays under the finger until this close and is fully seated at POS_PULL_FULL_M — capping finger→part drift at ~3cm (it used to reach snapDist, 14–19cm, which felt uncontrollable). */
const POS_PULL_START_M = 0.09;
const POS_PULL_FULL_M = 0.025;
/** Prevent target flicker when hovering between equivalent sockets — expressed in SCREEN pixels because candidate matching is done on the projected screen positions (the finger's aim is 2D; depth must never hide a socket). */
const SWITCH_MARGIN_PX = 14;
/** Snap ACCEPTANCE radius comes from settings.snapDistance (per-profile, default 0.14); clamped here so no profile can exceed the geometry-safe cap. APPROACH/SWITCH_MARGIN above stay constants — they own anti-jumping. */
const SNAP_DIST_MIN = 0.06;
const SNAP_DIST_MAX = 0.2;

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
  candidates: GroupCandidate[];
  /** Live sockets outside the group, for wrong-target detection. */
  otherSockets: Vec3[];
  bakedPos: Vec3;
  /** Baked rotation of the held (representative) part. The held part eases from  this toward the matched socket's rotation as it approaches. */
  bakedRot: Quat;
  /** Offset from snap origin to the visible center the finger should control. */
  grabOffset: Vec3;
  /** Height of the horizontal drag plane. DYNAMIC: eases toward the matched socket's height each frame (multi-height groups like DALFRED's screw105251), back to basePlaneY when nothing is matched. */
  planeY: number;
  /** The action's own target height — the drag plane's resting height. */
  basePlaneY: number;
  matchedActionId: ActionId | null;
  /** Current hover lift (m) applied to the held part — eased in as it nears a  socket; subtracted back out when computing the true pose for fit. */
  hoverLift: number;
  startX: number;
  startY: number;
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
      const radius = Math.hypot(p[0], p[2]);
      if (radius > BENCH_RADIUS_M) {
        p[0] *= BENCH_RADIUS_M / radius;
        p[2] *= BENCH_RADIUS_M / radius;
      }
      return p;
    },
    [manipulator, winW, winH],
  );

  /** World point on the work plane under (just above) the finger, or null at the horizon. */
  const fingerOnPlane = useCallback(
    (absX: number, absY: number, planeY: number): Float3 | null => {
      const la = manipulator?.getLookAt();
      if (!la) return null;
      const [eye, center, up] = la;
      const p = screenPointOnPlane(
        { eye, center, up },
        FOV_Y_DEG,
        winW,
        winH,
        absX,
        absY - FINGER_LIFT_DP,
        planeY,
      );
      if (!p) return null;
      const r = Math.hypot(p[0], p[2]);
      if (r > BENCH_RADIUS_M) {
        p[0] *= BENCH_RADIUS_M / r;
        p[2] *= BENCH_RADIUS_M / r;
      }
      return p;
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
      const radius = Math.hypot(p[0], p[2]);
      if (radius > BENCH_RADIUS_M) {
        p[0] *= BENCH_RADIUS_M / radius;
        p[2] *= BENCH_RADIUS_M / radius;
      }
      return p;
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
          const focus = getFocusPoint();
          // Drag plane at the action's OWN target height (her model): on-screen overlap with a socket then means genuine 3D proximity — a finger on a 2D screen cannot steer depth.
          const doneSet0 = new Set(store.completed);
          const ownTarget = targetPositionForAction(action, furniture.parts, doneSet0);
          const grabOffset = part.visualCenterOffset ?? [0, 0, 0];
          // The plane pins the part's VISUAL CENTER (what the finger holds), so anchor it at the socket's visual-center height — origin height alone left tall parts (DALFRED legs: +0.27m center offset) vertically unreachable in level mode.
          const planeY = ownTarget[1] + grabOffset[1];
          const visualStart =
            fingerOnPlane(e.absoluteX, e.absoluteY, planeY) ??
            fingerOnCameraPlaneAt(e.absoluteX, e.absoluteY, focus) ??
            focus;
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
          selectionHaptic();
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
          );
          const candidates = selectFirstDrop(nextStore)
            ? allCandidates.filter((c) => c.action.actionId === action.actionId)
            : allCandidates;
          const groupIds = new Set(candidates.map((c) => c.action.actionId));
          const otherSockets = avail
            .filter(
              (a) => a.partId && isPickupType(a.type) && !groupIds.has(a.actionId),
            )
            .map((a) => targetPositionForAction(a, furniture.parts, doneSet));
          session.current = {
            base,
            candidates,
            otherSockets,
            bakedPos: part.pose.position,
            bakedRot: part.pose.rotation,
            grabOffset,
            planeY,
            basePlaneY: planeY,
            matchedActionId: null,
            hoverLift: 0,
            startX: e.absoluteX,
            startY: e.absoluteY,
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
          // Exact per-frame projection onto the (dynamic) horizontal drag plane — absolute mapping, so the part cannot drift from the finger. Camera-plane delta math kept only as a horizon fallback.
          const p =
            fingerOnPlane(e.absoluteX, e.absoluteY, s.planeY) ??
            fingerOnCameraPlane(e.absoluteX, e.absoluteY, s);
          let nearest = s.candidates[0];
          let bestD = Infinity;
          let target: GroupCandidate | null = null;
          if (store.settings.dragPlane === "level") {
            // "level" — the on-release engine's mechanism, kept for comparison/demo: plane FIXED at the session target's height, candidates matched by TRUE 3D distance, no hysteresis. Depth can hide a socket here — the multi-height blind spot (wool stool two-height legs, DALFRED screw105251) is intentional to demonstrate.
            s.planeY = s.basePlaneY;
            const offB = heldDriver.value;
            const dragX = p?.[0] ?? s.bakedPos[0] + offB[0] + s.grabOffset[0];
            const dragY = p?.[1] ?? s.bakedPos[1] + offB[1] + s.grabOffset[1];
            const dragZ = p?.[2] ?? s.bakedPos[2] + offB[2] + s.grabOffset[2];
            for (const c of s.candidates) {
              const d = Math.hypot(
                dragX - c.visualPosition[0],
                dragY - c.visualPosition[1],
                dragZ - c.visualPosition[2],
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
            const distPx = (c: GroupCandidate) => {
              const sp = worldToScreen(c.visualPosition);
              if (!sp) return { px: Infinity, mPerPx: 1 };
              return {
                px: Math.hypot(fingerPx.x - sp.x, fingerPx.y - sp.y),
                mPerPx: (2 * sp.depth * Math.tan((FOV_Y_DEG * Math.PI) / 360)) / winH,
              };
            };
            let nearestPx = Infinity;
            let nearestMPerPx = 1;
            for (const c of s.candidates) {
              const d = distPx(c);
              if (d.px < nearestPx) {
                nearestPx = d.px;
                nearestMPerPx = d.mPerPx;
                nearest = c;
              }
            }
            bestD = nearestPx * nearestMPerPx; // world-equivalent aim distance

            const current = s.candidates.find(
              (c) => c.action.actionId === s.matchedActionId,
            );
            const currentPx = current ? distPx(current).px : Infinity;
            if (current && currentPx * nearestMPerPx <= APPROACH_RADIUS_M) {
              target = nearestPx + SWITCH_MARGIN_PX < currentPx ? nearest : current;
            } else if (nearest && bestD <= APPROACH_RADIUS_M) {
              target = nearest;
            }
            s.matchedActionId = target?.action.actionId ?? null;
            // Ease the drag plane toward the matched socket's height (multi-height groups); slides the part ALONG the finger's view ray, so it is invisible on screen. Same visual-center anchoring as the session plane.
            const wantY = target
              ? target.position[1] + s.grabOffset[1]
              : s.basePlaneY;
            s.planeY += (wantY - s.planeY) * 0.25;
          }

          // Per-profile acceptance radius; also the magnet's full-strength point so "looks seated" and "is accepted" stay the same distance.
          const snapDist = Math.min(
            SNAP_DIST_MAX,
            Math.max(SNAP_DIST_MIN, store.settings.snapDistance),
          );
          if (p) {
            const fingerW: Vec3 = [
              p[0] - s.grabOffset[0],
              p[1] - s.grabOffset[1],
              p[2] - s.grabOffset[2],
            ];

            // ======= dev - setting; "onRelease" snap style: no magnetic pull — the part stays pinned under the finger (t = 0) and only animates into the socket on release. "magnetic" eases it toward the matched socket as it approaches. Fit feedback (color states) works the same in both.

            const magnetic =
              !!target && store.settings.snapStyle === "magnetic";
            // Rotation factor: eases over the whole approach band (the gradual turn toward the socket's orientation).
            const rotT = magnetic
              ? Math.max(
                  0,
                  Math.min(
                    1,
                    (APPROACH_RADIUS_M - bestD) /
                      (APPROACH_RADIUS_M - snapDist),
                  ),
                )
              : 0;
            // Position factor: a much tighter band so the part stays under the finger (responsive control) and only commits to the socket when genuinely close.
            const posT = magnetic
              ? Math.max(
                  0,
                  Math.min(
                    1,
                    (POS_PULL_START_M - bestD) /
                      (POS_PULL_START_M - POS_PULL_FULL_M),
                  ),
                )
              : 0;
            const sock = target?.position ?? fingerW;
            // No hover-lift: the part eases straight to the socket so there's no vertical "drop" on release — it just moves to where it should rest (the loose state for screws/legs is still applied on release).
            s.hoverLift = 0;
            heldDriver.setPose(
              [
                fingerW[0] + (sock[0] - fingerW[0]) * posT - s.bakedPos[0],
                fingerW[1] + (sock[1] - fingerW[1]) * posT - s.bakedPos[1],
                fingerW[2] + (sock[2] - fingerW[2]) * posT - s.bakedPos[2],
              ],
              target ? quatSlerp(s.bakedRot, target.rotation, rotT) : s.bakedRot,
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
          const fs = target
            ? computeFit(
                held,
                target.rotation,
                { position: target.position, rotation: target.rotation },
                s.otherSockets,
                { distance: snapDist, angleDeg: 25 },
              )
            : "held";
          if (
            fs !== store.fitState ||
            s.matchedActionId !== store.matchedActionId
          )
            store.setDragFit(fs, s.matchedActionId);
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
                selectionHaptic();
              } else if (eng === "slide" || eng === "press") {
                store.parkDrive(matched.action.actionId, eng);
                selectionHaptic();
              } else {
                store.releaseHeld();
                impactHaptic(Haptics.ImpactFeedbackStyle.Medium);
              }
            });
          } else if (store.settings.releaseBehavior === "float") {
            // FLOAT: leave the part exactly where it was set down. heldActionId stays set (we don't cancelHeld), so the driver keeps its offset and the part renders in place — drag it again on the canvas or use the tray Put-back to return it. Ported from the on-release engine. slideDriver is intentionally left as-is (not zeroed): the lead is still logically held, just parked, so its siblings should keep riding at the same offset until the next drag frame or an explicit cancel.
            impactHaptic(Haptics.ImpactFeedbackStyle.Light);
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
              impactHaptic(Haptics.ImpactFeedbackStyle.Light);
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
      fingerOnCameraPlane,
      worldToScreen,
      ringX,
      ringY,
      ringProgress,
      isFloating,
      onPanStart,
      onPanMove,
      onPanEnd,
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
          const p =
            fingerOnPlane(e.absoluteX, e.absoluteY, planeY) ??
            fingerOnCameraPlaneAt(e.absoluteX, e.absoluteY, getFocusPoint());
          const lastO: Float3 = p ? [p[0] - c[0], 0, p[2] - c[2]] : target;
          clusterSession.current = { ref: c, planeY, lastO };
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
          // Same camera-plane fallback onStart uses: when the horizontal-plane projection misses (a low/side orbit puts the plane at the cluster's height edge-on or above the horizon) fingerOnPlane returns null, so without the fallback the carry stops tracking. Anchor matches onStart (getFocusPoint) so the first drag frame doesn't jump.
          const p =
            fingerOnPlane(e.absoluteX, e.absoluteY, s.planeY) ??
            fingerOnCameraPlaneAt(e.absoluteX, e.absoluteY, getFocusPoint());
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
            selectionHaptic();
            return;
          }
          // the seed cluster eases the last stretch home, then the placement commits
          animateCarryHome(s?.lastO ?? [0, 0, 0], 180, () => {
            const st = useGameStore.getState();
            st.completeAction(action.actionId);
            st.setCombiningCluster(null);
            carryShared.value = { x: 0, y: 0, z: 0 };
            impactHaptic(Haptics.ImpactFeedbackStyle.Medium);
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
