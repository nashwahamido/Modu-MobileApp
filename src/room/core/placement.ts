// Room layout state: the committed placements plus at most ONE active edit (a ghost being
// dragged). Lifted out of RoomExperience so any route can start a placement (Inventory,
// BuildComplete) and so the scene can render the layout without owning it.
//
// The scene is a pure function of this store; persistence is repos.rooms and nothing else. Save
// happens on commit (confirm/remove), never mid-drag — a half-finished ghost must not be written.
import { create } from "zustand";

import { getRepos } from "../../data";
import type { PlacedFurniture, RoomLayout, UserId } from "../../data/types";
import { defaultVariationOf } from "../../data/variantStore";
import {
  canPlace,
  buildOccupancy,
  clampToSurface,
  rotatedFootprint,
  type GridPlacement,
  type PlacementCheck,
  type RotSteps,
} from "./grid";
import { ROOM_ITEM_DEFS } from "./placeableItems";

// The persisted shape and the grid's working shape are the same thing under two names; keep the
// conversion in one visible place so they cannot drift silently.
const toGrid = (p: PlacedFurniture): GridPlacement => ({
  instanceId: p.instanceId,
  itemId: p.furnitureId,
  variation: p.color ?? null,
  surface: p.surface,
  cell: p.cell,
  rotSteps: p.rotSteps,
});

const fromGrid = (p: GridPlacement): PlacedFurniture => ({
  instanceId: p.instanceId,
  furnitureId: p.itemId,
  surface: p.surface,
  cell: p.cell,
  rotSteps: p.rotSteps,
  ...(p.variation ? { color: p.variation } : {}),
});

export interface ActiveEdit {
  placement: GridPlacement;
  // Where the piece stood before this edit, or null for a NEW item (cancel then discards it).
  previous: GridPlacement | null;
  check: PlacementCheck;
  // True only when a completed build sends the player's first furniture here — drives the mascot coach mark.
  firstPlacementGuide: boolean;
}

interface PlacementState {
  ownerId: UserId | null;
  layout: GridPlacement[];
  activeEdit: ActiveEdit | null;
  // Bumped on each fresh start so the scene can recentre its ghost focus.
  startNonce: number;
  hydrated: boolean;

  // Load the owner's saved layout. Also the account-switch reset: a new ownerId replaces everything.
  hydrate: (ownerId: UserId) => Promise<void>;
  startPlacing: (itemId: string, opts?: { firstPlacementGuide?: boolean; variation?: string | null }) => boolean;
  // Recolour the ghost mid-placement. Variation is a pure LOOK: same footprint, same validity, so
  // nothing is re-validated — only the model the scene loads changes.
  setGhostVariation: (variation: string | null) => void;
  // Re-edit a committed piece (long-press / tap on it).
  editPlacement: (instanceId: string) => void;
  moveGhost: (cell: { x: number; y: number }) => void;
  rotateGhost: (direction: -1 | 1) => void;
  confirm: () => void;
  cancel: () => void;
  remove: () => void;
  // Back to a blank store. Used when switching accounts, so one player's room never carries into the next.
  reset: () => void;
}

const nextInstanceId = (itemId: string, layout: GridPlacement[]): string => {
  // Deterministic and human-readable; uniqueness only needs to hold within one layout.
  let n = layout.length + 1;
  while (layout.some((p) => p.instanceId === `${itemId}#${n}`)) n += 1;
  return `${itemId}#${n}`;
};

const validate = (placement: GridPlacement, layout: GridPlacement[]): PlacementCheck =>
  canPlace(
    placement,
    ROOM_ITEM_DEFS.get(placement.itemId),
    buildOccupancy(layout, ROOM_ITEM_DEFS, placement.instanceId),
  );

// Saves are queued so two quick commits cannot land out of order (the later snapshot must win
// server-side). A lost write still self-heals on the next commit.
let saveQueue: Promise<void> = Promise.resolve();
const persist = (ownerId: UserId | null, layout: GridPlacement[]) => {
  if (!ownerId) return;
  const snapshot: RoomLayout = {
    ownerId,
    version: 1,
    placements: layout.map(fromGrid),
    updatedAt: new Date().toISOString(),
  };
  saveQueue = saveQueue
    .then(() => getRepos().rooms.save(ownerId, snapshot))
    .catch((err) => console.warn("[room] layout save failed", err));
};

