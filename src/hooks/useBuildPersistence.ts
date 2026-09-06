// Persist and resume an in-progress build. Drop-in for the play screen: one call wires autosave (debounced) + resume for the target furniture, through the repo seam.
import { useEffect, useRef } from "react";

import { applyBuild, snapshotBuild } from "@/src/game/core/buildSave";
import { useGameStore } from "@/src/game/core/store";
import type { FurnitureId } from "@/src/game/core/type";
import { useCurrentUserId, useRepos } from "@/src/data";
import { useProfileStore } from "@/src/data/player/profileStore";
import { useShopStore } from "@/src/data/shop/store";

// Wait this long after the last progress change before writing, so a burst of taps is one save.
const AUTOSAVE_DEBOUNCE_MS = 600;

/**
 * `resume: false` autosaves but never re-applies a save on entry.
 *
 * For the TUTORIAL, which teaches a fixed sequence from step one. It builds the same LACK table the
 * catalogue lists, so its progress must be written — a player who skips halfway and opens the
 * catalogue should see "Continue", not "Start". But it must never be READ back: re-entering the
 * tutorial with a half-built table would drop the player into step one of the script beside a model
 * that is already four legs in.
 *
 * `settleOnFinish: false` leaves the FINISHED build alone — no reward, no completion record.
 * Also for the tutorial, which already records its own completion (and deliberately pays no build
 * reward, because it pays per-step rewards instead). Without this, adding autosave there would
 * quietly have started paying coins for the tutorial table.
 */
export function useBuildPersistence(
  target: FurnitureId,
  { resume = true, settleOnFinish = true }: { resume?: boolean; settleOnFinish?: boolean } = {},
): void {
  const repos = useRepos();
  const me = useCurrentUserId();
  const hydratedFor = useRef<FurnitureId | null>(null);
  const loadedId = useGameStore((s) => s.furniture?.meta.id ?? null);

  // Resume: once the target furniture is loaded into the store, re-apply any saved progress exactly once.
  useEffect(() => {
    if (!resume || loadedId !== target || hydratedFor.current === target) return;
    hydratedFor.current = target;
    // No count sync here — useCatalogSync mirrors every recipe once per app load, which covers this one.
    let alive = true;
    repos.builds
      .get(me, target)
      .then((save) => {
        if (alive && save) applyBuild(save);
      })
      // A failed resume starts the build from scratch, which is recoverable; an uncaught rejection is not.
      .catch((err) => console.warn(`[build] could not resume ${target}`, err));
    return () => {
      alive = false;
    };
  }, [loadedId, target, me, repos, resume]);

  // Autosave: debounce a snapshot on any progress change, and flush once more on unmount (leaving play). A finished build clears its save instead of storing a completed one.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const persist = () => {
      const state = useGameStore.getState();
      const save = snapshotBuild(me, state);
      if (!save) return;
      const { completedCount, totalCount } = state.progress();
      const finished = totalCount > 0 && completedCount >= totalCount;
      // Not ours to settle, and a finished build is never stored as a save — so there is nothing
      // left to do. Whoever owns the completion drops the save with its own complete() call.
      if (finished && !settleOnFinish) return;
      if (finished) {
        // Finished: grant the reward (server-authoritative amount from item_build; idempotent — one per build, so the debounce + unmount flush can't double-pay), record the completion (backs assembly_count), and drop the save. complete() only runs once reward() has settled: complete() DELETES the in-progress save, so running them concurrently means a failed reward loses both the coins and the progress that would let the player earn them again. Both are idempotent, so a retry costs nothing.
        repos.builds
          .reward(me, save.furnitureId)
          .then((granted) => {
            // The grant already put this in user_buy; this is the CLIENT catching up. useShopStore.load() skips the fetch when the user's data is already cached, and the Inventory popup opens seconds later from the completion screen — so without this the item is granted server-side and simply missing from the list the player is looking at. Purchases mark themselves owned the same way, for the same reason.
            if (granted.rewardItemId) useShopStore.getState().markOwned(granted.rewardItemId);
            return repos.builds.complete(me, save.furnitureId);
          })
          .then(() => {
            // RE-READ THE PROFILE, because the room has almost certainly already read it.
            //
            // This whole chain runs from the effect's UNMOUNT cleanup — the moment the player leaves
            // play — and the room refetches on FOCUS. Focus fires first and the RPC is a round trip,
            // so the room reliably read the balance from BEFORE the grant: the build finished, the
            // completion screen promised coins and XP, and the HUD they landed on showed neither.
            // Nothing was lost — the server had the right numbers all along — but there was no second
            // read to go and find them until something else blurred the room.
            //
            // The amounts in `granted` are what the build PAYS, not the balance it paid into, so they
            // cannot just be added to the store. A read is the only thing that gives the
            // authoritative totals, and it is one query on a screen that has just finished animating.
            void useProfileStore.getState().load(repos, me);
          })
          // The repos THROW on any Postgrest error. This runs from an effect cleanup, so there is no UI left to tell — but an uncaught rejection here meant a finished build silently paid nothing while BuildComplete promised the player coins and XP.
          .catch((err) => console.warn(`[build] reward/complete failed for ${save.furnitureId}`, err));
      } else {
        repos.builds.save(save).catch((err) => console.warn(`[build] autosave failed for ${save.furnitureId}`, err));
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
  }, [me, repos, settleOnFinish]);
}