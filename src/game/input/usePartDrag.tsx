import * as Haptics from "expo-haptics";
import { useCallback, useMemo, useRef } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { Gesture, GestureType } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { groupCandidates, targetPositionForAction } from "@/src/game/core/scene/targets";
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
import { HOVER_LIFT_M } from "@/src/game/core/geometry/staging";
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
/** Prevent target flicker when hovering between equivalent sockets. */
const SWITCH_MARGIN_M = 0.03;
/** Final snap is a little more forgiving than the pure geometry default. */
const SNAP_RADIUS_M = 0.14;
const RING = 64;

interface Params {
  manipulator: OrbitManipulator;
  heldDriver: OffsetDriver;
  getFocusPoint: () => Vec3;
}

interface DragSession {
  base: Float3;
  /** Interchangeable sockets the held part may snap to (same part group). */
  candidates: GroupCandidate[];
  /** Live sockets outside the group, for wrong-target detection. */
  otherSockets: Vec3[];
  bakedPos: Vec3;
  /** Baked rotation of the held (representative) part. The held part eases from
   *  this toward the matched socket's rotation as it approaches. */
  bakedRot: Quat;
  /** Offset from snap origin to the visible center the finger should control. */
  grabOffset: Vec3;
  planeY: number;
  matchedActionId: ActionId | null;
  /** Current hover lift (m) applied to the held part — eased in as it nears a
   *  socket; subtracted back out when computing the true pose for fit. */
  hoverLift: number;
  startX: number;
  startY: number;
}

/**
 * Tray-item drag: long-press a tray card (progress ring) to take the part in
 * hand — it materializes at the spawn point on the work plane — then keep the
 * finger down to pan it; release snaps or returns it to the tray.
 */
