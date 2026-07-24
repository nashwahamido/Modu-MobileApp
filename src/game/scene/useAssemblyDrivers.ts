// The offset/cluster drivers an assembly screen wires into AssemblyScene — one stable set per mounted screen. Shared by the game (play.tsx) and the tutorial so the wiring stays identical.
import { useRef } from "react";
import { useSharedValue as useWorkletSharedValue } from "react-native-worklets-core";
import {
  createClusterDriver,
  createDriverRegistry,
  createOffsetDriver,
} from "@/src/game/scene/offsetDriver";

export function useAssemblyDrivers() {
  const heldDriver = useRef(createOffsetDriver()).current;
  const sinkDriver = useRef(createOffsetDriver()).current;
  const clusterDriver = useRef(createClusterDriver()).current;
  const pushDrivers = useRef(createDriverRegistry()).current;
  const slideDriver = useRef(createClusterDriver()).current;
  // The combine carry offset — written by the cluster drag on the JS side, applied to the carried cluster's entities on the RENDER thread (scene/CombineCarry).
  const carryShared = useWorkletSharedValue({ x: 0, y: 0, z: 0 });
  return {
    heldDriver,
    sinkDriver,
    clusterDriver,
    pushDrivers,
    slideDriver,
    carryShared,
  };
}
