import { useCallback, useMemo, useRef } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureType } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useGameStore } from '../game/store';
import { computeFit } from '../game/fit';
import { groupCandidates, targetPositionForAction, targetRotationForAction } from '../game/targets';
import type { GroupCandidate } from '../game/targets';
import { PARTS } from '../game/parts';
import { HOVER_LIFT_M, spawnDelta } from '../game/staging';
import { animateDriver, OffsetDriver } from '../scene/offsetDriver';
import { FOV_Y_DEG } from '../scene/cameraConfig';
import { screenPointOnPlane } from '../game/math';
import { ACTION_BY_ID, type AssemblyAction } from '../game/assembly';
import type { OrbitManipulator } from '../scene/AssemblyScene';
import type { Vec3 } from '../game/math';
import { useTutorialStore } from '../tutorial/store';

type Float3 = [number, number, number];

const PICKUP_MS = 450;
/** The held part rides this far above the fingertip (screen dp) so the finger doesn't cover it. */
const FINGER_LIFT_DP = 36;
/** Held parts are kept within this radius of the bench centre, world meters. */
const BENCH_RADIUS_M = 0.9;
const RING = 64;

interface Params {
  manipulator: OrbitManipulator;
  heldDriver: OffsetDriver;
}

/**
 * Tray-item drag: long-press a tray card (progress ring) to take the part in
 * hand — it materializes at the spawn point on the work plane — then keep the
 * finger down to pan it; release snaps or returns it to the tray.
 */
