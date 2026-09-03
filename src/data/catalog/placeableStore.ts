// syncs placeable_items' placement metadata (measured size + base offset) into the room's registry
// cache-then-network like buildStore/variantStore — the registry's bundled set still places offline
import AsyncStorage from "@react-native-async-storage/async-storage";

import { registerPlaceables } from "@/src/room/core/placeableItems";
import { filterKnownSourceRows } from "./assets";
import { workshopDraftsDevGateOpen } from "./workshopDraftsGate";
import type { PlaceableRoomRow, Repos } from "../core/repos";

// versioned like the other catalog caches: a shape change must not read older rows
// v2 for 021 (mount/onTop/opensWall) — a v1 row would place the item nowhere until the next refresh
const CACHE_KEY = "modu.catalog.placeables.v2";

let live = false;

// whether this build's listPlaceables merges testing drafts — see workshopDraftsGate.ts
const WORKSHOP_DRAFTS_MERGE_ENABLED = workshopDraftsDevGateOpen(__DEV__, process.env.EXPO_PUBLIC_DATA_BACKEND, process.env.EXPO_PUBLIC_SHOWCASE);

export async function hydratePlaceables(): Promise<void> {
  if (live) return;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const rows = JSON.parse(raw) as PlaceableRoomRow[];
    if (!Array.isArray(rows) || rows.length === 0) return;
    if (live) return;
    // an unknown source (usually "workshop") is dropped, so a stale cache degrades to a missing item
    registerPlaceables(
      filterKnownSourceRows(rows, WORKSHOP_DRAFTS_MERGE_ENABLED),
    );
  } catch {}
}

export async function refreshPlaceables(repos: Repos): Promise<void> {
  try {
    const rows = await repos.catalog.listPlaceables();
    live = true;
    registerPlaceables(rows);
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(rows));
  } catch (err) {
    console.warn("[placeables] refresh failed", err);
  }
}
