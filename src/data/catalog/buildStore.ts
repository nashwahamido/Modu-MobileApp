// The build catalogue, held in memory so every consumer can read a furniture's name/brand/type/duration SYNCHRONOUSLY. That is the whole reason this store exists: the DB is the single source for those fields, but BuildComplete, LoadingOverlay and the build map render mid-build and cannot await a round trip. Load order is cache-then-network. hydrate() reads the last successful fetch out of AsyncStorage with no session required, so a returning player sees the catalogue instantly and offline; refresh() then replaces it from the DB once signed in (the item_build/furniture_types policies are `to authenticated`). A first-ever launch with no network has nothing to show — the accepted cost of not keeping a second copy in the bundle.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import type { FurnitureId } from "@/src/game/core/type";
import type { BuildCatalogRow, Repos } from "../core/repos";

// Versioned: a shape change must not try to read rows written by an older build.
const CACHE_KEY = "modu.catalog.builds.v2";

// "cached" = serving AsyncStorage, may be stale. "live" = this session fetched it. Callers that must not show stale curation can check.
export type CatalogStatus = "empty" | "cached" | "live" | "error";

interface CatalogState {
  rows: Record<string, BuildCatalogRow>;
  status: CatalogStatus;
  hydrate: () => Promise<void>;
  refresh: (repos: Repos) => Promise<void>;
}

const byId = (rows: BuildCatalogRow[]): Record<string, BuildCatalogRow> =>
  Object.fromEntries(rows.map((r) => [r.id, r]));

export const useCatalogStore = create<CatalogState>()((set, get) => ({
  rows: {},
  status: "empty",

  async hydrate() {
    // Never clobber a live fetch that won the race — the network result is strictly better than the cache.
    if (get().status === "live") return;
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const rows = JSON.parse(raw) as BuildCatalogRow[];
      if (!Array.isArray(rows) || rows.length === 0) return;
      if (get().status === "live") return;
      set({ rows: byId(rows), status: "cached" });
    } catch {
      // A corrupt or unreadable cache is not worth surfacing: refresh() is about to overwrite it anyway.
    }
  },

  async refresh(repos) {
    try {
      const rows = await repos.catalog.listBuilds();
      if (rows.length === 0) return;
      set({ rows: byId(rows), status: "live" });
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(rows));
    } catch (err) {
      console.warn("[catalog] refresh failed", err);
      // Keep serving whatever we already had; only report error when there is nothing at all to show.
      if (Object.keys(get().rows).length === 0) set({ status: "error" });
    }
  },
}));

// Synchronous single-row read. Undefined until the catalogue loads, so callers render a fallback rather than assuming.
export function useCatalogRow(id: FurnitureId | null | undefined): BuildCatalogRow | undefined {
  return useCatalogStore((s) => (id ? s.rows[id] : undefined));
}
