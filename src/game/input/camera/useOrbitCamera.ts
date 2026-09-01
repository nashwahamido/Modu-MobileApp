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
import type { GetLookAt } from "@/src/game/scene/projectToScreen";

import { blocksZoomIn, FOV_Y_DEG } from "@/src/game/scene/cameraConfig";

// useCameraManipulator, minus its swap race: on a pivot change the library hook drops to undefined and releases the old native manipulator while the replacement is still arriving by promise, and the render callback can execute the dead pointer in between. Here the OLD one keeps being returned until the replacement is built and committed
function useStableOrbitManipulator(
  eye: readonly [number, number, number],
  target: readonly [number, number, number],
): ReturnType<typeof useCameraManipulator> {
  const { engine } = useFilamentContext();
  const [manipulator, setManipulator] =
    useState<ReturnType<typeof useCameraManipulator>>();
  // every manipulator made here, all released at unmount. Freeing one per swap crashes
  const retired = useRef<ReturnType<typeof useCameraManipulator>[]>([]);
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
      // NOT released here — see retired
      retired.current.push(next);
    };
  }, [engine, eyeX, eyeY, eyeZ, targetX, targetY, targetZ]);

  // the whole set goes with the screen, when no render callback is left to hold one
  useEffect(
    () => () => {
      const all = retired.current;
      retired.current = [];
      InteractionManager.runAfterInteractions(() => {
        setTimeout(() => {
          for (const m of all) {
            try {
              // the hook's return type includes undefined, so the array can hold one
              m?.release();
            } catch {
              // already gone: releasing twice is not worth a crash on the way out of a screen
            }
          }
        }, 200);
      });
    },
    [],
  );
  return manipulator;
}

const ZOOM_RATE = 32;
const HOME_EYE: [number, number, number] = [1.0, 0.85, 1.0];
const QUARTER_TURN_PX = Math.PI / 2 / 0.005;
const NO_PLACED_PARTS = new Set<string>();

// orbit pivot: centre of what's visible — a focused cluster, else everything built up to the stage
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