export const usePlacementStore = create<PlacementState>()((set, get) => ({
  ownerId: null,
  layout: [],
  activeEdit: null,
  startNonce: 0,
  hydrated: false,

  async hydrate(ownerId) {
    if (get().ownerId === ownerId && get().hydrated) return;
    // A ghost started before the first hydrate (BuildComplete's "place it now") belongs to the
    // incoming owner — keep it. Only an actual account SWITCH throws the edit away.
    const keepEdit = get().ownerId === null || get().ownerId === ownerId;
    set((s) => ({ ownerId, layout: [], activeEdit: keepEdit ? s.activeEdit : null, hydrated: false }));
    try {
      const saved = await getRepos().rooms.get(ownerId);
      // An account switch mid-fetch must not land the old owner's rows in the new owner's room.
      if (get().ownerId !== ownerId) return;
      set((s) => {
        const layout = saved.placements.map(toGrid);
        let activeEdit = s.activeEdit;
        // A pre-hydration ghost was keyed and validated against an empty room; redo both against
        // the real layout so it cannot collide with a saved piece or reuse its instanceId.
        if (activeEdit && activeEdit.previous === null) {
          const placement = {
            ...activeEdit.placement,
            instanceId: nextInstanceId(activeEdit.placement.itemId, layout),
          };
          activeEdit = { ...activeEdit, placement, check: validate(placement, layout) };
        }
        return { layout, activeEdit, hydrated: true };
      });
    } catch (err) {
      // Leave hydrated=false: the room renders empty but commits stay blocked (see confirm/remove),
      // so a failed load can never cause a save that wipes the real layout.
      console.warn("[room] layout load failed", err);
    }
  },

  startPlacing(itemId, opts) {
    const def = ROOM_ITEM_DEFS.get(itemId);
    // No room model for this item: refuse to enter placement rather than drag an invisible ghost.
    if (!def) return false;
    set((s) => {
      // Starting over an in-progress EDIT must not discard the edited piece: put it back first,
      // exactly as cancel() would (a new ghost just evaporates).
      const layout = s.activeEdit?.previous ? [...s.layout, s.activeEdit.previous] : s.layout;
      const placement: GridPlacement = {
        instanceId: nextInstanceId(itemId, layout),
        itemId,
        // Opens on the item's DEFAULT colour, the one its tile showed. Null when the variant table has
        // not loaded (or the item has no colour axis) — the 'default' model, which is what the bundle has.
        variation: opts?.variation ?? defaultVariationOf(itemId),
        surface: { kind: "floor" },
        // Ghost starts centred on the floor; the first drag snaps it under the finger.
        cell: clampToSurface({ x: 5, y: 4 }, { kind: "floor" }, def.footprint),
        rotSteps: 0,
      };
      return {
        layout,
        activeEdit: {
          placement,
          previous: null,
          check: validate(placement, layout),
          firstPlacementGuide: opts?.firstPlacementGuide ?? false,
        },
        startNonce: s.startNonce + 1,
      };
    });
    return true;
  },

  setGhostVariation(variation) {
    set((s) => {
      if (!s.activeEdit || s.activeEdit.placement.variation === variation) return s;
      return {
        activeEdit: { ...s.activeEdit, placement: { ...s.activeEdit.placement, variation } },
      };
    });
  },

  editPlacement(instanceId) {
    set((s) => {
      if (s.activeEdit) return s;
      const existing = s.layout.find((p) => p.instanceId === instanceId);
      if (!existing) return s;
      return {
        // The piece leaves the committed layout while being edited, so it neither renders twice
        // nor collides with its own ghost.
        layout: s.layout.filter((p) => p.instanceId !== instanceId),
        activeEdit: {
          placement: existing,
          previous: existing,
          check: { ok: true },
          firstPlacementGuide: false,
        },
      };
    });
  },

  moveGhost(cell) {
    set((s) => {
      if (!s.activeEdit) return s;
      const def = ROOM_ITEM_DEFS.get(s.activeEdit.placement.itemId);
      if (!def) return s;
      const footprint = rotatedFootprint(def.footprint, s.activeEdit.placement.rotSteps);
      const clamped = clampToSurface(cell, s.activeEdit.placement.surface, footprint);
      // Cells are half a metre — most drag events stay inside the current one. Bail with the SAME
      // state object so zustand notifies nobody: this runs per pan event, and re-rendering the
      // whole room per event (instead of per cell crossing) is what blew React's update depth.
      const current = s.activeEdit.placement.cell;
      if (clamped.x === current.x && clamped.y === current.y) return s;
      const placement = { ...s.activeEdit.placement, cell: clamped };
      return { activeEdit: { ...s.activeEdit, placement, check: validate(placement, s.layout) } };
    });
  },

  rotateGhost(direction) {
    set((s) => {
      if (!s.activeEdit) return s;
      const def = ROOM_ITEM_DEFS.get(s.activeEdit.placement.itemId);
      if (!def) return s;
      const rotSteps = ((((s.activeEdit.placement.rotSteps + direction) % 4) + 4) % 4) as RotSteps;
      const placement = {
        ...s.activeEdit.placement,
        rotSteps,
        // Re-clamp: the swapped footprint may spill past an edge the old one touched.
        cell: clampToSurface(
          s.activeEdit.placement.cell,
          s.activeEdit.placement.surface,
          rotatedFootprint(def.footprint, rotSteps),
        ),
      };
      return { activeEdit: { ...s.activeEdit, placement, check: validate(placement, s.layout) } };
    });
  },

  confirm() {
    const s = get();
    // Never commit before the saved room has loaded: persisting against a not-yet-hydrated (empty
    // or failed) layout would overwrite the whole saved room with just this ghost.
    if (!s.hydrated) return;
    if (!s.activeEdit || !s.activeEdit.check.ok) return;
    const layout = [...s.layout, s.activeEdit.placement];
    set({ layout, activeEdit: null });
    persist(s.ownerId, layout);
  },

  cancel() {
    set((s) => {
      if (!s.activeEdit) return s;
      // An edited piece snaps back to where it stood; a new one evaporates (it still exists in
      // whatever inventory offered it — nothing was committed).
      return {
        layout: s.activeEdit.previous ? [...s.layout, s.activeEdit.previous] : s.layout,
        activeEdit: null,
      };
    });
  },

  remove() {
    const s = get();
    if (!s.hydrated) return;
    if (!s.activeEdit) return;
    const wasCommitted = s.activeEdit.previous !== null;
    // The ghost is already out of `layout`; dropping the edit deletes the piece.
    set({ activeEdit: null });
    // A never-committed ghost changed nothing — only a real deletion is worth a save.
    if (wasCommitted) persist(s.ownerId, s.layout);
  },

  reset: () => set({ ownerId: null, layout: [], activeEdit: null, hydrated: false }),
}));
