import { useEffect, useRef } from "react";
import { actionCluster, requiresClusterFocus } from "@/src/game/core/evaluation/clusters";
import { useGameStore } from "@/src/game/core/store";
import { playSfx, preloadSfx } from "@/src/game/audio/sfx";
import type { ActionId } from "@/src/game/core/type";

const TICK_DEGREES = 30;

export function useAssemblySfx(enabled: boolean): void {
  const lastTickRef = useRef<Record<string, number>>({});
  const prevCompletedRef = useRef(0);
  const prevHeldRef = useRef<ActionId | null>(null);

  useEffect(() => {
    if (!enabled) return;
    preloadSfx();

    const start = useGameStore.getState();
    prevCompletedRef.current = start.completed.length;
    prevHeldRef.current = start.heldActionId;
    lastTickRef.current = Object.fromEntries(
      Object.entries(start.tightenDeg).map(([id, deg]) => [id, Math.floor(deg / TICK_DEGREES)]),
    );

    return useGameStore.subscribe((s) => {
      if (s.heldActionId !== prevHeldRef.current) {
        if (s.heldActionId) {
          const held = s.heldActionId;
          const blocked = !s.available().some((a) => a.actionId === held);
          playSfx(blocked ? "error" : "pickup");
        }
        else if (s.completed.length === prevCompletedRef.current) playSfx("drop");
        prevHeldRef.current = s.heldActionId;
      }

      if (s.completed.length > prevCompletedRef.current) {
        const justDone = s.completed[s.completed.length - 1];
        if (s.furniture) {
          const action = s.furniture.actions.find((a) => a.actionId === justDone);
          const cluster = action ? actionCluster(s.furniture, action) : null;
          const clusterDone =
            cluster != null &&
            s.furniture.actions
              .filter((a) => actionCluster(s.furniture!, a) === cluster)
              .every((a) => s.completed.includes(a.actionId));
          const staged = requiresClusterFocus(s.furniture);
          if (__DEV__ && clusterDone) {
            console.log(
              `[sfx] cluster "${cluster}" complete on ${s.furniture.meta.id} — staged=${staged} -> ${
                staged ? "clusterComplete" : "seat"
              }`,
            );
          }
          playSfx(clusterDone && staged ? "clusterComplete" : "seat");
        } else {
          playSfx("seat");
        }
        prevCompletedRef.current = s.completed.length;
      } else if (s.completed.length < prevCompletedRef.current) {
        prevCompletedRef.current = s.completed.length;
      }

      for (const [id, deg] of Object.entries(s.tightenDeg)) {
        const detent = Math.floor(Math.abs(deg) / TICK_DEGREES);
        if (detent !== (lastTickRef.current[id] ?? 0)) {
          if (detent > (lastTickRef.current[id] ?? 0)) playSfx("tick");
          lastTickRef.current[id] = detent;
        }
      }
    });
  }, [enabled]);
}

export function playTapSfx(): void {
  playSfx("tap");
}