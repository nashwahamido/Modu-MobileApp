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
  targetRotationForAction,
} from "@/src/adhd/core/assembly/targets";
import type { GroupCandidate } from "@/src/adhd/core/assembly/targets";
import { computeFit } from "@/src/adhd/core/geometry/fit";
import { screenPointOnPlane } from "@/src/adhd/core/geometry/math";
import { HOVER_LIFT_M } from "@/src/adhd/core/geometry/staging";
import { AssemblyAction, Vec3 } from "@/src/adhd/core/type";
import { useGameStore } from "@/src/adhd/core/store";
import type { OrbitManipulator } from "../scene/AssemblyScene";
import { FOV_Y_DEG } from "../scene/cameraConfig";
import { animateDriver, OffsetDriver } from "../scene/offsetDriver";

type Float3 = [number, number, number];

const PICKUP_MS = 450;
/** The held part rides this far above the fingertip (screen dp) so the finger doesn't cover it. */
const FINGER_LIFT_DP = 36;
/** Held parts are kept within this radius of the bench centre, world meters. */
const BENCH_RADIUS_M = 0.9;
const RING = 64;
const NEUTRAL_HELD_ROT: readonly [number, number, number, number] = [0, 0, 0, 1];

/** Everything the move/finalize helpers need, independent of which gesture is driving. */
interface Session {
  actionId: string;
  isSnapPart: boolean;
  placeOnDrop: boolean;
  targetRot: readonly [number, number, number, number];
  /** Interchangeable sockets the held part may snap to (same part group). */
  candidates: GroupCandidate[];
  /** Live sockets outside the group, for wrong-target detection. */
  otherSockets: Vec3[];
  bakedPos: Vec3;
  planeY: number;
}

interface Params {
  manipulator: OrbitManipulator;
  heldDriver: OffsetDriver;
  getFocusPoint: () => Vec3;
  /** Camera strafe — used when a one-finger canvas drag isn't moving a part. */
  onPanStart: (x: number, y: number) => void;
  onPanMove: (x: number, y: number) => void;
  onPanEnd: () => void;
}

/**
 * Part manipulation:
 *  - Long-press a tray card to take a part in hand (it spawns on the work plane).
 *  - Drag to move it; release near a socket snaps it, otherwise it FLOATS where
 *    you let go.
 *  - A floating part can be picked straight back up with a one-finger drag on the
 *    canvas (or by long-pressing its tray card again) and nudged into place.
 */
