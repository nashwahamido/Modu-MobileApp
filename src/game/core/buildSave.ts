// The bridge between the live game store and a persistable BuildSave. snapshotBuild reads the resumable fields out; applyBuild writes a save back in. Keep this the ONLY place that maps between the two, so the persisted shape and the store can't drift.
import type { BuildSave, UserId } from "@/src/data/core/types";
import { resumeFocusCluster } from "@/src/game/core/evaluation/availability";
import { useGameStore } from "@/src/game/core/store";

type GameState = ReturnType<typeof useGameStore.getState>;

// Snapshot the current build into a save, or null when no furniture is loaded.
export function snapshotBuild(ownerId: UserId, state: GameState): BuildSave | null {
  const furniture = state.furniture;
  if (!furniture) return null;
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

// Re-apply a save onto the store. Call AFTER loadFurniture (which resets progress) so this restores on top of the freshly loaded model. Only progress fields are touched — never furniture itself.
export function applyBuild(save: BuildSave): void {
  // The save's mode ALWAYS wins here, including over a furniture's `meta.mode`
  useGameStore.setState({
    completed: save.completed,
    tightenDeg: save.tightenDeg,
    orientationDeg: save.orientationDeg,
    driveProgress: save.driveProgress,
    mode: save.mode,
  });
  // The section focus is DERIVED, not persisted (the save schema has no column for it, and it never needs one)
  const f = useGameStore.getState().furniture;
  const focus = f ? resumeFocusCluster(f, new Set(save.completed)) : null;
  if (focus) useGameStore.setState({ activeCluster: focus });
}
