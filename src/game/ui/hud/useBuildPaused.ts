import { useGameStore } from "@/src/game/core/store";
import { buildMapVisible } from "@/src/game/core/evaluation/clusters";

export function useBuildPaused(overviewOnly = false): boolean {
  const furniture = useGameStore((s) => s.furniture);
  const completed = useGameStore((s) => s.completed);
  const activeCluster = useGameStore((s) => s.activeCluster);
  const mapSeen = useGameStore((s) => s.mapSeen);
  const mapOpen = useGameStore((s) => s.mapOpen);
  const settingsOpen = useGameStore((s) => s.settingsOpen);
  const celebrating = useGameStore((s) => s.celebratingCluster);

  if (settingsOpen || celebrating) return true;

  const total = furniture?.actions.length ?? 0;
  const finished = total > 0 && completed.length >= total;
  if (finished) return true;

  return buildMapVisible(
    furniture,
    new Set(completed),
    { activeCluster, mapSeen, mapOpen },
    overviewOnly,
  );
}