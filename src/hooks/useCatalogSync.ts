// Keeps the client and the catalogue in step, in BOTH directions, once per app load.
// PUSH: the bundle is the source for the derived counts (step/stage/cluster come out of the recipe), so it mirrors them into item_build — otherwise the DB copy goes stale the moment a recipe changes.
// PULL: the DB is the single source for the authored meta (name, brand, type, duration, link), for the per-item colour variants, and for the room-placement metadata (placeable_items sizes), so it loads all three into their stores — cache first, then live.
// Both halves are gated on a signed-in user (the RPC and the table policies are `authenticated`-only) and both are fire-and-forget: neither may ever block startup.
import { useEffect, useRef } from "react";

import { FURNITURE_METAS } from "@/src/game/content/furnitures/furnitures";
import { useRepos } from "@/src/data";
import { useCatalogStore } from "@/src/data/catalogStore";
import { hydratePlaceables, refreshPlaceables } from "@/src/data/placeableStore";
import { useVariantStore } from "@/src/data/variantStore";
import { useAuth } from "@/src/hooks/useAuth";

export function useCatalogSync(): void {
  const repos = useRepos();
  const { user } = useAuth();
  // Once per signed-in user, not once per mount — an account switch re-syncs, a re-render does not.
  const syncedFor = useRef<string | null>(null);

  // Cache first, with no session needed, so a returning player has a catalogue on frame one.
  // item_variants rides along on both halves: it is the same kind of reference data, read the same way
  // (synchronously, mid-render) by the item tiles and the room's colour picker.
  useEffect(() => {
    void useCatalogStore.getState().hydrate();
    void useVariantStore.getState().hydrate();
    void hydratePlaceables();
  }, []);

  useEffect(() => {
    if (!user) return;
    void useCatalogStore.getState().refresh(repos);
    void useVariantStore.getState().refresh(repos);
    void refreshPlaceables(repos);
  }, [user, repos]);

  useEffect(() => {
    if (!user || syncedFor.current === user.id) return;
    syncedFor.current = user.id;
    for (const meta of FURNITURE_METAS) {
      repos.builds
        .syncCounts(meta.id, {
          stepCount: meta.stepCount,
          stageCount: meta.stageCount,
          clusterCount: meta.clusterCount,
        })
        .catch((err) => console.warn(`[catalogSync] ${meta.id} did not sync`, err));
    }
  }, [user, repos]);
}
