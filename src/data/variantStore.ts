// The item_variants table, held in memory so any consumer can read an item's colour list
// SYNCHRONOUSLY — the same reason catalogStore exists. A tile renders inside a map(), and the room's
// placement bar renders per ghost move: neither can await a round trip, and the answer is identical for
// every player, so it is fetched once and cached.
// Load order is cache-then-network, mirroring catalogStore: hydrate() reads the last successful fetch out
// of AsyncStorage with no session required, refresh() replaces it from the DB once signed in (the
// item_variants policy is `to authenticated`).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import { defaultVariation } from "./catalogAssets";
import type { ItemVariant, Repos } from "./repos";
import type { CatalogId } from "./types";

// Versioned like the build catalogue's: a shape change must not read rows written by an older build.
const CACHE_KEY = "modu.catalog.variants.v1";

export type VariantStatus = "empty" | "cached" | "live" | "error";

interface VariantState {
  // Grouped by item id, each list in DB order with the default FIRST — the order the picker shows.
  byItem: Record<string, ItemVariant[]>;
  status: VariantStatus;
  hydrate: () => Promise<void>;
  refresh: (repos: Repos) => Promise<void>;
}

// Default first, then the rest in the order the adapter returned them, so the swatch row opens on the
// colour the catalogue tile shows.
const group = (rows: ItemVariant[]): Record<string, ItemVariant[]> => {
  const out: Record<string, ItemVariant[]> = {};
  for (const row of rows) (out[row.itemId] ??= []).push(row);
  for (const list of Object.values(out)) list.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  return out;
};

export const useVariantStore = create<VariantState>()((set, get) => ({
  byItem: {},
  status: "empty",

  async hydrate() {
    // Never clobber a live fetch that won the race — same rule as the build catalogue.
    if (get().status === "live") return;
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const rows = JSON.parse(raw) as ItemVariant[];
      if (!Array.isArray(rows) || rows.length === 0) return;
      if (get().status === "live") return;
      set({ byItem: group(rows), status: "cached" });
    } catch {
      // A corrupt cache is not worth surfacing: refresh() is about to overwrite it.
    }
  },

  async refresh(repos) {
    try {
      const rows = await repos.variants.list();
      // An empty table is a real answer, not a failure: adopt it and drop the cache, or a
      // legitimately-emptied item_variants can never invalidate last session's colour lists.
      set({ byItem: group(rows), status: "live" });
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(rows));
    } catch (err) {
      console.warn("[variants] refresh failed", err);
      if (Object.keys(get().byItem).length === 0) set({ status: "error" });
    }
  },
}));

// Stable identity: a fresh [] per call would make the selector return a new value every render.
const EMPTY: ItemVariant[] = [];

// Every variation of an item, default first. Empty until the table loads, and empty for an item with no
// colour axis — callers must treat "no variants" as "one look, at the 'default' path segment".
export function useItemVariants(itemId: CatalogId | null | undefined): ItemVariant[] {
  return useVariantStore((s) => (itemId ? (s.byItem[itemId] ?? EMPTY) : EMPTY));
}

// Non-React read, for store actions (startPlacing needs the default the moment a tile is tapped).
export function variantsOf(itemId: CatalogId): ItemVariant[] {
  return useVariantStore.getState().byItem[itemId] ?? EMPTY;
}

// The variation to show/place when the player has not picked one. Null = the item has a single model
// (the 'default' path segment) — which is also what an unloaded table yields, so placement still works
// offline against whatever the bundle has.
export function defaultVariationOf(itemId: CatalogId): string | null {
  return defaultVariation(variantsOf(itemId));
}
