// THE BUILD IS NOT ALWAYS THE THING IN FRONT OF THE PLAYER. Nothing else happens when it is not.
//
// TWO STATES answer to that, and every coach, ring and spoken line has to respect both.
//
// Not a metaphor — it is how the map is used. The player opens it to stop and look at the whole
// build, or it opens itself to ask which section to work on. Either way the build is not in front of
// them, so anything that would speak, nudge, or pop belongs on the other side of it: the spoken step
// instruction, the idle check-in, the Map coach, the stuck prompts. A card that arrives over the map
// is talking about a screen the player is not looking at.
//
// THE FINISHED BUILD IS THE OTHER. Once every action is done the celebration owns the screen: it is
// the end of the task, the reward is on it, and it is the one moment the player should be left
// alone with. A stuck prompt arrived over it — which is also nonsense on its own terms, since there
// is no step left to be stuck on.
//
// ONE HOOK so the consumers cannot drift apart, which they already did once: each was testing
// `mapOpen`, and the map arrives THREE ways of which only one sets that flag (see buildMapVisible).
// The Map coach drew itself straight over the stage chooser as a result.
import { useGameStore } from "@/src/game/core/store";
import { buildMapVisible } from "@/src/game/core/evaluation/clusters";

/**
 * True while something other than the build owns the screen — the project map in any of the ways it
 * gets there, or a finished build.
 *
 * `overviewOnly` mirrors BuildMap's own prop: the tutorial's pause-only overview never inherits the
 * one-time intro, so a caller rendering that variant must say so or it will read a map that is not
 * actually up.
 */
export function useBuildPaused(overviewOnly = false): boolean {
  const furniture = useGameStore((s) => s.furniture);
  const completed = useGameStore((s) => s.completed);
  const activeCluster = useGameStore((s) => s.activeCluster);
  const mapSeen = useGameStore((s) => s.mapSeen);
  const mapOpen = useGameStore((s) => s.mapOpen);

  // FINISHED, tested on the actions rather than on BuildComplete's own visibility. That card waits
  // on the player tapping Finish and then Complete (doneDismissed / completeConfirmed), and the
  // window before those taps is just as wrong for a prompt: the model is built, the Finish button is
  // up, and there is no step left to be stuck on. Counting actions covers the whole tail in one test.
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