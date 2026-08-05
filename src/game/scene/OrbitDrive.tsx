import { RenderCallbackContext } from "react-native-filament";
import type { ISharedValue } from "react-native-worklets-core";
import { useSharedValue as useWorkletSharedValue } from "react-native-worklets-core";
import type { OrbitManipulator } from "./AssemblyScene";

/** Joystick deflection, -1..1 on each axis, written by the stick gesture on the UI thread. */
export interface StickDeflection {
  x: number;
  y: number;
}

// Matches the old JS-thread ORBIT_RATE * per-frame-seconds. The render callback runs per frame (~60fps) like the old 16ms interval, so the same rate constant gives the same feel.
const ORBIT_RATE = 220;
const FRAME_DT = 0.016;

/**
 * Drives the camera ORBIT on the RENDER thread. The joystick writes its deflection into
 * `stickShared` on the UI thread; this callback integrates it into an accumulated grab
 * position each frame and calls `grabUpdate` on the manipulator — a PointerHolder /
 * jsi::HostObject, worklet-callable from here exactly like transformManager is in
 * CombineCarry.
 *
 * WHY THIS EXISTS: the old integration was a JS-thread setInterval. A runOnJS part-drag
 * saturates the JS thread, so the interval starved and the camera froze until the finger
 * lifted. Moving the loop here makes orbiting immune to JS-thread load — the same reason
 * the combine carry lives on the render thread.
 *
 * The JS side still owns grabBegin/grabEnd (session lifecycle) in useOrbitCamera; this
 * callback only feeds grabUpdate while a session is active. `active` gates it so the
 * accumulator only advances during a real stick grab, and resets to the manipulator's
 * current grab origin at each grab start.
 */
export function OrbitDrive({
  manipulator,
  stickShared,
  active,
}: {
  manipulator: OrbitManipulator;
  stickShared: ISharedValue<StickDeflection>;
  /** True while a stick grab session is open (set by useOrbitCamera's start/end). */
  active: ISharedValue<boolean>;
}) {
  // Accumulated grab coordinates, render-thread-local, plus a one-bit memory of last frame's active state so we can detect a fresh grab and zero the accumulator — otherwise the second session would resume from the first's total and the camera would jump.
  const gx = useWorkletSharedValue(0);
  const gy = useWorkletSharedValue(0);
  const wasActive = useWorkletSharedValue(false);

  RenderCallbackContext.useRenderCallback(() => {
    "worklet";
    if (!active.value) {
      wasActive.value = false;
      return;
    }
    if (!manipulator) return;
    // Rising edge: new grab session (useOrbitCamera just called grabBegin(0,0)), so start the accumulator from zero to match the fresh grab origin.
    if (!wasActive.value) {
      gx.value = 0;
      gy.value = 0;
      wasActive.value = true;
    }
    const d = stickShared.value;
    if (d.x === 0 && d.y === 0) return;
    gx.value += d.x * ORBIT_RATE * FRAME_DT;
    gy.value += d.y * ORBIT_RATE * FRAME_DT;
    manipulator.grabUpdate(gx.value, gy.value);
  }, [manipulator, stickShared, active, gx, gy, wasActive]);

  return null;
}