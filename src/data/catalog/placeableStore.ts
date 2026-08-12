// Syncs placeable_items' room-placement metadata (measured size + base offset per item) into the room's registry (placeableItems.ts registerPlaceables). Load order is cache-then-network, mirroring catalogStore/variantStore: hydrate() replays the last successful fetch from AsyncStorage with no session required, refresh() replaces it from the DB once signed in. The registry itself bakes in the bundled built set, so even "empty" still places what the app can render offline.
import AsyncStorage from "@react-native-async-storage/async-storage";

import { registerPlaceables } from "@/src/room/core/placeableItems";
import { filterKnownSourceRows } from "./assets";
import { workshopDraftsDevGateOpen } from "./workshopDraftsGate";
import type { PlaceableRoomRow, Repos } from "../core/repos";

// Versioned like the other catalog caches: a shape change must not read rows written by an older build. Bumped to v2 for migration 021 (mount/onTop/opensWall replace category-derived placement) — a v1 cached row has neither field, which would read as "no mount, not onTop" and place the cached item nowhere until the next successful refresh.
const CACHE_KEY = "modu.catalog.placeables.v2";

// True once a live fetch landed — the cache must never clobber it (hydrate/refresh can race).
let live = false;

// Whether THIS build's listPlaceables merges in testing-status workshop_drafts rows — see workshopDraftsGate.ts. Read here too because hydrate() runs BEFORE any session exists, straight off whatever a PAST session (possibly a dev build) wrote to AsyncStorage — the cache key is shared across builds on the same device, refresh() is the only thing that ever gates a "workshop" row's presence, and this constant is what lets the read side reject one a showcase or release build must never have replayed to it.
const WORKSHOP_DRAFTS_MERGE_ENABLED = workshopDraftsDevGateOpen(__DEV__, process.env.EXPO_PUBLIC_DATA_BACKEND, process.env.EXPO_PUBLIC_SHOWCASE);

export async function hydratePlaceables(): Promise<void> {
  if (live) return;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const rows = JSON.parse(raw) as PlaceableRoomRow[];
    if (!Array.isArray(rows) || rows.length === 0) return;
    if (live) return;
    // A row whose source this build does not understand — most likely "workshop", cached by a dev build on this same device — is dropped rather than replayed, so a stale cache degrades to "that item is missing" instead of a bad storage path. See filterKnownSourceRows (assets.ts).
    registerPlaceables(filterKnownSourceRows(rows, WORKSHOP_DRAFTS_MERGE_ENABLED));
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