export function usePartDrag({ manipulator, heldDriver }: Params) {
  const session = useRef<{
    base: Float3;
    /** Interchangeable sockets the held part may snap to (same part group). */
    candidates: GroupCandidate[];
    /** Live sockets outside the group, for wrong-target detection. */
    otherSockets: Vec3[];
    bakedPos: Vec3;
    planeY: number;
  } | null>(null);

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
      const p = screenPointOnPlane({ eye, center, up }, FOV_Y_DEG, winW, winH, absX, absY - FINGER_LIFT_DP, planeY);
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

  const rebuildSession = useCallback((action: AssemblyAction) => {
    if (!action.partId) return false;
    const part = PARTS[action.partId];
    const target = targetPositionForAction(action);
    const planeY = target[1] + HOVER_LIFT_M;
    const avail = useGameStore.getState().available();
    const candidates = groupCandidates(avail, action);
    const groupIds = new Set(candidates.map((c) => c.action.id));
    const otherSockets = avail
      .filter((a) => a.partId && (a.type === 'snapPart' || a.type === 'insertFastener') && !groupIds.has(a.id))
      .map((a) => targetPositionForAction(a));
    session.current = {
      base: heldDriver.value,
      candidates,
      otherSockets,
      bakedPos: part.pose.position,
      planeY,
    };
    return true;
  }, [heldDriver]);

  const driveHeldToFinger = useCallback(
    (action: AssemblyAction, absX: number, absY: number) => {
      const s = session.current;
      const store = useGameStore.getState();
      if (!s || store.phase !== 'held' || store.heldActionId !== action.id) return;
      const p = fingerOnPlane(absX, absY, s.planeY);
      if (p) heldDriver.set([p[0] - s.bakedPos[0], s.planeY - s.bakedPos[1], p[2] - s.bakedPos[2]]);
      const off = heldDriver.value;
      const held: Vec3 = [
        s.bakedPos[0] + off[0],
        s.bakedPos[1] + off[1] - HOVER_LIFT_M,
        s.bakedPos[2] + off[2],
      ];
      const rot = targetRotationForAction(action);
      let best = s.candidates[0];
      let bestD = Infinity;
      for (const c of s.candidates) {
        const d = Math.hypot(held[0] - c.position[0], held[1] - c.position[1], held[2] - c.position[2]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      const fs = computeFit(held, rot, { position: best.position, rotation: best.rotation }, s.otherSockets);
      if (fs !== store.fitState || best.action.id !== store.matchedActionId) store.setDragFit(fs, best.action.id);
    },
    [fingerOnPlane, heldDriver],
  );

  const finalizeHeld = useCallback(
    (action: AssemblyAction) => {
      const store = useGameStore.getState();
      if (store.phase !== 'held' || store.heldActionId !== action.id) return;
      const s = session.current;
      session.current = null;
      if (!s) {
        store.cancelHeld();
        return;
      }
      const ready = store.fitState === 'nearCorrect' || store.fitState === 'nearRotation';
      const matched = s.candidates.find((c) => c.action.id === store.matchedActionId) ?? s.candidates[0];
      if (ready) {
        const dest: Float3 = [
          matched.position[0] - s.bakedPos[0],
          matched.position[1] - s.bakedPos[1],
          matched.position[2] - s.bakedPos[2],
        ];
        animateDriver(heldDriver, dest, 250, () => {
          const result = useGameStore.getState().releaseHeld();
          if (result === 'snap') useTutorialStore.getState().completeEvent('part_snapped');
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        });
        return;
      }

      if (!store.missedDropPromptAnswered) {
        store.setDragFit('held', null);
        store.showMissedDropPrompt('missedDrop');
        Haptics.selectionAsync();
        return;
      }

      if (store.missedDropBehavior === 'keepOnCanvas') {
        store.setDragFit('held', null);
        Haptics.selectionAsync();
        return;
      }

      // Not snapped: the part flies back toward the tray (screen right)
      // and returns to inventory.
      const la = manipulator?.getLookAt();
      const off = heldDriver.value;
      let dest: Float3 = s.base;
      if (la) {
        const [eye, center] = la;
        const fx = center[0] - eye[0];
        const fz = center[2] - eye[2];
        const fl = Math.hypot(fx, fz) || 1;
        dest = [off[0] + (-fz / fl) * 0.55, off[1] + 0.08, off[2] + (fx / fl) * 0.55];
      }
      animateDriver(heldDriver, dest, 220, () => {
        useGameStore.getState().cancelHeld();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      });
    },
    [heldDriver, manipulator],
  );

  const buildGesture = useCallback(
    (action: AssemblyAction) =>
      Gesture.Pan()
        .runOnJS(true)
        .activateAfterLongPress(PICKUP_MS)
        .onTouchesDown((e) => {
          const store = useGameStore.getState();
          if (store.phase !== 'idle' && store.heldActionId !== action.id) return;
          if (store.heldActionId !== action.id && !store.available().some((a) => a.id === action.id)) return;
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
          const reGrabFloatingPart = store.heldActionId === action.id;
          const part = PARTS[action.partId];
          const target = targetPositionForAction(action);
          const planeY = target[1] + HOVER_LIFT_M;
          if (!reGrabFloatingPart) {
            // The part materializes on the work plane under the finger; the
            // spawn point is only the fallback when the finger is at the horizon.
            const p = fingerOnPlane(e.absoluteX, e.absoluteY, planeY);
            const base: Float3 = p
              ? [p[0] - part.pose.position[0], planeY - part.pose.position[1], p[2] - part.pose.position[2]]
              : spawnDelta(action.partId, planeY);
            // Seed the driver before the held model mounts and attaches.
            heldDriver.set(base);
            store.beginPickup(action.id);
            if (useGameStore.getState().heldActionId !== action.id) return;
            useTutorialStore.getState().completeEvent('part_picked_up');
            Haptics.selectionAsync();
          }
          ringProgress.value = withTiming(0, { duration: 120 });
          rebuildSession(action);
        })
        .onUpdate((e) => driveHeldToFinger(action, e.absoluteX, e.absoluteY))
        // onFinalize (not onEnd): runs on end, cancel, AND failure, so the
        // held phase always resolves — no stuck states if the gesture is
        // cancelled by a scroll view or system interruption.
        .onFinalize(() => {
          ringProgress.value = withTiming(0, { duration: 80 });
          finalizeHeld(action);
        }),
    [heldDriver, fingerOnPlane, rebuildSession, driveHeldToFinger, finalizeHeld, ringX, ringY, ringProgress],
  );

  const canvasGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .maxPointers(1)
        .onStart((e) => {
          const heldActionId = useGameStore.getState().heldActionId;
          const action = heldActionId ? ACTION_BY_ID.get(heldActionId) : null;
          if (!action) return;
          rebuildSession(action);
          driveHeldToFinger(action, e.absoluteX, e.absoluteY);
        })
        .onUpdate((e) => {
          const heldActionId = useGameStore.getState().heldActionId;
          const action = heldActionId ? ACTION_BY_ID.get(heldActionId) : null;
          if (!action) return;
          driveHeldToFinger(action, e.absoluteX, e.absoluteY);
        })
        .onFinalize(() => {
          const heldActionId = useGameStore.getState().heldActionId;
          const action = heldActionId ? ACTION_BY_ID.get(heldActionId) : null;
          if (!action) return;
          finalizeHeld(action);
        }),
    [rebuildSession, driveHeldToFinger, finalizeHeld],
  );

  // One stable gesture instance per action: store updates re-render the tray
  // mid-touch, and handing GestureDetector a fresh Gesture.Pan() then would
  // reattach the handler and kill the active gesture.
  const gestureCache = useMemo(() => new Map<string, GestureType>(), [buildGesture]);
  const gestureFor = useCallback(
    (action: AssemblyAction) => {
      let g = gestureCache.get(action.id);
      if (!g) {
        g = buildGesture(action);
        gestureCache.set(action.id, g);
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

  const ringOverlay = <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />;

  return { gestureFor, canvasGesture, ringOverlay };
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderColor: '#e8842c',
  },
});