export function usePartDrag({
  manipulator,
  heldDriver,
  getFocusPoint,
  onPanStart,
  onPanMove,
  onPanEnd,
}: Params) {
  const session = useRef<Session | null>(null);

  const ringX = useSharedValue(0);
  const ringY = useSharedValue(0);
  const ringProgress = useSharedValue(0);
  const { width: winW, height: winH } = useWindowDimensions();

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
      // Keep parts within the bench radius of the assembly's CENTRE — which
      // moves with the table-top origin shift — so a table dropped off to the
      // side can still have its far corners reached.
      const ws = useGameStore.getState().worldShift;
      const dx = p[0] - ws[0];
      const dz = p[2] - ws[2];
      const r = Math.hypot(dx, dz);
      if (r > BENCH_RADIUS_M) {
        p[0] = ws[0] + (dx * BENCH_RADIUS_M) / r;
        p[2] = ws[2] + (dz * BENCH_RADIUS_M) / r;
      }
      return p;
    },
    [manipulator, winW, winH],
  );

  /** Build the move session for an action (its sockets, target height, etc.). */
  const rebuildSession = useCallback((action: AssemblyAction): boolean => {
    const store = useGameStore.getState();
    const furniture = store.furniture;
    if (!furniture || !action.partId) return false;
    const part = furniture.parts[action.partId];
    const avail = store.available();
    const candidates = groupCandidates(avail, action, furniture.parts);
    const groupIds = new Set(candidates.map((c) => c.action.actionId));
    const otherSockets = avail
      .filter(
        (a) =>
          a.partId &&
          (a.type === "snapPart" || a.type === "insertFastener") &&
          !groupIds.has(a.actionId),
      )
      .map((a) => targetPositionForAction(a, furniture.parts));
    session.current = {
      actionId: action.actionId,
      isSnapPart: action.type === "snapPart",
      placeOnDrop: !!part.placeOnDrop,
      targetRot: targetRotationForAction(action, furniture.parts),
      candidates,
      otherSockets,
      bakedPos: part.pose.position,
      planeY: part.pose.position[1] + HOVER_LIFT_M,
    };
    return true;
  }, []);

  /** Move the held part so it tracks the finger, and update the snap-fit feedback. */
  const driveHeldToFinger = useCallback(
    (absX: number, absY: number) => {
      const s = session.current;
      const store = useGameStore.getState();
      if (!s || store.heldActionId !== s.actionId) return;
      const ws = store.worldShift;
      const p = fingerOnPlane(absX, absY, s.planeY);
      if (p)
        heldDriver.set([
          p[0] - s.bakedPos[0] - ws[0],
          s.planeY - s.bakedPos[1],
          p[2] - s.bakedPos[2] - ws[2],
        ]);
      const off = heldDriver.value;
      const held: Vec3 = [
        s.bakedPos[0] + off[0],
        s.bakedPos[1] + off[1] - HOVER_LIFT_M,
        s.bakedPos[2] + off[2],
      ];
      // place-on-drop parts (the table top) report the target rotation as their
      // held rotation, so the fit goes green on position alone — no twist. Other
      // snap parts use a neutral rotation, so they land "near rotation" and
      // require the screw-in twist.
      const rot =
        s.isSnapPart && !s.placeOnDrop ? NEUTRAL_HELD_ROT : s.targetRot;
      let best = s.candidates[0];
      let bestD = Infinity;
      for (const c of s.candidates) {
        const d = Math.hypot(
          held[0] - c.position[0],
          held[1] - c.position[1],
          held[2] - c.position[2],
        );
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      const fs = computeFit(
        held,
        rot,
        { position: best.position, rotation: best.rotation },
        s.otherSockets,
      );
      if (fs !== store.fitState || best.action.actionId !== store.matchedActionId)
        store.setDragFit(fs, best.action.actionId);
    },
    [fingerOnPlane, heldDriver],
  );

  /** Resolve the release: snap, park-for-twist, place-the-top, or leave floating. */
  const finalizeHeld = useCallback(() => {
    const store = useGameStore.getState();
    const s = session.current;
    if (!s || store.heldActionId !== s.actionId) {
      session.current = null;
      return;
    }
    session.current = null;
    const matched =
      s.candidates.find((c) => c.action.actionId === store.matchedActionId) ??
      s.candidates[0];

    // Table top (place-on-drop): stays exactly where you let go. Record the
    // drop as the world origin shift so every other part — and its snap target
    // — builds around it, then complete it in place.
    if (s.placeOnDrop) {
      const off = heldDriver.value;
      store.setWorldShift([off[0], off[1], off[2]] as Vec3);
      if (matched) store.completeAction(matched.action.actionId);
      store.cancelHeld();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      return;
    }

    const ready = store.fitState === "nearCorrect";
    const needsRotation = store.fitState === "nearRotation";
    if ((ready || needsRotation) && matched) {
      const dest: Float3 = [
        matched.position[0] - s.bakedPos[0],
        matched.position[1] - s.bakedPos[1],
        matched.position[2] - s.bakedPos[2],
      ];
      animateDriver(heldDriver, dest, 250, () => {
        if (needsRotation) {
          useGameStore.getState().parkOrientation(matched.action.actionId);
          Haptics.selectionAsync();
        } else {
          useGameStore.getState().releaseHeld();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      });
    } else if (store.settings.autoReturn) {
      // Auto-return: a part released away from a socket snaps straight back to
      // the tray (matches Standard mode). No floating part, no Put-back needed.
      store.cancelHeld();
      Haptics.selectionAsync();
    } else {
      // Manual return: leave the part FLOATING where you let go. heldActionId
      // stays set and the driver keeps its offset, so the part renders where
      // you dropped it — drag it again on the canvas (or long-press its tray
      // card) to keep moving it; the Put-back button returns it to the tray.
      Haptics.selectionAsync();
    }
  }, [heldDriver]);

  // ── Tray-card gesture: long-press to pick up (or re-grab a floating part). ──
  const buildGesture = useCallback(
    (action: AssemblyAction) =>
      Gesture.Pan()
        .runOnJS(true)
        .activateAfterLongPress(PICKUP_MS)
        .onTouchesDown((e) => {
          const store = useGameStore.getState();
          // Block only if a DIFFERENT part is in hand. Re-grabbing the part you
          // already hold (floating on the canvas) is allowed.
          if (store.heldActionId && store.heldActionId !== action.actionId) return;
          if (
            store.heldActionId !== action.actionId &&
            !store.available().some((a) => a.actionId === action.actionId)
          )
            return;
          const t = e.allTouches[0];
          ringX.value = t.absoluteX;
          ringY.value = t.absoluteY;
          ringProgress.value = 0;
          ringProgress.value = withTiming(1, { duration: PICKUP_MS });
        })
        .onTouchesUp(() => {
          ringProgress.value = withTiming(0, { duration: 80 });
        })
        .onStart(() => {
          if (!action.partId) return;
          const store = useGameStore.getState();
          const furniture = store.furniture;
          if (!furniture) return;
          const part = furniture.parts[action.partId];
          const reGrab = store.heldActionId === action.actionId;
          if (!reGrab) {
            // Fresh pickup: spawn the part at the camera pivot on the work
            // plane. focus carries the world shift and the rendered base re-adds
            // it, so subtract it once here.
            const focus = getFocusPoint();
            const ws = store.worldShift;
            const planeY = part.pose.position[1] + HOVER_LIFT_M;
            const base: Float3 = [
              focus[0] - part.pose.position[0] - ws[0],
              planeY - part.pose.position[1],
              focus[2] - part.pose.position[2] - ws[2],
            ];
            heldDriver.set(base);
            store.beginPickup(action.actionId);
            if (useGameStore.getState().heldActionId !== action.actionId) return;
            Haptics.selectionAsync();
          }
          ringProgress.value = withTiming(0, { duration: 120 });
          rebuildSession(action);
        })
        .onUpdate((e) => driveHeldToFinger(e.absoluteX, e.absoluteY))
        // onFinalize (not onEnd): runs on end, cancel, AND failure, so the held
        // phase always resolves — no stuck states if a scroll view or system
        // interruption cancels the gesture.
        .onFinalize(() => {
          ringProgress.value = withTiming(0, { duration: 80 });
          finalizeHeld();
        }),
    [getFocusPoint, heldDriver, rebuildSession, driveHeldToFinger, finalizeHeld, ringX, ringY, ringProgress],
  );

  // ── Canvas one-finger gesture. ──
  // • Nothing in hand → drag pans the table (camera strafe).
  // • A part floating in hand → drag picks it up / nudges it into place.
  // Two-finger pan / pinch (different finger counts) drive the camera otherwise.
  const canvasGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .maxPointers(1)
        .onStart((e) => {
          const store = useGameStore.getState();
          const held = store.heldActionId;
          if (!held) {
            // Empty canvas → strafe the camera so the table pans.
            onPanStart(e.absoluteX, e.absoluteY);
            return;
          }
          const action = store.furniture?.actions.find(
            (a) => a.actionId === held,
          );
          if (!action) return;
          if (!session.current || session.current.actionId !== held)
            rebuildSession(action);
          driveHeldToFinger(e.absoluteX, e.absoluteY);
        })
        .onUpdate((e) => {
          if (useGameStore.getState().heldActionId)
            driveHeldToFinger(e.absoluteX, e.absoluteY);
          else onPanMove(e.absoluteX, e.absoluteY);
        })
        .onFinalize(() => {
          if (useGameStore.getState().heldActionId) finalizeHeld();
          else onPanEnd();
        }),
    [rebuildSession, driveHeldToFinger, finalizeHeld, onPanStart, onPanMove, onPanEnd],
  );

  // One stable gesture instance per action: store updates re-render the tray
  // mid-touch, and handing GestureDetector a fresh Gesture.Pan() then would
  // reattach the handler and kill the active gesture.
  const gestureCache = useMemo(() => new Map<string, GestureType>(), [buildGesture]);
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

  return { gestureFor, canvasGesture, ringOverlay };
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