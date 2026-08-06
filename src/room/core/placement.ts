// Room layout state: the committed placements plus at most ONE active edit (a ghost being dragged). Lifted out of RoomExperience so any route can start a placement (Inventory, BuildComplete) and so the scene can render the layout without owning it.
//
// The scene is a pure function of this store; persistence is repos.rooms and nothing else. Save happens on commit (confirm/remove), never mid-drag — a half-finished ghost must not be written.
import { create } from "zustand";

import { getRepos } from "../../data";
import type { PlacedFurniture, RoomLayout, UserId } from "../../data/core/types";
import { defaultVariationOf } from "../../data/catalog/variantStore";
import {
  anchorForCentre,
  canPlace,
  buildOccupancy,
  clampToSurface,
  occupiedFootprint,
  resolveHost,
  rotatedFootprint,
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

// Where the camera is looking, mirrored here by the scene so store actions can consult it. Deliberately a plain module value and NOT store state: it changes every frame while a finger is down, and putting it in zustand would re-render every subscriber of the layout at 60 Hz. Nothing reads it reactively — it is only ever sampled at the instant a placement begins.
let cameraAzimuth = ORBIT.restTheta;

export function setCameraAzimuth(theta: number): void {
  cameraAzimuth = theta;
}

// The persisted shape and the grid's working shape are the same thing under two names; keep the conversion in one visible place so they cannot drift silently. Exported for the visit screen, which loads a friend's saved room without going through hydrate.
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
  // Written ONLY when off, the same way color is written only when set: an absent field is the default, so a room full of lit lamps saves exactly as it did before this field existed.
  ...(p.lightOn === false ? { lightOn: false } : {}),
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
  // The room being VISITED, or null when the player is in their own. Holds a friend's layout ALONGSIDE `layout`, never instead of it: ownerId stays the player's, so persist() has no reachable path to a friend's room, and coming home costs no refetch.
  viewing: { ownerId: UserId; layout: GridPlacement[] } | null;

  // Load the owner's saved layout. Also the account-switch reset: a new ownerId replaces everything.
  hydrate: (ownerId: UserId) => Promise<void>;
  // Enter / leave a friend's room. Both synchronous: the player's own layout is never discarded, so returning shows no empty frame the way a re-hydrate would.
  startViewing: (ownerId: UserId, layout: GridPlacement[]) => void;
  stopViewing: () => void;
  startPlacing: (itemId: string, opts?: { firstPlacementGuide?: boolean; variation?: string | null }) => boolean;
  // Recolour the ghost mid-placement. Variation is a pure LOOK: same footprint, same validity, so nothing is re-validated — only the model the scene loads changes.
  setGhostVariation: (variation: string | null) => void;
  // Re-edit a committed piece (long-press / tap on it).
  editPlacement: (instanceId: string) => void;
  // Optionally with a new surface: dragging a wall item past the corner hands it to the other wall.
  moveGhost: (cell: { x: number; y: number }, surface?: SurfaceId) => void;
  rotateGhost: (direction: -1 | 1) => void;
  // Flips the lamp being edited on or off. Rides the edit like rotation does, so the switch commits with the placement and cancel discards it — one rule for everything a piece carries, rather than a light that changes under a ghost the player then abandons.
  toggleGhostLight: () => void;
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
    getRoomItemDef(placement.itemId),
    buildOccupancy(layout, roomItemDefs(), placement.instanceId),
    // A stacked ghost's host is a COMMITTED piece, so the layout is the right place to resolve it.
    placement.surface.kind === "furniture" ? resolveHost(placement.surface.hostInstanceId, layout, roomItemDefs()) : null,
  );

