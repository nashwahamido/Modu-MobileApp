// Room layout state: the committed placements plus at most ONE active edit. Lifted out of RoomExperience so any route can start a placement and the scene can render the layout without owning it.
// The scene is a pure function of this store, and persistence is repos.rooms alone. Save happens on commit, never mid-drag — a half-finished ghost must not be written.
import { create } from "zustand";

import { getRepos } from "../../data/registry";
import type { PlacedFurniture, RoomLayout, UserId } from "../../data/core/types";
import { defaultVariationOf } from "../../data/catalog/variantStore";
import { readRoomFinishes, type RoomFinishes } from "../../data/room/layoutMigrate";
import {
  anchorForCentre,
  canPlace,
  buildOccupancy,
  clampToSurface,
  hostTopExtent,
  occupiedFootprint,
  resolveHost,
  surfaceKey,
  type GridPlacement,
  type PlacementCheck,
  type RotSteps,
  type SurfaceId,
} from "./grid";
import { removeWithChildren, sanitizeLayout } from "./layoutSanitise";
import { ORBIT } from "../input/orbit";
import { FLOOR_CELLS, WINDOW_BANDS } from "./roomShell";
import { visibleWalls } from "./wallCulling";
import { getRoomItemDef, roomItemDefs } from "./placeableItems";
import { ROOM_LAYOUT_VERSION } from "../../data/core/types";

// Where the camera is looking, mirrored by the scene. A plain module value, NOT store state: it changes every frame under a finger, and in zustand it would re-render every layout subscriber at 60Hz.
// Nothing reads it reactively — it is sampled only at the instant a placement begins.
let cameraAzimuth = ORBIT.restTheta;

export function setCameraAzimuth(theta: number): void {
  cameraAzimuth = theta;
}

// The persisted shape and the grid's working shape are one thing under two names, converted in one place so they cannot drift. Exported for the visit screen, which loads a friend's room without hydrate.
export const toGrid = (p: PlacedFurniture): GridPlacement => ({
  instanceId: p.instanceId,
  itemId: p.furnitureId,
  variation: p.color ?? null,
  surface: p.surface,
  cell: p.cell,
  rotSteps: p.rotSteps,
  lightOn: p.lightOn,
});

const fromGrid = (p: GridPlacement): PlacedFurniture => ({
  instanceId: p.instanceId,
  furnitureId: p.itemId,
  surface: p.surface,
  cell: p.cell,
  rotSteps: p.rotSteps,
  ...(p.variation ? { color: p.variation } : {}),
  // Written ONLY when off, like color is written only when set: an absent field is the default, so a room of lit lamps saves as it did before this field existed.
  ...(p.lightOn === false ? { lightOn: false } : {}),
});

export interface ActiveEdit {
  placement: GridPlacement;
  // Where the piece stood before this edit, or null for a NEW item (cancel then discards it).
  previous: GridPlacement | null;
  check: PlacementCheck;
  // True only when a completed build sends the player's first furniture here — drives the mascot coach mark.
  firstPlacementGuide: boolean;
  // A profile-owned fixture: it uses the ordinary edit controls, but confirm/cancel return it to `reserved` and never save it as the player's furniture.
  reserved: boolean;
}

interface PlacementState {
  ownerId: UserId | null;
  layout: GridPlacement[];
  // Profile-owned, non-persisted fixtures: they render and block placement like furniture but never enter the saved room.
  reserved: GridPlacement[];
  // The room's chosen surface items. Not placements — nothing occupies a cell — but persisted in the SAME row, so they ride the same save.
  finishes: RoomFinishes;
  activeEdit: ActiveEdit | null;
  // Bumped on each fresh start so the scene can recentre its ghost focus.
  startNonce: number;
  hydrated: boolean;
  // The room being VISITED, or null in the player's own. Held ALONGSIDE `layout`/`finishes`, never instead: ownerId stays the player's, so persist() cannot reach a friend's room and coming home costs no refetch.
  viewing: { ownerId: UserId; layout: GridPlacement[]; finishes: RoomFinishes } | null;

