import { useEffect, useMemo } from "react";
import { RenderCallbackContext, useFilamentContext } from "react-native-filament";
import type { ClusterId } from "@/src/game/core/type";
import type { Entity, FilamentModel } from "react-native-filament";
import type { ISharedValue } from "react-native-worklets-core";
import { useSharedValue as useWorkletSharedValue } from "react-native-worklets-core";
import { quatToAxisAngle } from "@/src/game/core/geometry/math";
import { combineReady } from "@/src/game/core/evaluation/clusters";
import { useGameStore } from "@/src/game/core/store";

/** The combine carry offset, shared with the render thread. An {x,y,z} OBJECT, not an array — worklets-core shared-value arrays arrive in filament's native layer as objects and are rejected; fresh array literals are built inside the worklet instead. */
export interface CarryOffset {
  x: number;
  y: number;
  z: number;
}

interface CarryItem {
  entity: Entity;
  /** Which combine cluster this part belongs to, so the render loop carries the active one and parks the rest. */
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

/** Where an idle cluster's parts sit: far below the bench, frustum-culled, so they stay scene-resident but invisible until their cluster is carried. */
const PARKED_Y = -1000;
/** Stable empty items reference so the render callback registers once instead of on every render. */
const EMPTY_ITEMS: CarryItem[] = [];

/**
 * Drives the combine CARRY on the RENDER thread: the gesture only writes one shared offset, and this loop applies it to the MAIN model's own part entities inside filament's frame loop — the parts are already GPU-resident from the build phase, so nothing loads when a card is dragged out. (Standalone per-cluster proxy GLBs were tried here and removed: their multi-second texture/geometry load at stage entry was the price of dodging a freeze whose real cause turned out to be the cluster-gesture closure bug.)
 *
 * The combining parts stay mounted for the whole combine stage (PartModel keeps them un-hidden); this loop carries the active cluster under the finger and parks every other un-done one far off-screen, so drag start never toggles scene membership — the mount burst was what stalled the JS thread on the old carry.
 *
 * Owns the transforms ONLY during the carry (combiningCluster set, no drive running) — at the park handoff the drawer re-registers with its push-group drivers and SlideControl takes over on the JS side, and a completed seed re-seats through its static mode.
 */
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
  // Per-part carry table for every combinable cluster, built once when the model loads — each part tagged with its cluster.
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

  // Only carry/park while the combine stage is live and a cluster's own combine is unfinished; a finished cluster reverts to its placed (StaticEntity) presentation and must not be parked. Recomputed on stage/completion (rare), so the render callback re-registers there and never at drag start.
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

  // The cluster currently carried, mirrored to the render thread so the worklet picks carry-vs-park without re-registering when the drag starts. The cluster currently DRIVEN (SlideControl park→seat) is mirrored too: the JS-side ClusterDriver owns its transforms then, and the worklet writing the park position over them every frame made the drawer vanish mid-drive.
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
