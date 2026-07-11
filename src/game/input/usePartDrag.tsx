// TODO: settle down the part marked as dev-setting: magnetic pull + auto return vs float +auto retuen btn

import * as Haptics from "expo-haptics";
import { useCallback, useMemo, useRef } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { Gesture, GestureType } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import {
  groupCandidates,
  targetPositionForAction,
} from "@/src/game/core/scene/targets";
import type { GroupCandidate } from "@/src/game/core/scene/targets";
import { actionsForClusterFocus } from "@/src/game/core/evaluation/clusters";
import {
  placeEngagement,
  pressParkInfo,
  screwParkOffset,
  slideParkInfo,
} from "@/src/game/core/evaluation/engagement";
import { computeFit } from "@/src/game/core/geometry/fit";
import { quatSlerp, screenPointOnPlane } from "@/src/game/core/geometry/math";
import { ActionId, AssemblyAction, Quat, Vec3 } from "@/src/game/core/type";
import { selectFirstDrop, useGameStore } from "@/src/game/core/store";
import type { OrbitManipulator } from "../scene/AssemblyScene";
import { FOV_Y_DEG } from "../scene/cameraConfig";
import { animateDriver, OffsetDriver } from "../scene/offsetDriver";

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
const RING = 64;

interface Params {
  manipulator: OrbitManipulator;
  heldDriver: OffsetDriver;
  getFocusPoint: () => Vec3;
  /** Camera strafe callbacks — the canvas gesture falls back to these when the one-finger drag isn't re-grabbing a floating part (settings.canvasStrafe). */
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
  getFocusPoint,
  onPanStart,
  onPanMove,
  onPanEnd,
}: Params) {
  const session = useRef<DragSession | null>(null);

  const ringX = useSharedValue(0);
  const ringY = useSharedValue(0);
  const ringProgress = useSharedValue(0);
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
              // Not a re-grab → camera strafe fallback (its own toggle).
              if (st.settings.canvasStrafe && onPanStart) {
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
          store.beginPickup(action.actionId);
          if (useGameStore.getState().heldActionId !== action.actionId) return;
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
          );
          const candidates = selectFirstDrop(nextStore)
            ? allCandidates.filter((c) => c.action.actionId === action.actionId)
            : allCandidates;
          const groupIds = new Set(candidates.map((c) => c.action.actionId));
          const otherSockets = avail
            .filter(
              (a) =>
                a.partId &&
                (a.type === "placePart" || a.type === "insertFastener") &&
                !groupIds.has(a.actionId),
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
            heldDriver.set([
              fingerW[0] + (sock[0] - fingerW[0]) * posT - s.bakedPos[0],
              fingerW[1] + (sock[1] - fingerW[1]) * posT - s.bakedPos[1],
              fingerW[2] + (sock[2] - fingerW[2]) * posT - s.bakedPos[2],
            ]);
            heldDriver.setRotation(
              target ? quatSlerp(s.bakedRot, target.rotation, rotT) : s.bakedRot,
            );
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
            // Card only: a tap/failed long-press on the held part's card puts it back. A canvas touch that never activated must NOT put it back.
            if (!canvas) store.cancelHeld();
            return;
          }
          const ready = store.fitState === "nearCorrect";
          const needsRotation = store.fitState === "nearRotation";
          const matched =
            s.candidates.find(
              (c) => c.action.actionId === store.matchedActionId,
            ) ?? s.candidates[0];
          if ((ready || needsRotation) && matched) {
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
            // FLOAT: leave the part exactly where it was set down. heldActionId stays set (we don't cancelHeld), so the driver keeps its offset and the part renders in place — drag it again on the canvas or use the tray Put-back to return it. Ported from the on-release engine.
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
            animateDriver(heldDriver, dest, 220, () => {
              const st = useGameStore.getState();
              st.cancelHeld();
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
    <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />
  );

  return { gestureFor, canvasGestureFor, ringOverlay };
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
});