export function usePartDrag({ manipulator, heldDriver, getFocusPoint }: Params) {
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
        anchor[0] + right[0] * ndcX * tanH * dist + camUp[0] * ndcY * tanV * dist,
        anchor[1] + right[1] * ndcX * tanH * dist + camUp[1] * ndcY * tanV * dist,
        anchor[2] + right[2] * ndcX * tanH * dist + camUp[2] * ndcY * tanV * dist,
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
      const dist = Math.hypot(anchor[0] - eye[0], anchor[1] - eye[1], anchor[2] - eye[2]);
      const metersPerPx = (2 * dist * Math.tan((FOV_Y_DEG * Math.PI) / 360)) / winH;
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

  const buildGesture = useCallback(
    (action: AssemblyAction) =>
      Gesture.Pan()
        .runOnJS(true)
        .activateAfterLongPress(PICKUP_MS)
        .onTouchesDown((e) => {
          const store = useGameStore.getState();
          if (store.heldActionId) {
            if (!session.current && !store.orientationActionId) {
              store.cancelHeld();
            }
            return;
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
          ringProgress.value = withTiming(0, { duration: 80 });
        })
        .onStart((e) => {
          if (!action.partId) return;
          const store = useGameStore.getState();
          const furniture = store.furniture;
          if (!furniture) return;
          const part = furniture.parts[action.partId];
          const focus = getFocusPoint();
          const planeY = focus[1];
          const grabOffset = part.visualCenterOffset ?? [0, 0, 0];
          const visualStart =
            fingerOnCameraPlaneAt(e.absoluteX, e.absoluteY, focus) ?? focus;
          const base: Float3 = [
            visualStart[0] - grabOffset[0] - part.pose.position[0],
            visualStart[1] - grabOffset[1] - part.pose.position[1],
            visualStart[2] - grabOffset[2] - part.pose.position[2],
          ];
          heldDriver.set(base);
          store.beginPickup(action.actionId);
          if (useGameStore.getState().heldActionId !== action.actionId) return;
          Haptics.selectionAsync();
          ringProgress.value = withTiming(0, { duration: 120 });

          const nextStore = useGameStore.getState();
          const avail = actionsForClusterFocus(
            furniture,
            nextStore.available(),
            nextStore.activeCluster,
          );
          const doneSet = new Set(nextStore.completed);
          const allCandidates = groupCandidates(avail, action, furniture.parts, doneSet);
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
            matchedActionId: null,
            hoverLift: 0,
            startX: e.absoluteX,
            startY: e.absoluteY,
          };
        })
        .onUpdate((e) => {
          const s = session.current;
          const store = useGameStore.getState();
          const furniture = store.furniture;
          if (!s || !furniture || store.heldActionId !== action.actionId) return;
          const p =
            fingerOnCameraPlane(e.absoluteX, e.absoluteY, s) ??
            fingerOnPlane(e.absoluteX, e.absoluteY, s.planeY);
          const offBefore = heldDriver.value;
          const dragX = p?.[0] ?? s.bakedPos[0] + offBefore[0] + s.grabOffset[0];
          const dragY = p?.[1] ?? s.bakedPos[1] + offBefore[1] + s.grabOffset[1];
          const dragZ = p?.[2] ?? s.bakedPos[2] + offBefore[2] + s.grabOffset[2];
          const dist = (c: GroupCandidate) =>
            Math.hypot(
              dragX - c.visualPosition[0],
              dragY - c.visualPosition[1],
              dragZ - c.visualPosition[2],
            );
          let nearest = s.candidates[0];
          let bestD = Infinity;
          for (const c of s.candidates) {
            const d = dist(c);
            if (d < bestD) {
              bestD = d;
              nearest = c;
            }
          }

          const current = s.candidates.find((c) => c.action.actionId === s.matchedActionId);
          const currentD = current ? dist(current) : Infinity;
          let target: GroupCandidate | null = null;
          if (current && currentD <= APPROACH_RADIUS_M) {
            target = bestD + SWITCH_MARGIN_M < currentD ? nearest : current;
          } else if (nearest && bestD <= APPROACH_RADIUS_M) {
            target = nearest;
          }
          s.matchedActionId = target?.action.actionId ?? null;

          if (p) {
            const fingerW: Vec3 = [
              p[0] - s.grabOffset[0],
              p[1] - s.grabOffset[1],
              p[2] - s.grabOffset[2],
            ];
            const t = target
              ? Math.max(
                  0,
                  Math.min(1, (APPROACH_RADIUS_M - bestD) / (APPROACH_RADIUS_M - SNAP_RADIUS_M)),
                )
              : 0;
            const sock = target?.position ?? fingerW;
            s.hoverLift = HOVER_LIFT_M * t;
            heldDriver.set([
              fingerW[0] + (sock[0] - fingerW[0]) * t - s.bakedPos[0],
              fingerW[1] + (sock[1] - fingerW[1]) * t + s.hoverLift - s.bakedPos[1],
              fingerW[2] + (sock[2] - fingerW[2]) * t - s.bakedPos[2],
            ]);
            heldDriver.setRotation(
              target ? quatSlerp(s.bakedRot, target.rotation, t) : s.bakedRot,
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
                { distance: SNAP_RADIUS_M, angleDeg: 25 },
              )
            : "held";
          if (fs !== store.fitState || s.matchedActionId !== store.matchedActionId)
            store.setDragFit(fs, s.matchedActionId);
        })
        .onFinalize(() => {
          ringProgress.value = withTiming(0, { duration: 80 });
          const store = useGameStore.getState();
          if (store.heldActionId !== action.actionId) return;
          const s = session.current;
          session.current = null;
          if (!s) {
            store.cancelHeld();
            return;
          }
          const ready = store.fitState === "nearCorrect";
          const needsRotation = store.fitState === "nearRotation";
          const matched =
            s.candidates.find((c) => c.action.actionId === store.matchedActionId) ??
            s.candidates[0];
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
                  ? slideParkInfo(st.furniture, matched.action, doneSet)?.offset ?? null
                  : eng === "press"
                    ? pressParkInfo(st.furniture, matched.action, doneSet)?.offset ?? null
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
          } else {
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
        }),
    [
      manipulator,
      heldDriver,
      getFocusPoint,
      fingerOnCameraPlaneAt,
      fingerOnPlane,
      fingerOnCameraPlane,
      ringX,
      ringY,
      ringProgress,
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

  return { gestureFor, ringOverlay };
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