  // Load the owner's saved layout. Also the account-switch reset: a new ownerId replaces everything.
  hydrate: (ownerId: UserId) => Promise<void>;
  // Enter / leave a friend's room, both synchronous: the player's own layout is never discarded, so returning shows no empty frame.
  startViewing: (ownerId: UserId, layout: GridPlacement[], finishes: RoomFinishes) => void;
  stopViewing: () => void;
  setReserved: (placements: GridPlacement[]) => void;
  startPlacing: (itemId: string, opts?: { firstPlacementGuide?: boolean; variation?: string | null }) => boolean;
  // null clears the slot back to the shell as authored — a real choice, not an absence: "Default" is the first swatch in the picker.
  setFinish: (slot: "floor" | "wall", itemId: string | null) => void;
  // Recolour the ghost mid-placement. A pure LOOK — same footprint, same validity — so nothing is re-validated, only the model the scene loads.
  setGhostVariation: (variation: string | null) => void;
  // Re-edit a committed piece (long-press / tap on it).
  editPlacement: (instanceId: string) => void;
  // Optionally with a new surface: dragging a wall item past the corner hands it to the other wall.
  moveGhost: (cell: { x: number; y: number }, surface?: SurfaceId) => void;
  rotateGhost: (direction: -1 | 1) => void;
  // Flips the lamp being edited. Rides the edit like rotation, so the switch commits with the placement and cancel discards it, rather than changing under a ghost the player abandons.
  toggleGhostLight: () => void;
  confirm: () => void;
  cancel: () => void;
  remove: () => void;
  // Back to a blank store, so one player's room never carries into the next on an account switch.
  reset: () => void;
}

const nextInstanceId = (itemId: string, layout: GridPlacement[]): string => {
  // Deterministic and human-readable; uniqueness only needs to hold within one layout.
  let n = layout.length + 1;
  while (layout.some((p) => p.instanceId === `${itemId}#${n}`)) n += 1;
  return `${itemId}#${n}`;
};

const validate = (
  placement: GridPlacement,
  layout: GridPlacement[],
  reserved: readonly GridPlacement[] = [],
): PlacementCheck =>
  canPlace(
    placement,
    getRoomItemDef(placement.itemId),
    buildOccupancy([...layout, ...reserved], roomItemDefs(), placement.instanceId),
    // A stacked ghost's host is a COMMITTED piece, so the layout is where to resolve it.
    placement.surface.kind === "furniture" ? resolveHost(placement.surface.hostInstanceId, layout, roomItemDefs()) : null,
  );

// Queued so two quick commits cannot land out of order — the later snapshot must win. A lost write self-heals on the next commit.
let saveQueue: Promise<void> = Promise.resolve();
const persist = (ownerId: UserId | null, layout: GridPlacement[], finishes: RoomFinishes) => {
  if (!ownerId) return;
  const snapshot: RoomLayout = {
    ownerId,
    version: ROOM_LAYOUT_VERSION,
    placements: layout.map(fromGrid),
    finishes,
    updatedAt: new Date().toISOString(),
  };
  saveQueue = saveQueue
    .then(() => getRepos().rooms.save(ownerId, snapshot))
    .catch((err) => console.warn("[room] layout save failed", err));
};

