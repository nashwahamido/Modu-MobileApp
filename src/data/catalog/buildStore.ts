// the build catalogue
// the DB is the single source, but BuildComplete, LoadingOverlay and the build map render mid-build
// cache-then-network: hydrate() replays the last fetch with no session, so a returning player sees it instantly and offline
// refresh() replaces that once signed in
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import type { FurnitureId } from "@/src/game/core/type";
import type { BuildCatalogRow, Repos } from "../core/repos";

// version: a shape change must not read rows written by an older build
const CACHE_KEY = "modu.catalog.builds.v2";

// cached = from AsyncStorage
// live = fetched this session
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
    // never clobber a live fetch that won the race — the network result is strictly better than the cache
    if (get().status === "live") return;
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const rows = JSON.parse(raw) as BuildCatalogRow[];
      if (!Array.isArray(rows) || rows.length === 0) return;
      if (get().status === "live") return;
      set({ rows: byId(rows), status: "cached" });
    } catch {}
  },

  async refresh(repos) {
    try {
      const rows = await repos.catalog.listBuilds();
      if (rows.length === 0) return;
      set({ rows: byId(rows), status: "live" });
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(rows));
    } catch (err) {
      console.warn("[catalog] refresh failed", err);
      if (Object.keys(get().rows).length === 0) set({ status: "error" });
    }
  },
}));

// synchronous single-row read.undefined until the catalogue loads
export function useCatalogRow(
  id: FurnitureId | null | undefined,
): BuildCatalogRow | undefined {
  return useCatalogStore((s) => (id ? s.rows[id] : undefined));
}
