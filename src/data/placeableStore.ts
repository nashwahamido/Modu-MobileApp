// Syncs placeable_items' room-placement metadata (measured size + base offset per item) into the
// room's registry (placeableItems.ts registerPlaceables). Load order is cache-then-network,
// mirroring catalogStore/variantStore: hydrate() replays the last successful fetch from AsyncStorage
// with no session required, refresh() replaces it from the DB once signed in. The registry itself
// bakes in the bundled built set, so even "empty" still places what the app can render offline.
import AsyncStorage from "@react-native-async-storage/async-storage";

import { registerPlaceables } from "@/src/room/core/placeableItems";
import type { PlaceableRoomRow, Repos } from "./repos";

// Versioned like the other catalog caches: a shape change must not read rows written by an older build.
const CACHE_KEY = "modu.catalog.placeables.v1";

// True once a live fetch landed — the cache must never clobber it (hydrate/refresh can race).
let live = false;

export async function hydratePlaceables(): Promise<void> {
  if (live) return;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const rows = JSON.parse(raw) as PlaceableRoomRow[];
    if (!Array.isArray(rows) || rows.length === 0) return;
    if (live) return;
    registerPlaceables(rows);
  } catch {
    // A corrupt cache is not worth surfacing: refresh() is about to overwrite it.
  }
}

export async function refreshPlaceables(repos: Repos): Promise<void> {
  try {
    const rows = await repos.catalog.listPlaceables();
    live = true;
    // An empty list is a real answer (registry keeps its bundled floor) — adopt and cache it.
    registerPlaceables(rows);
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(rows));
  } catch (err) {
    console.warn("[placeables] refresh failed", err);
  }
}
