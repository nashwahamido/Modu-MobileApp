import { useEffect, useMemo } from "react";
import { RenderCallbackContext, useFilamentContext } from "react-native-filament";
import type { ClusterId } from "@/src/game/core/type";
import type { Entity, FilamentModel } from "react-native-filament";
import type { ISharedValue } from "react-native-worklets-core";
import { useSharedValue as useWorkletSharedValue } from "react-native-worklets-core";
import { quatToAxisAngle } from "@/src/game/core/geometry/math";
import { combineReady } from "@/src/game/core/evaluation/clusters";
import { useGameStore } from "@/src/game/core/store";

export interface CarryOffset {
  x: number;
  y: number;
  z: number;
}

interface CarryItem {
  entity: Entity;
  clusterId: ClusterId;
  px: number;
  py: number;
  pz: number;
  hasRot: boolean;
  angleRad: number;
  ax: number;
  ay: number;
  az: number;
}

const PARKED_Y = -1000;
const EMPTY_ITEMS: CarryItem[] = [];

export function CombineCarry({
  model,
  carryShared,
}: {
  model: FilamentModel;
  carryShared: ISharedValue<CarryOffset>;
}) {
  const { transformManager } = useFilamentContext();
  const furniture = useGameStore((s) => s.furniture);
  const combining = useGameStore((s) => s.combiningCluster);
  const driving = useGameStore((s) => s.driveActionId !== null);
  const stage = useGameStore((s) => {
    if (!s.furniture) return "off";
    const done = new Set(s.completed);
    const combines = s.furniture.actions.filter((a) => a.type === "combineClusters");
    if (combines.length === 0 || !combineReady(s.furniture, done)) return "off";
    return combines.every((a) => done.has(a.actionId)) ? "over" : "on";
  });

  const completed = useGameStore((s) => s.completed);
  const allItems = useMemo(() => {
    const list: CarryItem[] = [];
    if (!furniture || model.state !== "loaded") return list;
    const combinable = new Set<ClusterId>();
    for (const a of furniture.actions) {
      if (a.type === "combineClusters" && a.cluster) combinable.add(a.cluster);
    }
    for (const p of Object.values(furniture.parts)) {
      if (!combinable.has(p.cluster)) continue;
      const entity = model.asset.getFirstEntityByName(p.meshName);
      if (!entity) continue;
      const aa = quatToAxisAngle(p.pose.rotation);
      list.push({
        entity,
        clusterId: p.cluster,
        px: p.pose.position[0],
        py: p.pose.position[1],
        pz: p.pose.position[2],
        hasRot: !!aa,
        angleRad: aa?.angleRad ?? 0,
        ax: aa?.axis[0] ?? 0,
        ay: aa?.axis[1] ?? 1,
        az: aa?.axis[2] ?? 0,
      });
    }
    return list;
  }, [furniture, model]);

  const carryItems = useMemo(() => {
    if (stage !== "on" || !furniture) return EMPTY_ITEMS;
    const done = new Set(completed);
    const doneClusters = new Set<ClusterId>();
    for (const a of furniture.actions) {
      if (a.type === "combineClusters" && a.cluster && done.has(a.actionId)) {
        doneClusters.add(a.cluster);
      }
    }
    return allItems.filter((it) => !doneClusters.has(it.clusterId));
  }, [stage, furniture, completed, allItems]);

  const activeClusterShared = useWorkletSharedValue<string>("");
  const drivenClusterShared = useWorkletSharedValue<string>("");
  useEffect(() => {
    activeClusterShared.value = combining && !driving ? combining : "";
    drivenClusterShared.value = combining && driving ? combining : "";
  }, [combining, driving, activeClusterShared, drivenClusterShared]);

  RenderCallbackContext.useRenderCallback(() => {
    "worklet";
    if (carryItems.length === 0) return;
    const active = activeClusterShared.value;
    const driven = drivenClusterShared.value;
    const o = carryShared.value;
    for (let i = 0; i < carryItems.length; i++) {
      const it = carryItems[i];
      if (it.clusterId === active) {
        if (it.hasRot) {
          transformManager.setEntityRotation(it.entity, it.angleRad, [it.ax, it.ay, it.az], false);
          transformManager.setEntityPosition(it.entity, [it.px + o.x, it.py + o.y, it.pz + o.z], true);
        } else {
          transformManager.setEntityPosition(it.entity, [it.px + o.x, it.py + o.y, it.pz + o.z], false);
        }
      } else if (it.clusterId !== driven) {
        transformManager.setEntityPosition(it.entity, [it.px, it.py + PARKED_Y, it.pz], false);
      }
    }
  }, [carryItems, transformManager, carryShared, activeClusterShared, drivenClusterShared]);

  return null;
}
