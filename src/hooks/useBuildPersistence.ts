// Persist and resume an in-progress build. Drop-in for the play screen: one call wires autosave (debounced) + resume for the target furniture, through the repo seam.
import { useEffect, useRef } from "react";

import { applyBuild, snapshotBuild } from "@/src/game/core/buildSave";
import { useGameStore } from "@/src/game/core/store";
import type { FurnitureId } from "@/src/game/core/type";
import { useCurrentUserId, useRepos } from "@/src/data";

// Wait this long after the last progress change before writing, so a burst of taps is one save.
const AUTOSAVE_DEBOUNCE_MS = 600;

export function useBuildPersistence(target: FurnitureId): void {
  const repos = useRepos();
  const me = useCurrentUserId();
  const hydratedFor = useRef<FurnitureId | null>(null);
  const loadedId = useGameStore((s) => s.furniture?.meta.id ?? null);

  // Resume: once the target furniture is loaded into the store, re-apply any saved progress exactly once.
  useEffect(() => {
    if (loadedId !== target || hydratedFor.current === target) return;
    hydratedFor.current = target;
    let alive = true;
    repos.builds.get(me, target).then((save) => {
      if (alive && save) applyBuild(save);
    });
    return () => {
      alive = false;
    };
  }, [loadedId, target, me, repos]);

  // Autosave: debounce a snapshot on any progress change, and flush once more on unmount (leaving play). A finished build clears its save instead of storing a completed one.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const persist = () => {
      const state = useGameStore.getState();
      const save = snapshotBuild(me, state);
      if (!save) return;
      const { completedCount, totalCount } = state.progress();
      if (totalCount > 0 && completedCount >= totalCount) {
        // Finished: record the completion (backs items_assembled) and drop the in-progress save.
        repos.builds.complete(me, save.furnitureId);
      } else {
        repos.builds.save(save);
      }
    };
    const unsubscribe = useGameStore.subscribe((s, prev) => {
      const changed =
        s.completed !== prev.completed ||
        s.tightenDeg !== prev.tightenDeg ||
        s.orientationDeg !== prev.orientationDeg ||
        s.driveProgress !== prev.driveProgress;
      if (!changed) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(persist, AUTOSAVE_DEBOUNCE_MS);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
      persist();
    };
  }, [me, repos]);
}
