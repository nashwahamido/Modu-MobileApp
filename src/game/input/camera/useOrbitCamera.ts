import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InteractionManager, useWindowDimensions } from "react-native";
import { useCameraManipulator, useFilamentContext } from "react-native-filament";
import { buildPartStage } from "@/src/game/core/scene/targets";
import { clusterPivot } from "@/src/game/core/geometry/staging";
import { PartDef, Vec3 } from "@/src/game/core/type";
import { useGameStore } from "@/src/game/core/store";
import { useSharedValue as useWorkletSharedValue } from "react-native-worklets-core";
import type { ISharedValue } from "react-native-worklets-core";
import type { StickDeflection } from "@/src/game/scene/OrbitDrive";

import { FOV_Y_DEG } from "@/src/game/scene/cameraConfig";
/** Drop-in replacement for the library's useCameraManipulator that fixes its swap race. On a pivot change the library hook sets its state to undefined and releases the old native manipulator while the replacement is still arriving via a promise — the Camera's render-thread callback can execute the already-released pointer in between ("Pointer ManipulatorWrapper has already been manually released!"). Here the hook keeps returning the OLD manipulator until the replacement is created (synchronously) and committed; the old wrapper's release is deferred until well after the commit that hands the render callback its replacement. */
function useStableOrbitManipulator(
  eye: readonly [number, number, number],
  target: readonly [number, number, number],
): ReturnType<typeof useCameraManipulator> {
  const { engine } = useFilamentContext();
  const [manipulator, setManipulator] =
    useState<ReturnType<typeof useCameraManipulator>>();
  const [eyeX, eyeY, eyeZ] = eye;
  const [targetX, targetY, targetZ] = target;
  useEffect(() => {
    const next = engine.createOrbitCameraManipulator({
      orbitHomePosition: [eyeX, eyeY, eyeZ],
      targetPosition: [targetX, targetY, targetZ],
      orbitSpeed: [0.005, 0.005],
    });
    setManipulator(next);
    return () => {
      // The successor effect runs right after this cleanup and commits the replacement; by the time this fires the render thread is off the old pointer. runAfterInteractions also keeps the release out of an active gesture, matching the library's own withCleanupScope timing.
      InteractionManager.runAfterInteractions(() => {
        setTimeout(() => next.release(), 100);
      });
    };
  }, [engine, eyeX, eyeY, eyeZ, targetX, targetY, targetZ]);
  return manipulator;
}

const ZOOM_RATE = 32;
const HOME_EYE: [number, number, number] = [1.0, 0.85, 1.0];
const QUARTER_TURN_PX = Math.PI / 2 / 0.005;
const AUTOVIEW_MIN_MOVE_M = 0.12;
const AUTOVIEW_SETTLE_MS = 450;
const NO_PLACED_PARTS = new Set<string>();

/** Camera orbit pivot for a stage: the vertical centre of what's visible. When a cluster is focused, frame that sub-assembly; otherwise frame everything built up to and including the stage. */
function pivotFor(
  parts: Record<string, PartDef>,
  partStage: Record<string, number>,
  stage: number,
  activeCluster: string | null,
  focusPoint: Vec3 | null,
  focusPartId: string | null,
  focusCluster: string | null,
  placed: ReadonlySet<string>,
): Vec3 {
  if (focusPoint) return focusPoint;
  if (focusPartId && parts[focusPartId]) return clusterPivot([parts[focusPartId]]);

  const cluster = focusCluster ?? activeCluster;
  const candidates = cluster
    ? Object.values(parts).filter((p) => p.cluster === cluster)
    : Object.values(parts).filter((p) => (partStage[p.partId] ?? 9) <= stage);
  const set = candidates.length ? candidates : Object.values(parts);

  const placedInSet = set.filter((p) => placed.has(p.partId));
  return clusterPivot(placedInSet.length ? placedInSet : set);
}

/**
 * Rate-control orbit: while the stick is deflected, a 16ms loop feeds accumulated viewport deltas into the manipulator's grab session. Pinch scale deltas map to scroll() zoom.
 *
 * The orbit pivot tracks the centre of the assembly built so far (per stage). Filament manipulators take their target at construction, so a pivot change recreates the manipulator; the current eye position is carried over so only the gaze re-aims.
 */
