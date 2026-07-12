import { useCallback, useEffect, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { useCameraManipulator } from 'react-native-filament';
import { useGameStore } from '../game/store';
import { stagePivot } from '../game/staging';

const ORBIT_RATE = 220; // viewport px/s at full stick deflection
const ZOOM_RATE = 32; // scroll delta per unit pinch-scale change (user feel-tested)
const HOME_EYE: [number, number, number] = [1.0, 0.85, 1.0];

/**
 * Rate-control orbit: while the stick is deflected, a 16ms loop feeds
 * accumulated viewport deltas into the manipulator's grab session.
 * Pinch scale deltas map to scroll() zoom.
 *
 * The orbit pivot tracks the centre of the assembly built so far (per
 * stage). Filament manipulators take their target at construction, so a
 * pivot change recreates the manipulator; the current eye position is
 * carried over so only the gaze re-aims.
 */
export function useOrbitCamera() {
  const stage = useGameStore((s) => s.stage());
  const baseStashed = useGameStore((s) => s.baseStashed);
  const eyeRef = useRef<[number, number, number]>(HOME_EYE);
  const resetTick = useRef(0);
  const panning = useRef(false);
  const { height: winH } = useWindowDimensions();
  const [home, setHome] = useState(() => ({ eye: HOME_EYE, target: stagePivot(stage, baseStashed) }));

  const manipulator = useCameraManipulator({
    orbitHomePosition: home.eye,
    targetPosition: home.target,
    orbitSpeed: [0.005, 0.005],
  });

  const captureEye = useCallback(() => {
    const la = manipulator?.getLookAt();
    if (la) eyeRef.current = [la[0][0], la[0][1], la[0][2]];
  }, [manipulator]);

  useEffect(() => {
    const [, py] = stagePivot(stage, baseStashed);
    setHome((h) => (h.target[1] === py ? h : { eye: eyeRef.current, target: [0, py, 0] }));
  }, [stage, baseStashed]);

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

  const onZoomDelta = useCallback(
    (scaleDelta: number) => {
      manipulator?.scroll(0, 0, -scaleDelta * ZOOM_RATE);
      captureEye();
    },
    [manipulator, captureEye],
  );

  // Two-finger pan (strafe grab): translates the scene laterally so the player
  // can see around parts. Pauses the orbit tick while active.
  // Touch Y is top-left origin; the manipulator viewport is bottom-left, so a
  // raw feed pans inverted. Mirror Y by the screen height — the constant
  // cancels in the strafe delta, so direction flips without changing speed.
  const onPanStart = useCallback(
    (x: number, y: number) => {
      if (grab.current.active) return; // don't fight an active joystick orbit
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

  // Recenter to the default eye + current stage pivot. The manipulator bakes
  // its pose at construction, so we recreate it; an alternating epsilon on the
  // target guarantees the config value changes even when nominally at home.
  const resetCamera = useCallback(() => {
    resetTick.current += 1;
    const [, py] = stagePivot(stage, baseStashed);
    eyeRef.current = HOME_EYE;
    setHome({ eye: HOME_EYE, target: [0, py + (resetTick.current % 2) * 1e-4, 0] });
  }, [stage, baseStashed]);

  return { manipulator, onStickStart, onStickMove, onStickEnd, onZoomDelta, onPanStart, onPanMove, onPanEnd, resetCamera };
}
