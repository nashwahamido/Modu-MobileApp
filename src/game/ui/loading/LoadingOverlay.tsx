import { useCatalogRow } from "@/src/data/catalog/buildStore";
import { useGameStore } from "@/src/game/core/store";
import { Button } from "@/src/game/ui/system/Button";
import { LoadingScreen } from "@/src/game/ui/loading/LoadingScreen";
import { type Milestone } from "./loadingProgress";

interface Props {
  milestone: Milestone;
  error: boolean;
  onRetry: () => void;
  onBack: () => void;
  onFadedOut: () => void;
}

export function LoadingOverlay({ milestone, error, onRetry, onBack, onFadedOut }: Props) {
  const furniture = useGameStore((s) => s.furniture);
  const catalogRow = useCatalogRow(furniture?.meta.id ?? null);
  const simple = useGameStore((s) => s.settings.textLevel === "simple");

  return (
    <LoadingScreen
      overlay
      fadeOnComplete
      milestone={milestone}
      label={catalogRow ? `${catalogRow.name} · ${catalogRow.brand}` : undefined}
      errorMessage={
        error ? (simple ? "This didn't load." : "Couldn't load this furniture.") : undefined
      }
      actions={
        <>
          <Button label="Try again" variant="primary" onPress={onRetry} />
          <Button label="Back" onPress={onBack} />
        </>
      }
      onComplete={onFadedOut}
    />
  );
}