// Saves are queued so two quick commits cannot land out of order (the later snapshot must win server-side). A lost write still self-heals on the next commit.
let saveQueue: Promise<void> = Promise.resolve();
const persist = (ownerId: UserId | null, layout: GridPlacement[]) => {
  if (!ownerId) return;
  const snapshot: RoomLayout = {
    ownerId,
    version: ROOM_LAYOUT_VERSION,
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
  viewing: null,

  async hydrate(ownerId) {
    if (get().ownerId === ownerId && get().hydrated) return;
    // A ghost started before the first hydrate (BuildComplete's "place it now") belongs to the incoming owner — keep it. Only an actual account SWITCH throws the edit away.
    const keepEdit = get().ownerId === null || get().ownerId === ownerId;
    set((s) => ({ ownerId, layout: [], activeEdit: keepEdit ? s.activeEdit : null, hydrated: false }));
    try {
      const saved = await getRepos().rooms.get(ownerId);
      // An account switch mid-fetch must not land the old owner's rows in the new owner's room.
      if (get().ownerId !== ownerId) return;
      set((s) => {
        // Saved rows are re-validated against TODAY'S rules, not the rules they were placed under — see sanitizeLayout for what that defends against and why an unknown def is kept.
        const layout = sanitizeLayout(saved.placements.map(toGrid));
        let activeEdit = s.activeEdit;
        // A pre-hydration ghost was keyed and validated against an empty room; redo both against the real layout so it cannot collide with a saved piece or reuse its instanceId.
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
      // Leave hydrated=false: the room renders empty but commits stay blocked (see confirm/remove), so a failed load can never cause a save that wipes the real layout.
      console.warn("[room] layout load failed", err);
    }
  },

  startViewing(ownerId, layout) {
    set((s) => ({
      // A ghost in flight belongs to the player's OWN room, and the bottom bar stays live during placement — so entering a visit puts the edited piece back exactly as cancel() would rather than carrying it into someone else's room. A never-committed ghost evaporates, which is also cancel's behaviour.
      layout: s.activeEdit?.previous ? [...s.layout, s.activeEdit.previous] : s.layout,
      activeEdit: null,
      viewing: { ownerId, layout },
    }));
  },

  stopViewing() {
    set({ viewing: null });
  },

  startPlacing(itemId, opts) {
    // Nothing may be placed into a room the player is only visiting. This and editPlacement are the ONLY ways an activeEdit comes into being, so refusing here leaves every path below it inert: moveGhost, rotateGhost, confirm and remove all bail on a null edit, and the ghost and GridOverlay only render when one exists.
    if (get().viewing) return false;
    const def = getRoomItemDef(itemId);
    // No room model for this item: refuse to enter placement rather than drag an invisible ghost.
    if (!def) return false;
    set((s) => {
      // Starting over an in-progress EDIT must not discard the edited piece: put it back first, exactly as cancel() would (a new ghost just evaporates).
      const layout = s.activeEdit?.previous ? [...s.layout, s.activeEdit.previous] : s.layout;
      // The def routes the surface: wall-only items (windows, later frames) ghost onto a wall the camera can SEE, everything else onto the floor. This used to be hard-coded to z-max, which was fine while the camera was clamped to a 90-degree arc facing it — with a free 360 orbit it drops the ghost onto whichever wall happens to be behind the player, and the placement reads as having silently failed.
      const surface: SurfaceId = def.allowedSurfaces.includes("floor")
        ? { kind: "floor" }
        : { kind: "wall", wall: visibleWalls(cameraAzimuth)[0] ?? "z-max" };
      // Ghost starts centred on its surface, whatever the grid's resolution — for a window, centred in the WINDOW BAND instead, since the structural wall outside it can never accept the hole; the first drag snaps it under the finger.
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
        // Opens on the item's DEFAULT colour, the one its tile showed. Null when the variant table has not loaded (or the item has no colour axis) — the 'default' model, which is what the bundle has.
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
      if (s.activeEdit || s.viewing) return s;
      const existing = s.layout.find((p) => p.instanceId === instanceId);
      if (!existing) return s;
      return {
        // The piece leaves the committed layout while being edited, so it neither renders twice nor collides with its own ghost.
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

  moveGhost(cell, surface) {
    set((s) => {
      if (!s.activeEdit) return s;
      const def = getRoomItemDef(s.activeEdit.placement.itemId);
      if (!def) return s;
      // A surface handoff may only move a piece between surfaces of a KIND it allows — the drag layer decides WHEN to hop (corner crossing, tabletop entry); this only refuses nonsense. A furniture top takes anything that lives on the FLOOR, mirroring canPlace's rule.
      const hopKind = surface ? (surface.kind === "furniture" ? "floor" : surface.kind) : null;
      const nextSurface =
        surface && hopKind && def.allowedSurfaces.includes(hopKind) ? surface : s.activeEdit.placement.surface;
      // occupiedFootprint, not rotatedFootprint: on a wall the second axis is wallHeightCells, and clamping with the raw depth (1 for a window) would let a tall piece slide up past the top.
      const footprint = occupiedFootprint({ ...s.activeEdit.placement, surface: nextSurface }, def);
      const hostFootprint =
        nextSurface.kind === "furniture"
          ? resolveHost(nextSurface.hostInstanceId, s.layout, roomItemDefs())?.def.footprint
          : undefined;
      const clamped = clampToSurface(cell, nextSurface, footprint, hostFootprint);
      // Cells are a quarter metre — most drag events stay inside the current one. Bail with the SAME state object so zustand notifies nobody: this runs per pan event, and re-rendering the whole room per event (instead of per cell crossing) is what blew React's update depth.
      const current = s.activeEdit.placement;
      if (
        clamped.x === current.cell.x &&
        clamped.y === current.cell.y &&
        surfaceKey(nextSurface) === surfaceKey(current.surface)
      ) {
        return s;
      }
      const placement = { ...current, surface: nextSurface, cell: clamped };
      return { activeEdit: { ...s.activeEdit, placement, check: validate(placement, s.layout) } };
    });
  },

  rotateGhost(direction) {
    set((s) => {
      if (!s.activeEdit) return s;
      // Wall items face out of their wall and ignore rotation; re-clamping with a swapped footprint would corrupt a tall piece's position for nothing.
      if (s.activeEdit.placement.surface.kind === "wall") return s;
      const def = getRoomItemDef(s.activeEdit.placement.itemId);
      if (!def) return s;
      const rotSteps = ((((s.activeEdit.placement.rotSteps + direction) % 4) + 4) % 4) as RotSteps;
      const placement = {
        ...s.activeEdit.placement,
        rotSteps,
        // Re-clamp: the swapped footprint may spill past an edge the old one touched — against the HOST's grid when the ghost stands on furniture.
        cell: clampToSurface(
          s.activeEdit.placement.cell,
          s.activeEdit.placement.surface,
          rotatedFootprint(def.footprint, rotSteps),
          s.activeEdit.placement.surface.kind === "furniture"
            ? resolveHost(s.activeEdit.placement.surface.hostInstanceId, s.layout, roomItemDefs())?.def.footprint
            : undefined,
        ),
      };
      return { activeEdit: { ...s.activeEdit, placement, check: validate(placement, s.layout) } };
    });
  },

  toggleGhostLight() {
    set((s) => {
      if (!s.activeEdit) return s;
      // Only a piece that actually emits light has a switch: without this a flag would persist on furniture nothing ever reads it for.
      if (!getRoomItemDef(s.activeEdit.placement.itemId)?.emitsLight) return s;
      const placement = { ...s.activeEdit.placement, lightOn: s.activeEdit.placement.lightOn === false };
      // Not re-validated, unlike rotateGhost: a switch moves no geometry, so the placement check cannot have changed and re-running it would only risk disagreeing with itself.
      return { activeEdit: { ...s.activeEdit, placement } };
    });
  },

  confirm() {
    const s = get();
    // Never commit before the saved room has loaded: persisting against a not-yet-hydrated (empty or failed) layout would overwrite the whole saved room with just this ghost.
    if (!s.hydrated) return;
    if (!s.activeEdit || !s.activeEdit.check.ok) return;
    const layout = [...s.layout, s.activeEdit.placement];
    set({ layout, activeEdit: null });
    persist(s.ownerId, layout);
  },

  cancel() {
    set((s) => {
      if (!s.activeEdit) return s;
      // An edited piece snaps back to where it stood; a new one evaporates (it still exists in whatever inventory offered it — nothing was committed).
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
    // The ghost is already out of `layout`; dropping the edit deletes the piece — and a HOST leaves with everything standing on it (eject-on-remove, spec 2026-08-05), which is one filter and one persist. Children return to inventory implicitly, like every removed piece.
    const layout = removeWithChildren(s.layout, s.activeEdit.placement.instanceId);
    const ejectedChildren = layout.length !== s.layout.length;
    set({ activeEdit: null, layout });
    // A never-committed ghost with nothing on it changed nothing — only a real deletion is worth a save.
    if (wasCommitted || ejectedChildren) persist(s.ownerId, layout);
  },

  reset: () => set({ ownerId: null, layout: [], activeEdit: null, hydrated: false, viewing: null }),
}));