export function useOrbitCamera(
  {
    stableFraming = false,
    stickShared,
  }: {
    stableFraming?: boolean;
    /** Joystick deflection, written by the stick gesture and read by OrbitDrive on the
     *  render thread. When provided, orbit runs off the JS thread (immune to drag load). */
    stickShared?: ISharedValue<StickDeflection>;
  } = {},
) {
  // Whether a stick grab session is open — read by OrbitDrive's render callback. Owned here because grabBegin/grabEnd lifecycle lives on the JS side.
  const stickActive = useWorkletSharedValue(false);
  /** The two-finger pan, read by OrbitDrive on the render thread. */
  const panShared = useWorkletSharedValue({ x: 0, y: 0, z: 0 });
  const stage = useGameStore((s) => s.stage());
  const activeCluster = useGameStore((s) => s.activeCluster);
  const examine = useGameStore((s) => s.examine);
  const heldActionId = useGameStore((s) => s.heldActionId);
  const furniture = useGameStore((s) => s.furniture);
  const completed = useGameStore((s) => s.completed);
  const targetRef = useRef<[number, number, number]>([0, 0, 0]);
  const partStage = useMemo(
    () => (furniture ? buildPartStage(furniture.actions) : {}),
    [furniture],
  );
  const placed = useMemo(() => {
    const set = new Set<string>();
    if (!furniture) return set;
    const done = new Set(completed);
    for (const a of furniture.actions) {
      if (a.type === "placePart" && a.partId && done.has(a.actionId)) set.add(a.partId);
    }
    return set;
  }, [furniture, completed]);
  const heldFocusPoint = useMemo<Vec3 | null>(() => {
    if (!furniture || !heldActionId) return null;
    const action = furniture.actions.find((a) => a.actionId === heldActionId);
    if (!action?.partId) return null;
    return targetRef.current;
  }, [furniture, heldActionId]);
  const examinePartId = examine?.kind === "part" ? examine.partId : null;
  const focusCluster = examine?.kind === "cluster" ? examine.cluster : null;
  const autoView = useGameStore((s) => s.settings.autoView);
  const nextTargetPartId = useGameStore((s) => {
    if (!s.settings.autoView || !s.furniture) return null;
    const a = s
      .availableForMode()
      .find(
        (x) =>
          x.partId && (x.type === "placePart" || x.type === "insertFastener"),
      );
    return a?.partId ?? null;
  });
  const effectiveAutoView = autoView && !stableFraming;
  const focusPartId =
    examinePartId ??
    (effectiveAutoView && !heldActionId ? nextTargetPartId : null);
  const combiningCluster = useGameStore((s) => s.combiningCluster);
  const framingCluster = combiningCluster ? null : activeCluster;

  const placedRef = useRef(placed);
  placedRef.current = placed;

  const framedHasPlaced = useMemo(() => {
    if (!furniture) return false;
    const cluster = focusCluster ?? framingCluster;
    for (const p of Object.values(furniture.parts)) {
      const inFrame = cluster ? p.cluster === cluster : (partStage[p.partId] ?? 9) <= stage;
      if (inFrame && placed.has(p.partId)) return true;
    }
    return false;
  }, [furniture, focusCluster, framingCluster, stage, partStage, placed]);

  const pivot = useCallback(
    (
      st: number,
      cl: string | null,
      point: Vec3 | null,
      partId: string | null,
      cluster: string | null,
    ): [number, number, number] => {
      const p = furniture
        ? pivotFor(
            furniture.parts,
            partStage,
            st,
            cl,
            point,
            partId,
            cluster,
            stableFraming ? NO_PLACED_PARTS : placedRef.current,
          )
        : ([0, 0, 0] as Vec3);
      return [p[0], p[1], p[2]];
    },
    [furniture, partStage, stableFraming],
  );

  const eyeRef = useRef<[number, number, number]>(HOME_EYE);
  const resetTick = useRef(0);
  const panning = useRef(false);
  const { height: winH } = useWindowDimensions();
  const [home, setHome] = useState(() => ({
    eye: HOME_EYE,
    target: pivot(stage, framingCluster, heldFocusPoint, focusPartId, focusCluster),
  }));

  useEffect(() => {
    targetRef.current = home.target;
  }, [home.target]);

  const manipulator = useStableOrbitManipulator(home.eye, home.target);

  const captureEye = useCallback(() => {
    const la = manipulator?.getLookAt();
    if (la) eyeRef.current = [la[0][0], la[0][1], la[0][2]];
  }, [manipulator]);

  useEffect(() => {
    if (useGameStore.getState().heldActionId) return;
    // In the tutorial, the first pickup aims the camera at the real drop point.
    // Keep that exact target after placement so the centre ring stays aligned and the newly placed part does not jump when held state is cleared.
    if (stableFraming && framedHasPlaced) return;
    const nextTarget = pivot(stage, framingCluster, null, focusPartId, focusCluster);
    const apply = () =>
      setHome((h) =>
        h.target.every((v, i) => Math.abs(v - nextTarget[i]) < 1e-5)
          ? h
          : { eye: eyeRef.current, target: nextTarget },
      );
    const autoDriven =
      effectiveAutoView && !examinePartId && focusPartId != null;
    if (autoDriven) {
      const cur = targetRef.current;
      const dist = Math.hypot(
        nextTarget[0] - cur[0],
        nextTarget[1] - cur[1],
        nextTarget[2] - cur[2],
      );
      if (dist < AUTOVIEW_MIN_MOVE_M) return;
      const id = setTimeout(apply, AUTOVIEW_SETTLE_MS);
      return () => clearTimeout(id);
    }
    apply();
  }, [
    stage,
    framingCluster,
    focusPartId,
    focusCluster,
    framedHasPlaced,
    pivot,
    effectiveAutoView,
    examinePartId,
    stableFraming,
  ]);

  useEffect(() => {
    if (!furniture || !heldActionId || framedHasPlaced) return;
    const action = furniture.actions.find((a) => a.actionId === heldActionId);
    const part = action?.partId ? furniture.parts[action.partId] : null;
    if (!part) return;
    const c = clusterPivot([part]);
    setHome((h) =>
      h.target.every((v, i) => Math.abs(v - c[i]) < 1e-5)
        ? h
        : { eye: eyeRef.current, target: [c[0], c[1], c[2]] },
    );
  }, [furniture, heldActionId, framedHasPlaced]);

  const grabbing = useRef(false);

  // The per-frame orbit integration lives on the RENDER thread (scene/OrbitDrive), not a JS setInterval — a runOnJS part-drag saturating the JS thread used to starve that interval and freeze the camera until the finger lifted. Here the JS side only owns the grab SESSION (grabBegin/grabEnd); OrbitDrive feeds grabUpdate each frame while stickActive is true. If no stickShared was provided the camera simply won't orbit via the stick, which is fine for screens that don't mount OrbitDrive.

  const onStickStart = useCallback(() => {
    // Symmetric with onPanStart's active guard: one manipulator supports a single grab session, so an overlapping two-finger pan and stick touch must not double-grabBegin.
    if (panning.current || grabbing.current) return;
    grabbing.current = true;
    manipulator?.grabBegin(0, 0, false);
    // Open the render-thread session AFTER grabBegin so OrbitDrive's first grabUpdate lands on a live session. OrbitDrive resets its own accumulator when it sees active flip.
    stickActive.value = true;
  }, [manipulator, stickActive]);

  const onStickMove = useCallback(
    (x: number, y: number) => {
      // UI-thread write; OrbitDrive reads it on the render thread. Kept as a JS callback for API compatibility with the Joystick, but the Joystick also writes stickShared directly in its worklet so movement never depends on this JS hop.
      if (stickShared) stickShared.value = { x, y };
    },
    [stickShared],
  );

  const onStickEnd = useCallback(() => {
    if (!grabbing.current) return;
    grabbing.current = false;
    stickActive.value = false;
    if (stickShared) stickShared.value = { x: 0, y: 0 };
    manipulator?.grabEnd();
    captureEye();
  }, [manipulator, captureEye, stickActive, stickShared]);

  const orbitBy = useCallback(
    (dx: number, dy: number) => {
      if (!manipulator) return;
      manipulator.grabBegin(0, 0, false);
      manipulator.grabUpdate(dx, dy);
      manipulator.grabEnd();
      captureEye();
    },
    [manipulator, captureEye],
  );

  const onZoomDelta = useCallback(
    (scaleDelta: number) => {
      manipulator?.scroll(0, 0, -scaleDelta * ZOOM_RATE);
      captureEye();
    },
    [manipulator, captureEye],
  );

  /**
   * The pan is OURS now, not the manipulator's.
   *
   * grabBegin(..., true) trucks eye and target together, which moves the orbit centre off the model
   * — that is what made rotation swing the model around the screen. Instead the gesture accumulates
   * a world displacement in panShared, and OrbitDrive shifts the finished lookAt pair by it on the
   * render thread. The manipulator's target never leaves the model, so orbit stays on its axis.
   */
  const panStartRef = useRef({ x: 0, y: 0, pan: { x: 0, y: 0, z: 0 } });
  const onPanStart = useCallback(
    (x: number, y: number) => {
      if (grabbing.current) return;
      panning.current = true;
      panStartRef.current = { x, y, pan: { ...panShared.value } };
    },
    [panShared],
  );
  const onPanMove = useCallback(
    (x: number, y: number) => {
      if (!panning.current) return;
      const la = manipulator?.getLookAt();
      if (!la) return;
      const [eye, target] = la;
      const f = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
      const fl = Math.hypot(f[0], f[1], f[2]) || 1;
      const fwd = [f[0] / fl, f[1] / fl, f[2] / fl];
      const up = la[2];
      const r = [
        fwd[1] * up[2] - fwd[2] * up[1],
        fwd[2] * up[0] - fwd[0] * up[2],
        fwd[0] * up[1] - fwd[1] * up[0],
      ];
      const rl = Math.hypot(r[0], r[1], r[2]) || 1;
      const right = [r[0] / rl, r[1] / rl, r[2] / rl];
      const camUp = [
        right[1] * fwd[2] - right[2] * fwd[1],
        right[2] * fwd[0] - right[0] * fwd[2],
        right[0] * fwd[1] - right[1] * fwd[0],
      ];
      // Metres per pixel AT THE TARGET'S DISTANCE, so the model tracks the fingers 1:1 rather than
      // sliding faster or slower depending on how far away it is.
      const mPerPx = (2 * fl * Math.tan((FOV_Y_DEG * Math.PI) / 360)) / winH;
      const dx = (x - panStartRef.current.x) * mPerPx;
      const dy = (y - panStartRef.current.y) * mPerPx;
      // Moving the fingers right moves the MODEL right, which means the view goes left — hence the
      // negated right component. Screen-y grows downward, so its sign flips again for world up.
      const base = panStartRef.current.pan;
      panShared.value = {
        x: base.x - right[0] * dx + camUp[0] * dy,
        y: base.y - right[1] * dx + camUp[1] * dy,
        z: base.z - right[2] * dx + camUp[2] * dy,
      };
    },
    [manipulator, panShared, winH],
  );
  const onPanEnd = useCallback(() => {
    if (!panning.current) return;
    panning.current = false;
  }, []);

  const resetCamera = useCallback(() => {
    resetTick.current += 1;
    const target = pivot(stage, framingCluster, heldFocusPoint, focusPartId, focusCluster);
    eyeRef.current = HOME_EYE;
    // Recentre means recentre: the accumulated pan is part of what the player is undoing.
    panShared.value = { x: 0, y: 0, z: 0 };
    setHome({
      eye: HOME_EYE,
      target: [
        target[0],
        target[1] + (resetTick.current % 2) * 1e-4,
        target[2],
      ],
    });
  }, [stage, framingCluster, heldFocusPoint, focusPartId, focusCluster, pivot, panShared]);

  const getFocusPoint = useCallback((): Vec3 => targetRef.current, []);
  const isViewingUnderside = useCallback((): boolean => {
    const lookAt = manipulator?.getLookAt();
    if (!lookAt) return false;
    const eye = lookAt[0];
    const target = lookAt[1];
    const horizontalDistance = Math.hypot(
      eye[0] - target[0],
      eye[2] - target[2],
    );
    // At this shallow elevation the camera is level with, or below, the assembly pivot and the underside of a horizontal tabletop is visible.
    return eye[1] - target[1] <= horizontalDistance * 0.15;
  }, [manipulator]);

  return {
    manipulator,
    stickActive,
    panShared,
    getFocusPoint,
    onStickStart,
    onStickMove,
    onStickEnd,
    onZoomDelta,
    onPanStart,
    onPanMove,
    onPanEnd,
    resetCamera,
    isViewingUnderside,
    orbitBy,
    rotateQuarter: (direction: -1 | 1) => orbitBy(QUARTER_TURN_PX * direction, 0),
  };
}