// orbit / zoom / pan for the assembly camera. Deflection goes to stickShared, OrbitDrive integrates it per frame
// pivot follows the assembly built so far. A pivot change rebuilds the manipulator (target is set at construction), carrying the eye over so only the gaze re-aims
export function useOrbitCamera(
  {
    stableFraming = false,
    stickShared,
  }: {
    stableFraming?: boolean;
    // stick deflection, read by OrbitDrive on the render thread. Omitted on screens with no OrbitDrive
    stickShared?: ISharedValue<StickDeflection>;
  } = {},
) {
  // is a grab session open? read by OrbitDrive
  const stickActive = useWorkletSharedValue(false);
  // the two-finger pan, read by OrbitDrive
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
    target: pivot(stage, framingCluster, heldFocusPoint, examinePartId, focusCluster),
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
    // tutorial: keep the pickup's target after placement, so the ring stays aligned and the part does not jump
    if (stableFraming && framedHasPlaced) return;
    const nextTarget = pivot(stage, framingCluster, null, examinePartId, focusCluster);
    setHome((h) =>
      h.target.every((v, i) => Math.abs(v - nextTarget[i]) < 1e-5)
        ? h
        : { eye: eyeRef.current, target: nextTarget },
    );
  }, [
    stage,
    framingCluster,
    examinePartId,
    focusCluster,
    framedHasPlaced,
    pivot,
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

  // JS owns the grab session only; OrbitDrive feeds grabUpdate per frame. Not a JS timer — a part drag starves it

  // a manipulator swap rebuilds the gesture under a held finger, so the lift is lost and grabbing strands true. Reopen the grab rather than just clearing it; OrbitDrive re-zeros on the same change so the origins line up
  // panning left alone — it reads the live lookAt and re-anchors on its own onPanStart
  useEffect(() => {
    if (!manipulator || !grabbing.current) return;
    if (__DEV__) console.log("[orbit] manipulator swapped mid-grab — reopening stick session");
    manipulator.grabBegin(0, 0, false);
  }, [manipulator]);

  const onStickStart = useCallback(() => {
    // guards a double grabBegin only. The pan opens no session, so the two compose — no cross-guard
    if (grabbing.current) {
      // the swap effect above closes the one known path here. If this fires on device there is another, and the camera is about to stop turning
      if (__DEV__) console.warn("[orbit] stick start refused — a grab session is already open");
      return;
    }
    grabbing.current = true;
    manipulator?.grabBegin(0, 0, false);
    // after grabBegin, so OrbitDrive's first grabUpdate lands on a live session
    stickActive.value = true;
  }, [manipulator, stickActive]);

  const onStickMove = useCallback(
    (x: number, y: number) => {
      // the stick's only write path. Not writable from the gesture worklet — Reanimated and worklets-core are separate runtimes
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
      if (!manipulator) return;
      // floor the dolly — ORBIT scroll has no minimum, and under a high work plane every finger ray aims up and flings the held part to the leash. See MIN_ORBIT_DISTANCE_M
      const la = manipulator.getLookAt();
      if (la) {
        const d = Math.hypot(
          la[0][0] - la[1][0],
          la[0][1] - la[1][1],
          la[0][2] - la[1][2],
        );
        if (blocksZoomIn(scaleDelta, d)) return;
      }
      manipulator.scroll(0, 0, -scaleDelta * ZOOM_RATE);
      captureEye();
    },
    [manipulator, captureEye],
  );

  // the pan is ours: a world displacement in panShared, applied by OrbitDrive. Not grabBegin(..., true) — trucking the target off the model makes rotation swing it around the screen
  const panStartRef = useRef({ x: 0, y: 0, pan: { x: 0, y: 0, z: 0 } });
  const onPanStart = useCallback(
    (x: number, y: number) => {
      // no grab guard: never touches the manipulator's session, so it composes with a stick orbit
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
      // metres per pixel AT THE TARGET'S DISTANCE, so the model tracks the fingers 1:1 at any zoom
      const mPerPx = (2 * fl * Math.tan((FOV_Y_DEG * Math.PI) / 360)) / winH;
      const dx = (x - panStartRef.current.x) * mPerPx;
      const dy = (y - panStartRef.current.y) * mPerPx;
      // fingers right = model right = view left, hence the negated right. Screen-y grows down, so it flips again
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
    const target = pivot(stage, framingCluster, heldFocusPoint, examinePartId, focusCluster);
    eyeRef.current = HOME_EYE;
    // recentre means recentre — the accumulated pan is part of what is being undone
    panShared.value = { x: 0, y: 0, z: 0 };
    setHome({
      eye: HOME_EYE,
      target: [
        target[0],
        target[1] + (resetTick.current % 2) * 1e-4,
        target[2],
      ],
    });
  }, [stage, framingCluster, heldFocusPoint, examinePartId, focusCluster, pivot, panShared]);

  // opening a cluster is a fresh view — the eye carried over by the pivot effect describes parts that just left the screen. Declared after resetCamera so it commits after that effect
  // real clusters only: null is the combine, which has its own choreography
  const framedRef = useRef(framingCluster);
  useEffect(() => {
    if (framedRef.current === framingCluster) return;
    framedRef.current = framingCluster;
    if (!framingCluster) return;
    resetCamera();
  }, [framingCluster, resetCamera]);

  // what the RENDERER draws with: the manipulator's pair plus the pan it never learns about unproject through THIS, never the raw manipulator — raw leaves every held part one pan off the finger
  const getLookAt = useCallback<GetLookAt>(() => {
    const la = manipulator?.getLookAt();
    if (!la) return null;
    const p = panShared.value;
    if (!p.x && !p.y && !p.z) return la;
    // a translation, so up rides through unchanged
    return [
      [la[0][0] + p.x, la[0][1] + p.y, la[0][2] + p.z],
      [la[1][0] + p.x, la[1][1] + p.y, la[1][2] + p.z],
      la[2],
    ];
  }, [manipulator, panShared]);

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
    return eye[1] - target[1] <= horizontalDistance * 0.15;
  }, [manipulator]);

  return {
    manipulator,
    stickActive,
    panShared,
    getLookAt,
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