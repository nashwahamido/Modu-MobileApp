// item_variants held in memory so a colour list reads SYNCHRONOUSLY — a tile renders in a map(), the bar per ghost move
// cache-then-network like buildStore: hydrate() replays the cache with no session, refresh() replaces it once signed in
import { create } from "zustand";

import { defaultVariation } from "./assets";
import type { ItemVariant, Repos } from "../core/repos";
import type { CatalogId } from "../core/types";

// versioned like the build catalogue's: a shape change must not read rows written by an older build
const CACHE_KEY = "modu.catalog.variants.v1";

// node tests cannot parse RN's runtime entrypoint, so resolve the native cache only when hydrate/refresh does device I/O
const variantStorage = () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@react-native-async-storage/async-storage")
    .default as typeof import("@react-native-async-storage/async-storage").default;
};

export type VariantStatus = "empty" | "cached" | "live" | "error";

interface VariantState {
  // grouped by item id, each list in DB order with the default FIRST — the order the picker shows
  byItem: Record<string, ItemVariant[]>;
  status: VariantStatus;
  hydrate: () => Promise<void>;
  refresh: (repos: Repos) => Promise<void>;
}

// default first, then the adapter's order, so the swatch row opens on the colour the catalogue tile shows
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
    // never clobber a live fetch that won the race — same rule as the build catalogue
    if (get().status === "live") return;
    try {
      const raw = await variantStorage().getItem(CACHE_KEY);
      if (!raw) return;
      const rows = JSON.parse(raw) as ItemVariant[];
      if (!Array.isArray(rows) || rows.length === 0) return;
      if (get().status === "live") return;
      set({ byItem: group(rows), status: "cached" });
    } catch {
      // a corrupt cache is not worth surfacing: refresh() is about to overwrite it
    }
  },

  async refresh(repos) {
    try {
      const rows = await repos.variants.list();
      // an empty table is a real answer — adopt it, or an emptied item_variants could never invalidate last session's lists
      set({ byItem: group(rows), status: "live" });
      await variantStorage().setItem(CACHE_KEY, JSON.stringify(rows));
    } catch (err) {
      console.warn("[variants] refresh failed", err);
      if (Object.keys(get().byItem).length === 0) set({ status: "error" });
    }
  },
}));

// stable identity: a fresh [] per call would make the selector return a new value every render
const EMPTY: ItemVariant[] = [];

// default first. empty until the table loads AND for an item with no colour axis — both read as one look at 'default'
export function useItemVariants(itemId: CatalogId | null | undefined): ItemVariant[] {
  return useVariantStore((s) => (itemId ? (s.byItem[itemId] ?? EMPTY) : EMPTY));
}

// non-React read, for store actions — startPlacing needs the default the moment a tile is tapped
export function variantsOf(itemId: CatalogId): ItemVariant[] {
  return useVariantStore.getState().byItem[itemId] ?? EMPTY;
}

// null = a single model at 'default', which an UNLOADED table also yields — a caller that cares re-asks once rows land
export function defaultVariationOf(itemId: CatalogId): string | null {
  return defaultVariation(variantsOf(itemId));
}
