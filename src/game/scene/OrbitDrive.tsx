import { useEffect } from "react";
import { RenderCallbackContext, useFilamentContext } from "react-native-filament";
import type { ISharedValue } from "react-native-worklets-core";
import { useSharedValue as useWorkletSharedValue } from "react-native-worklets-core";
import type { OrbitManipulator } from "./AssemblyScene";

export interface StickDeflection {
  x: number;
  y: number;
}

export interface PanOffset {
  x: number;
  y: number;
  z: number;
}

const ORBIT_RATE = 165;
const FRAME_DT = 0.016;

export function OrbitDrive({
  manipulator,
  stickShared,
  active,
  panShared,
}: {
  manipulator: OrbitManipulator;
  stickShared: ISharedValue<StickDeflection>;
  active: ISharedValue<boolean>;
  panShared: ISharedValue<PanOffset>;
}) {
  const { camera } = useFilamentContext();
  const gx = useWorkletSharedValue(0);
  const gy = useWorkletSharedValue(0);
  const wasActive = useWorkletSharedValue(false);

  useEffect(() => {
    gx.value = 0;
    gy.value = 0;
    wasActive.value = false;
  }, [manipulator, gx, gy, wasActive]);

  RenderCallbackContext.useRenderCallback(() => {
    "worklet";
    if (manipulator) {
      const p = panShared.value;
      if (p.x !== 0 || p.y !== 0 || p.z !== 0) {
        const la = manipulator.getLookAt();
        if (la) {
          camera.lookAt(
            [la[0][0] + p.x, la[0][1] + p.y, la[0][2] + p.z],
            [la[1][0] + p.x, la[1][1] + p.y, la[1][2] + p.z],
            [la[2][0], la[2][1], la[2][2]],
          );
        }
      }
    }
    if (!active.value) {
      wasActive.value = false;
      return;
    }
    if (!manipulator) return;
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
  }, [manipulator, stickShared, active, gx, gy, wasActive, panShared, camera]);

  return null;
}