export const usePlacementStore = create<PlacementState>()((set, get) => ({
  ownerId: null,
  layout: [],
  reserved: [],
  finishes: {},
  activeEdit: null,
  startNonce: 0,
  hydrated: false,
  viewing: null,

  async hydrate(ownerId) {
    if (get().ownerId === ownerId && get().hydrated) return;
    // A ghost started before the first hydrate belongs to the incoming owner, so it is kept. Only a real account SWITCH throws the edit away.
    const previousOwnerId = get().ownerId;
    const ownerChanged = previousOwnerId !== null && previousOwnerId !== ownerId;
    const keepEdit = previousOwnerId === null || previousOwnerId === ownerId;
    set((s) => ({
      ownerId,
      layout: [],
      reserved: ownerChanged ? [] : s.reserved,
      finishes: {},
      activeEdit: keepEdit ? s.activeEdit : null,
      hydrated: false,
    }));
    try {
      const saved = await getRepos().rooms.get(ownerId);
      // An account switch mid-fetch must not land the old owner's rows in the new owner's room.
      if (get().ownerId !== ownerId) return;
      set((s) => {
        // Saved rows are re-validated against TODAY'S rules, not the ones they were placed under — see sanitizeLayout for what that defends against.
        const layout = sanitizeLayout(saved.placements.map(toGrid));
        // Shape-validated only: ids are checked against the catalogue at RENDER time, since the item set is remote and one can stop existing between save and load.
        const finishes = readRoomFinishes(saved);
        let activeEdit = s.activeEdit;
        // A pre-hydration ghost was keyed and validated against an empty room, so both are redone against the real layout — no collision, no reused instanceId.
        if (activeEdit && activeEdit.previous === null) {
          const placement = {
            ...activeEdit.placement,
            instanceId: nextInstanceId(activeEdit.placement.itemId, layout),
          };
          activeEdit = { ...activeEdit, placement, check: validate(placement, layout, s.reserved) };
        }
        return { layout, finishes, activeEdit, hydrated: true };
      });
    } catch (err) {
      // Leave hydrated=false: the room renders empty but commits stay blocked, so a failed load can never cause a save that wipes the real layout.
      console.warn("[room] layout load failed", err);
    }
  },

  startViewing(ownerId, layout, finishes) {
    set((s) => ({
      // A ghost in flight belongs to the player's OWN room, so entering a visit puts the edited piece back exactly as cancel() would rather than carrying it into someone else's. A new ghost evaporates, also like cancel.
      layout:
        s.activeEdit?.previous && !s.activeEdit.reserved
          ? [...s.layout, s.activeEdit.previous]
          : s.layout,
      reserved:
        s.activeEdit?.previous && s.activeEdit.reserved
          ? [...s.reserved, s.activeEdit.previous]
          : s.reserved,
      activeEdit: null,
      viewing: { ownerId, layout, finishes },
    }));
  },

  stopViewing() {
    set({ viewing: null });
  },

  setReserved(placements) {
    set((s) => {
      const unchanged =
        s.reserved.length === placements.length &&
        s.reserved.every((current, index) => {
          const next = placements[index];
          return (
            next &&
            current.instanceId === next.instanceId &&
            current.itemId === next.itemId &&
            current.cell.x === next.cell.x &&
            current.cell.y === next.cell.y &&
            current.rotSteps === next.rotSteps
          );
        });
      if (unchanged) return s;
      return {
        reserved: placements,
        activeEdit: s.activeEdit
          ? {
              ...s.activeEdit,
              check: validate(s.activeEdit.placement, s.layout, placements),
            }
          : null,
      };
    });
  },

  startPlacing(itemId, opts) {
    // Nothing may be placed into a room the player is visiting. This and editPlacement are the ONLY ways an activeEdit is created, so refusing here leaves every path below inert — they all bail on a null edit.
    if (get().viewing) return false;
    const def = getRoomItemDef(itemId);
    // No room model: refuse to enter placement rather than drag an invisible ghost.
    if (!def) return false;

    set((s) => {
      // Starting over an in-progress EDIT puts the edited piece back first, exactly as cancel() would; a new ghost just evaporates.
      const layout =
        s.activeEdit?.previous && !s.activeEdit.reserved
          ? [...s.layout, s.activeEdit.previous]
          : s.layout;
      const reserved =
        s.activeEdit?.previous && s.activeEdit.reserved
          ? [...s.reserved, s.activeEdit.previous]
          : s.reserved;
      // The def routes the surface, and the question is two-way: `mount` is required, so every item is floor- or wall-mounted and `on_top` only ADDS a surface. A tops-only item would fall through onto a wall it could never be confirmed on.
      // Wall-only items ghost onto a wall the camera can SEE. Hard-coded to z-max it was fine under a 90° arc, but a free orbit drops the ghost behind the player and the placement reads as having silently failed.
      const surface: SurfaceId = def.allowedSurfaces.includes("floor")
        ? { kind: "floor" }
        : { kind: "wall", wall: visibleWalls(cameraAzimuth)[0] ?? "z-max" };
      // The ghost starts centred on its surface — in the WINDOW BAND for a window, since the structural wall outside can never take the hole. The first drag snaps it under the finger.
      let startCell =
        surface.kind === "floor"
          ? anchorForCentre({ x: Math.floor(FLOOR_CELLS.w / 2), y: Math.floor(FLOOR_CELLS.d / 2) }, def.footprint)
          : { x: 7, y: 5 };
      if (surface.kind === "wall") {
        const band = WINDOW_BANDS[surface.wall];
        const h = def.wallHeightCells ?? def.footprint.d;
        startCell = def.opensWall
          ? {
              x: band.cols.from + Math.floor((band.cols.to - band.cols.from - def.footprint.w) / 2),
              y: band.rows.from + Math.floor((band.rows.to - band.rows.from - h) / 2),
            }
          : { x: 7, y: 5 };
      }
      const placement: GridPlacement = {
        instanceId: nextInstanceId(itemId, layout),
        itemId,
        // Opens on the item's DEFAULT colour, null when the variant table has not loaded. A SNAPSHOT of what gets PERSISTED, not what gets drawn — the model is resolved against item_variants again at render time, so a null here does not condemn the piece to the 'default' path.
        variation: opts?.variation ?? defaultVariationOf(itemId),
        surface,
        cell: startCell,
        rotSteps: 0,
      };
      return {
        layout,
        activeEdit: {
          placement,
          previous: null,
          check: validate(placement, layout, reserved),
          firstPlacementGuide: opts?.firstPlacementGuide ?? false,
          reserved: false,
        },
        reserved,
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
      if (s.activeEdit || s.viewing) return s;
      const committed = s.layout.find((p) => p.instanceId === instanceId);
      const reserved = s.reserved.find((p) => p.instanceId === instanceId);
      const existing = committed ?? reserved;
      if (!existing) return s;
      return {
        // The piece leaves the committed layout while edited, so it neither renders twice nor collides with its own ghost.
        layout: committed
          ? s.layout.filter((p) => p.instanceId !== instanceId)
          : s.layout,
        reserved: reserved
          ? s.reserved.filter((p) => p.instanceId !== instanceId)
          : s.reserved,
        activeEdit: {
          placement: existing,
          previous: existing,
          check: { ok: true },
          firstPlacementGuide: false,
          reserved: reserved !== undefined,
        },
      };
    });
  },

  moveGhost(cell, surface) {
    set((s) => {
      if (!s.activeEdit) return s;
      const def = getRoomItemDef(s.activeEdit.placement.itemId);
      if (!def) return s;
      // A handoff may only move a piece between surface KINDS it allows: the drag layer decides WHEN to hop, this only refuses nonsense. Checked against allowedSurfaces directly, mirroring canPlace.
      const nextSurface =
        surface && def.allowedSurfaces.includes(surface.kind) ? surface : s.activeEdit.placement.surface;
      // occupiedFootprint, not rotatedFootprint: on a wall the second axis is wallHeightCells, and the raw depth would let a tall piece slide past the top; on furniture it picks topFootprint.
      const footprint = occupiedFootprint({ ...s.activeEdit.placement, surface: nextSurface }, def);
      // clampToSurface wants the host's TOP EXTENT for a furniture surface, not its floor footprint.
      const nextHost =
        nextSurface.kind === "furniture" ? resolveHost(nextSurface.hostInstanceId, s.layout, roomItemDefs()) : null;
      const hostFootprint = nextHost ? hostTopExtent(nextHost.def) : undefined;
      const clamped = clampToSurface(cell, nextSurface, footprint, hostFootprint);
      // Cells are a quarter metre, so most drag events stay inside the current one. Bailing with the SAME object notifies nobody — re-rendering the room per pan event instead of per cell crossing is what blew React's update depth.
      const current = s.activeEdit.placement;
      if (
        clamped.x === current.cell.x &&
        clamped.y === current.cell.y &&
        surfaceKey(nextSurface) === surfaceKey(current.surface)
      ) {
        return s;
      }
      const placement = { ...current, surface: nextSurface, cell: clamped };
      return { activeEdit: { ...s.activeEdit, placement, check: validate(placement, s.layout, s.reserved) } };
    });
  },

  rotateGhost(direction) {
    set((s) => {
      if (!s.activeEdit) return s;
      // Wall items face out of their wall and ignore rotation; re-clamping with a swapped footprint would corrupt a tall piece for nothing.
      if (s.activeEdit.placement.surface.kind === "wall") return s;
      const def = getRoomItemDef(s.activeEdit.placement.itemId);
      if (!def) return s;
      const rotSteps = ((((s.activeEdit.placement.rotSteps + direction) % 4) + 4) % 4) as RotSteps;
      const surface = s.activeEdit.placement.surface;
      const host = surface.kind === "furniture" ? resolveHost(surface.hostInstanceId, s.layout, roomItemDefs()) : null;
      const placement = {
        ...s.activeEdit.placement,
        rotSteps,
        // Re-clamp, since the swapped footprint may spill past an edge the old one touched — against the HOST's TOP EXTENT on furniture, and via occupiedFootprint so a stacked ghost uses its topFootprint.
        cell: clampToSurface(
          s.activeEdit.placement.cell,
          surface,
          occupiedFootprint({ ...s.activeEdit.placement, rotSteps }, def),
          host ? hostTopExtent(host.def) : undefined,
        ),
      };
      return { activeEdit: { ...s.activeEdit, placement, check: validate(placement, s.layout, s.reserved) } };
    });
  },

  toggleGhostLight() {
    set((s) => {
      if (!s.activeEdit) return s;
      // Only a piece that emits light has a switch, or the flag persists on furniture nothing reads it for.
      if (!getRoomItemDef(s.activeEdit.placement.itemId)?.emitsLight) return s;
      const placement = { ...s.activeEdit.placement, lightOn: s.activeEdit.placement.lightOn === false };
      // Not re-validated, unlike rotateGhost: a switch moves no geometry, so the check cannot have changed and re-running it only risks disagreeing with itself.
      return { activeEdit: { ...s.activeEdit, placement } };
    });
  },

  confirm() {
    const s = get();
    if (!s.activeEdit || !s.activeEdit.check.ok) return;
    if (s.activeEdit.reserved) {
      set({ reserved: [...s.reserved, s.activeEdit.placement], activeEdit: null });
      return;
    }
    // Never commit before the saved room has loaded: persisting against an unhydrated layout would overwrite the whole room with just this ghost.
    if (!s.hydrated) return;
    const layout = [...s.layout, s.activeEdit.placement];
    set({ layout, activeEdit: null });
    persist(s.ownerId, layout, s.finishes);
  },

  cancel() {
    set((s) => {
      if (!s.activeEdit) return s;
      // An edited piece snaps back to where it stood; a new one evaporates, still in whatever inventory offered it.
      return {
        layout:
          s.activeEdit.previous && !s.activeEdit.reserved
            ? [...s.layout, s.activeEdit.previous]
            : s.layout,
        reserved:
          s.activeEdit.previous && s.activeEdit.reserved
            ? [...s.reserved, s.activeEdit.previous]
            : s.reserved,
        activeEdit: null,
      };
    });
  },

  remove() {
    const s = get();
    if (!s.activeEdit) return;
    // A reserved fixture is room profile, not owned inventory, so delete behaves like cancel: movable and rotatable, never removed or persisted.
    if (s.activeEdit.reserved) {
      set({
        reserved: s.activeEdit.previous
          ? [...s.reserved, s.activeEdit.previous]
          : s.reserved,
        activeEdit: null,
      });
      return;
    }
    if (!s.hydrated) return;
    const wasCommitted = s.activeEdit.previous !== null;
    // The ghost is already out of `layout`, so dropping the edit deletes the piece — and a HOST leaves with everything standing on it, one filter and one persist. Children return to inventory implicitly.
    const layout = removeWithChildren(s.layout, s.activeEdit.placement.instanceId);
    const ejectedChildren = layout.length !== s.layout.length;
    set({ activeEdit: null, layout });
    // A never-committed ghost with nothing on it changed nothing; only a real deletion is worth a save.
    if (wasCommitted || ejectedChildren) persist(s.ownerId, layout, s.finishes);
  },

  setFinish(slot, itemId) {
    const s = get();
    // Never save before the room has hydrated, or an empty layout overwrites the whole saved room — the same guard confirm carries.
    if (!s.hydrated) return;
    const finishes = { ...s.finishes };
    if (itemId === null) delete finishes[slot];
    else finishes[slot] = itemId;
    set({ finishes });
    persist(s.ownerId, s.layout, finishes);
  },

  reset: () => set({ ownerId: null, layout: [], reserved: [], finishes: {}, activeEdit: null, hydrated: false, viewing: null }),
}));
