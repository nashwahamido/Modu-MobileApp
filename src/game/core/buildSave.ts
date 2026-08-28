// The only bridge between the live game store and a persistable BuildSave, so the two shapes cannot drift. See README.

import type { BuildSave, UserId } from "@/src/data/core/types";
import { resumeFocusCluster } from "@/src/game/core/evaluation/availability";
import { useGameStore } from "@/src/game/core/store";

type GameState = ReturnType<typeof useGameStore.getState>;

// --------------- store → save
export function snapshotBuild(ownerId: UserId, state: GameState): BuildSave | null {
  const furniture = state.furniture;
  if (!furniture) return null; // nothing loaded, nothing to resume
  return {
    ownerId,
    furnitureId: furniture.meta.id,
    completed: state.completed,
    tightenDeg: state.tightenDeg,
    orientationDeg: state.orientationDeg,
    driveProgress: state.driveProgress,
    mode: state.mode,
    updatedAt: new Date().toISOString(),
  };
}

// --------------- save → store
// Call AFTER loadFurniture, which resets progress. Progress fields only, never the furniture.
export function applyBuild(save: BuildSave): void {
  // The save's mode always wins, including over the furniture's meta.mode (README).
  useGameStore.setState({
    completed: save.completed,
    tightenDeg: save.tightenDeg,
    orientationDeg: save.orientationDeg,
    driveProgress: save.driveProgress,
    mode: save.mode,
  });
  // Section focus is derived, not persisted: resume where the next action lives.
  const f = useGameStore.getState().furniture;
  const focus = f ? resumeFocusCluster(f, new Set(save.completed)) : null;
  if (focus) useGameStore.setState({ activeCluster: focus });
}
