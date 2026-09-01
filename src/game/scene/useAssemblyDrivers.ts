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
  const carryShared = useWorkletSharedValue({ x: 0, y: 0, z: 0 });
  const stickShared = useWorkletSharedValue({ x: 0, y: 0 });
  return {
    heldDriver,
    sinkDriver,
    clusterDriver,
    pushDrivers,
    slideDriver,
    carryShared,
    stickShared,
  };
}