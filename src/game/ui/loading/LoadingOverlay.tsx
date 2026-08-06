// The assembly loader: picks the copy and the avatar for a furniture load, then hands off to LoadingScreen — the one file that owns loading look and cadence. Rendered ABOVE the scene so the GLB parses beneath it; opaque, so the blank scene is never visible.
import { useCatalogRow } from "@/src/data/catalog/buildStore";
import { useGameStore } from "@/src/game/core/store";
import { Button } from "@/src/game/ui/system/Button";
import { LoadingScreen } from "@/src/game/ui/loading/LoadingScreen";
import { type Milestone } from "./loadingProgress";

interface Props {
  /** Reached load signal (loadingProgress.ts); the parent derives it from store + onModelReady. */
  milestone: Milestone;
  /** Swaps the bar for the error message + Try again/Back (data-load rejection or the model watchdog). */
  error: boolean;
  onRetry: () => void;
  onBack: () => void;
  /** Fired after the fade-out completes — the parent unmounts the overlay then. */
  onFadedOut: () => void;
}

export function LoadingOverlay({ milestone, error, onRetry, onBack, onFadedOut }: Props) {
  const profile = useGameStore((s) => s.profile);
  const furniture = useGameStore((s) => s.furniture);
  // The name shown while loading is DB-authored; before the catalogue lands this falls back to LoadingScreen's default.
  const catalogRow = useCatalogRow(furniture?.meta.id ?? null);
  const simple = useGameStore((s) => s.settings.textLevel === "simple");

  return (
    <LoadingScreen
      overlay
      fadeOnComplete
      milestone={milestone}
      // Avatar placeholder: the active profile's initial in the ring — real art replaces the Text without layout changes.
      avatar={{ initial: profile.charAt(0).toUpperCase() }}
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
