import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InteractionManager, useWindowDimensions } from "react-native";
import { useCameraManipulator, useFilamentContext } from "react-native-filament";
import { buildPartStage } from "@/src/game/core/scene/targets";
import { clusterPivot } from "@/src/game/core/geometry/staging";
import { PartDef, Vec3 } from "@/src/game/core/type";
import { useGameStore } from "@/src/game/core/store";

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

const ORBIT_RATE = 220;
const ZOOM_RATE = 32;
const HOME_EYE: [number, number, number] = [1.0, 0.85, 1.0];
const QUARTER_TURN_PX = Math.PI / 2 / 0.005;
const AUTOVIEW_MIN_MOVE_M = 0.12;
const AUTOVIEW_SETTLE_MS = 450;

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
export function useOrbitCamera() {
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
  const focusPartId =
    examinePartId ?? (autoView && !heldActionId ? nextTargetPartId : null);
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
        ? pivotFor(furniture.parts, partStage, st, cl, point, partId, cluster, placedRef.current)
        : ([0, 0, 0] as Vec3);
      return [p[0], p[1], p[2]];
    },
    [furniture, partStage],
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
    const nextTarget = pivot(stage, framingCluster, null, focusPartId, focusCluster);
    const apply = () =>
      setHome((h) =>
        h.target.every((v, i) => Math.abs(v - nextTarget[i]) < 1e-5)
          ? h
          : { eye: eyeRef.current, target: nextTarget },
      );
    const autoDriven = autoView && !examinePartId && focusPartId != null;
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
  }, [stage, framingCluster, focusPartId, focusCluster, framedHasPlaced, pivot, autoView, examinePartId]);

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

  const stick = useRef({ x: 0, y: 0 });
  const grab = useRef({ active: false, x: 0, y: 0 });

  useEffect(() => {
    const tick = setInterval(() => {
      const g = grab.current;
      if (!g.active || !manipulator || panning.current) return;
      g.x += stick.current.x * ORBIT_RATE * 0.016;
      g.y += stick.current.y * ORBIT_RATE * 0.016;
      manipulator.grabUpdate(g.x, g.y);
    }, 16);
    return () => clearInterval(tick);
  }, [manipulator]);

  const onStickStart = useCallback(() => {
    grab.current = { active: true, x: 0, y: 0 };
    manipulator?.grabBegin(0, 0, false);
  }, [manipulator]);

  const onStickMove = useCallback((x: number, y: number) => {
    stick.current = { x, y };
  }, []);

  const onStickEnd = useCallback(() => {
    grab.current.active = false;
    stick.current = { x: 0, y: 0 };
    manipulator?.grabEnd();
    captureEye();
  }, [manipulator, captureEye]);

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

  const onPanStart = useCallback(
    (x: number, y: number) => {
      if (grab.current.active) return;
      panning.current = true;
      manipulator?.grabBegin(x, winH - y, true);
    },
    [manipulator, winH],
  );
  const onPanMove = useCallback(
    (x: number, y: number) => {
      if (panning.current) manipulator?.grabUpdate(x, winH - y);
    },
    [manipulator, winH],
  );
  const onPanEnd = useCallback(() => {
    if (!panning.current) return;
    panning.current = false;
    manipulator?.grabEnd();
    captureEye();
  }, [manipulator, captureEye]);

  const resetCamera = useCallback(() => {
    resetTick.current += 1;
    const target = pivot(stage, framingCluster, heldFocusPoint, focusPartId, focusCluster);
    eyeRef.current = HOME_EYE;
    setHome({
      eye: HOME_EYE,
      target: [
        target[0],
        target[1] + (resetTick.current % 2) * 1e-4,
        target[2],
      ],
    });
  }, [stage, framingCluster, heldFocusPoint, focusPartId, focusCluster, pivot]);

  const getFocusPoint = useCallback((): Vec3 => targetRef.current, []);

  return {
    manipulator,
    getFocusPoint,
    onStickStart,
    onStickMove,
    onStickEnd,
    onZoomDelta,
    onPanStart,
    onPanMove,
    onPanEnd,
    resetCamera,
    orbitBy,
    rotateQuarter: (direction: -1 | 1) => orbitBy(QUARTER_TURN_PX * direction, 0),
  };
}
