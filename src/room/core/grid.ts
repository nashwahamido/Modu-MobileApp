// Grid placement: which cells a piece occupies, and whether it may stand there.
// Pure logic over plain data — no Filament, no React, no async. The renderer is a function of the layout this module validates, never the other way round.
//
// There is deliberately no physics here. Nothing in a room moves under forces, so placement is a discrete constraint problem: in-bounds, and not overlapping. An occupancy set answers that exactly and in O(footprint), with none of the tunnelling or jitter a rigid-body solver brings.
import {
  FLOOR_CELLS,
  ROOM_SHELL,
  WALL_CELLS,
  WALL_CELL_SIZE,
  WINDOW_BANDS,
  isXWall,
  windowCellEntityName,
  type Vec3,
  type WallId,
} from "./roomShell";

export type SurfaceKind = "floor" | "wall" | "furniture";

// Which grid a placement lives on. Each surface is an INDEPENDENT 2D grid — there is no shared world grid, so collision never has to reason across surfaces. The furniture variant (books on a shelf, a vase on a cabinet) is reserved so adding it later is not a data migration; nothing builds it yet.
export type SurfaceId =
  | { kind: "floor" }
  | { kind: "wall"; wall: WallId }
  | { kind: "furniture"; hostInstanceId: string; slot: string };

export type Cell = { x: number; y: number };

// Quarter turns. Floor items rotate; wall items face out of their wall and ignore this.
export type RotSteps = 0 | 1 | 2 | 3;

// Cells, at rotSteps 0. Rotating by an odd number of steps swaps the two.
export type Footprint = { w: number; d: number };

// The static per-item metadata the grid needs. Identity, names and variations come from the catalog (placeable_items / item_variants); this is only what placement itself has to know.
export type PlaceableItemDef = {
  itemId: string;
  footprint: Footprint;
  allowedSurfaces: SurfaceKind[];
  // Wall items: how far up the wall the piece extends, in cells.
  wallHeightCells?: number;
  // Windows: this item's footprint is a HOLE — the scene knocks the covered shell cells out of the wall. Frames hang on the wall surface and leave it intact.
  opensWall?: boolean;
  // Lighting (category 'lit'): the renderer hangs a light over this piece and moves it as the piece moves. Purely a rendering concern — placement, collision and persistence treat a lighting item as ordinary furniture, so nothing below this line knows or cares that it glows.
  emitsLight?: boolean;
  // Which cells of the w×d footprint are solid, at rotSteps 0: d rows of w chars, 'X' solid, '.' empty; row 0 is the -y edge. Absent = solid rectangle. Floor surfaces only — wall footprints are already exact holes.
  mask?: readonly string[];
  // This item exposes its top as a placement surface (placeable_items.top_surface, migration 016): tables and cabinets host, sofas and beds do not. The top grid is this def's own footprint at rotSteps 0, mask included.
  hostsTop?: boolean;
};

// One placed object. This is the persisted shape — see src/data/core/types.ts PlacedFurniture.
export type GridPlacement = {
  instanceId: string;
  itemId: string;
  variation: string | null;
  surface: SurfaceId;
  // Anchor cell, min-corner convention: the footprint extends towards +x / +y from here.
  cell: Cell;
  rotSteps: RotSteps;
  // Mirrors PlacedFurniture.lightOn: undefined means ON, so only an explicitly switched-off lamp carries it. Nothing in this module reads it — placement and collision do not care whether a lamp is lit — it rides along so the round trip through toGrid/fromGrid preserves it.
  lightOn?: boolean;
};

export type PlacementRejection =
  | "out-of-bounds"
  | "occupied"
  | "surface-not-allowed"
  | "unknown-item"
  // The furniture surface's host is missing, not on the floor, or not flagged to host.
  | "no-host";

export type PlacementCheck = { ok: true } | { ok: false; reason: PlacementRejection };

const OK: PlacementCheck = { ok: true };

// A stable string per surface, so occupancy can be a flat map. Wall and furniture surfaces include their discriminator: two walls are two grids, and two host cabinets are two more.
export function surfaceKey(surface: SurfaceId): string {
  switch (surface.kind) {
    case "floor":
      return "floor";
    case "wall":
      return `wall:${surface.wall}`;
    case "furniture":
      return `furniture:${surface.hostInstanceId}:${surface.slot}`;
  }
}

export function cellKey(cell: Cell): string {
  return `${cell.x},${cell.y}`;
}

// The grid's extent, in cells. A furniture surface's extent is HOST-DEPENDENT (the host's own footprint), so it is checked in canPlace with a HostContext; this context-free answer stays 0×0 so callers without a layout keep rejecting rather than silently accepting.
export function surfaceExtent(surface: SurfaceId): { w: number; h: number } {
  switch (surface.kind) {
    case "floor":
      return { w: FLOOR_CELLS.w, h: FLOOR_CELLS.d };
    case "wall":
      return WALL_CELLS[surface.wall];
    case "furniture":
      return { w: 0, h: 0 };
  }
}

// The footprint as rotated. Odd quarter turns swap width and depth; even ones leave it alone.
export function rotatedFootprint(footprint: Footprint, rotSteps: RotSteps): Footprint {
  return rotSteps % 2 === 0
    ? { w: footprint.w, d: footprint.d }
    : { w: footprint.d, d: footprint.w };
}

// The mask as rotated — the grid twin of the renderer's yaw (rotSteps × 90° about Y), which maps mask cell (dx, dy) to (dy, w-1-dx) per step. Applied stepwise so one derivation covers all four turns.
export function rotatedMask(mask: readonly string[], rotSteps: RotSteps): readonly string[] {
  let rows = mask;
  for (let step = 0; step < rotSteps; step += 1) {
    const w = rows[0]?.length ?? 0;
    const d = rows.length;
    const next: string[] = [];
    for (let dy = 0; dy < w; dy += 1) {
      let row = "";
      for (let dx = 0; dx < d; dx += 1) row += rows[dx][w - 1 - dy];
      next.push(row);
    }
    rows = next;
  }
  return rows;
}

// The footprint a placement occupies on its own surface. Wall items are as wide as their footprint and as tall as wallHeightCells, since a wall grid's second axis is vertical, not depth.
export function occupiedFootprint(
  placement: GridPlacement,
  def: PlaceableItemDef,
): Footprint {
  if (placement.surface.kind === "wall") {
    return { w: def.footprint.w, d: def.wallHeightCells ?? def.footprint.d };
  }
  return rotatedFootprint(def.footprint, placement.rotSteps);
}

// Every cell a placement covers, anchor included.
export function cellsFor(placement: GridPlacement, def: PlaceableItemDef): Cell[] {
  const { w, d } = occupiedFootprint(placement, def);
  // Masks apply on the floor only — wall footprints are already exact holes, and the furniture surface is reserved and undecided.
  const mask = placement.surface.kind === "floor" && def.mask ? rotatedMask(def.mask, placement.rotSteps) : null;
  const cells: Cell[] = [];
  for (let dx = 0; dx < w; dx += 1) {
    for (let dy = 0; dy < d; dy += 1) {
      if (mask && mask[dy]?.[dx] !== "X") continue;
      cells.push({ x: placement.cell.x + dx, y: placement.cell.y + dy });
    }
  }
  return cells;
}

// surfaceKey -> the cells taken on it. Derived from the layout, never stored: a persisted occupancy map is one more thing that can disagree with the placements it describes.
export type Occupancy = Map<string, Set<string>>;

export function buildOccupancy(
  placements: readonly GridPlacement[],
  defs: ReadonlyMap<string, PlaceableItemDef>,
  // Cells belonging to this instance are left out, so moving a piece never collides with itself.
  ignoreInstanceId?: string,
): Occupancy {
  const occupancy: Occupancy = new Map();
  for (const placement of placements) {
    if (placement.instanceId === ignoreInstanceId) continue;
    const def = defs.get(placement.itemId);
    if (!def) continue;
    const key = surfaceKey(placement.surface);
    let taken = occupancy.get(key);
    if (!taken) {
      taken = new Set();
      occupancy.set(key, taken);
    }
    for (const cell of cellsFor(placement, def)) taken.add(cellKey(cell));
  }
  return occupancy;
}

// The resolved host a furniture-surface check needs. Callers with a layout in hand resolve it via resolveHost; canPlace stays layout-free.
export type HostContext = { placement: GridPlacement; def: PlaceableItemDef };

export function resolveHost(
  hostInstanceId: string,
  placements: readonly GridPlacement[],
  defs: ReadonlyMap<string, PlaceableItemDef>,
): HostContext | null {
  const placement = placements.find((p) => p.instanceId === hostInstanceId);
  const def = placement ? defs.get(placement.itemId) : undefined;
  return placement && def ? { placement, def } : null;
}

// Can this placement stand here? Runs on every drag frame, so it stays allocation-light and returns a reason code rather than display copy — the UI owns the wording.
export function canPlace(
  placement: GridPlacement,
  def: PlaceableItemDef | undefined,
  occupancy: Occupancy,
  host?: HostContext | null,
): PlacementCheck {
  if (!def) return { ok: false, reason: "unknown-item" };
  // On a furniture top, "anything that fits" means anything that lives on the FLOOR — wall items never stack, and no def lists "furniture" explicitly.
  const allowedKind = placement.surface.kind === "furniture" ? "floor" : placement.surface.kind;
  if (!def.allowedSurfaces.includes(allowedKind)) {
    return { ok: false, reason: "surface-not-allowed" };
  }

  if (placement.surface.kind === "furniture") {
    // Host must exist, stand on the FLOOR (a stacked host is not on the floor, so depth > 1 dies here), and be flagged to host.
    if (!host || host.placement.surface.kind !== "floor" || !host.def.hostsTop) {
      return { ok: false, reason: "no-host" };
    }
    // The top grid is the host's UNROTATED footprint: child cells are host-frame, so host rotation is invisible here.
    const top = host.def.footprint;
    const { w, d } = occupiedFootprint(placement, def);
    if (placement.cell.x < 0 || placement.cell.y < 0 || placement.cell.x + w > top.w || placement.cell.y + d > top.d) {
      return { ok: false, reason: "out-of-bounds" };
    }
    // Every child cell must land on host mask solid — a round table's empty corners reject like off-grid.
    if (host.def.mask) {
      for (const cell of cellsFor(placement, def)) {
        if (host.def.mask[cell.y]?.[cell.x] !== "X") return { ok: false, reason: "out-of-bounds" };
      }
    }
    const taken = occupancy.get(surfaceKey(placement.surface));
    if (taken) {
      for (const cell of cellsFor(placement, def)) {
        if (taken.has(cellKey(cell))) return { ok: false, reason: "occupied" };
      }
    }
    return OK;
  }

  const extent = surfaceExtent(placement.surface);
  const { w, d } = occupiedFootprint(placement, def);
  if (
    placement.cell.x < 0 ||
    placement.cell.y < 0 ||
    placement.cell.x + w > extent.w ||
    placement.cell.y + d > extent.h
  ) {
    return { ok: false, reason: "out-of-bounds" };
  }

  // A hole can only open where the shell has removable cells: the whole footprint must sit inside the wall's window band. The margins and the solid wall outside the band are in-bounds for a FRAME, but out-of-bounds for a window — the wall there is structural.
  if (def.opensWall && placement.surface.kind === "wall") {
    const band = WINDOW_BANDS[placement.surface.wall];
    if (
      placement.cell.x < band.cols.from ||
      placement.cell.x + w > band.cols.to ||
      placement.cell.y < band.rows.from ||
      placement.cell.y + d > band.rows.to
    ) {
      return { ok: false, reason: "out-of-bounds" };
    }
  }

  const taken = occupancy.get(surfaceKey(placement.surface));
  if (taken) {
    for (const cell of cellsFor(placement, def)) {
      if (taken.has(cellKey(cell))) return { ok: false, reason: "occupied" };
    }
  }

  return OK;
}

// Convenience for the drag loop: validate against a whole layout in one call.
export function canPlaceInLayout(
  placement: GridPlacement,
  placements: readonly GridPlacement[],
  defs: ReadonlyMap<string, PlaceableItemDef>,
): PlacementCheck {
  const occupancy = buildOccupancy(placements, defs, placement.instanceId);
  const host =
    placement.surface.kind === "furniture" ? resolveHost(placement.surface.hostInstanceId, placements, defs) : null;
  return canPlace(placement, defs.get(placement.itemId), occupancy, host);
}

// Clamp an anchor so the piece stays fully on its surface. The drag snaps to the nearest legal cell rather than refusing to move, which keeps the ghost under the finger at the room's edges.
export function clampToSurface(
  cell: Cell,
  surface: SurfaceId,
  footprint: Footprint,
  // The host's UNROTATED footprint for a furniture surface, resolved by callers with layout access; absent, a furniture clamp collapses to (0,0) — the same conservative answer surfaceExtent gives.
  hostFootprint?: Footprint,
): Cell {
  const extent =
    surface.kind === "furniture"
      ? { w: hostFootprint?.w ?? 0, h: hostFootprint?.d ?? 0 }
      : surfaceExtent(surface);
  return {
    x: Math.max(0, Math.min(cell.x, extent.w - footprint.w)),
    y: Math.max(0, Math.min(cell.y, extent.h - footprint.d)),
  };
}

// The CENTRE of a floor placement in authored room units, with its base on the floor surface. Callers hand the result to roomToScene; keeping this in authored units means it can be checked against the GLB by eye.
export function floorCellToRoom(cell: Cell, footprint: Footprint): Vec3 {
  const { cellSize, floor } = ROOM_SHELL;
  return {
    x: floor.minX + (cell.x + footprint.w / 2) * cellSize,
    y: floor.y,
    z: floor.minZ + (cell.y + footprint.d / 2) * cellSize,
  };
}

// The VOLUME a floor placement occupies, in authored room units: its claimed cells, from the floor surface up to the piece's rendered height. This is what a finger is actually pointing at — a picking ray tested against the floor PLANE instead answers with the cell behind the piece, one for every 20 cm of model height at the rest camera, which is why only a piece's base sliver used to be pickable. Height is the model's measured size.y times its fitScale; callers pass it in so this module stays free of the catalog.
export function floorPlacementBox(
  placement: GridPlacement,
  def: PlaceableItemDef,
  height: number,
): { min: Vec3; max: Vec3 } {
  const { cellSize, floor } = ROOM_SHELL;
  const { w, d } = occupiedFootprint(placement, def);
  const minX = floor.minX + placement.cell.x * cellSize;
  const minZ = floor.minZ + placement.cell.y * cellSize;
  return {
    min: { x: minX, y: floor.y, z: minZ },
    max: { x: minX + w * cellSize, y: floor.y + height, z: minZ + d * cellSize },
  };
}

// The CENTRE of a stacked placement in authored room units, base on the host's top. Child cells are HOST-LOCAL (host rotSteps-0 frame); the host's yaw turns the offset with the same (x, z) -> (x cos + z sin, -x sin + z cos) the renderer applies, so grid and model can never disagree about where a child sits.
export function topCellToRoom(
  host: HostContext,
  cell: Cell,
  childFootprint: Footprint,
  topHeight: number,
): Vec3 {
  const { cellSize } = ROOM_SHELL;
  const hostCentre = floorCellToRoom(
    host.placement.cell,
    rotatedFootprint(host.def.footprint, host.placement.rotSteps),
  );
  const lx = (cell.x + childFootprint.w / 2 - host.def.footprint.w / 2) * cellSize;
  const lz = (cell.y + childFootprint.d / 2 - host.def.footprint.d / 2) * cellSize;
  const spin = (host.placement.rotSteps * Math.PI) / 2;
  const cos = Math.cos(spin);
  const sin = Math.sin(spin);
  return {
    x: hostCentre.x + lx * cos + lz * sin,
    y: ROOM_SHELL.floor.y + topHeight,
    z: hostCentre.z - lx * sin + lz * cos,
  };
}

// The inverse: a room point (a picking ray's hit on the top plane) back into the host-frame cell it falls in. May be off-grid — callers run it through anchor/clamp/canPlace like every other pick.
export function roomPointToTopCell(host: HostContext, point: Pick<Vec3, "x" | "z">): Cell {
  const { cellSize } = ROOM_SHELL;
  const hostCentre = floorCellToRoom(
    host.placement.cell,
    rotatedFootprint(host.def.footprint, host.placement.rotSteps),
  );
  const dx = point.x - hostCentre.x;
  const dz = point.z - hostCentre.z;
  const spin = (host.placement.rotSteps * Math.PI) / 2;
  const cos = Math.cos(spin);
  const sin = Math.sin(spin);
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  return {
    x: Math.floor(lx / cellSize + host.def.footprint.w / 2),
    y: Math.floor(lz / cellSize + host.def.footprint.d / 2),
  };
}

// The pickable VOLUME of a stacked child: its host-local cell rect turned into world space (four corners, then min/max — an axis-aligned cover of the rotated rect is plenty for a finger), from the host's top up the child's rendered height.
export function topPlacementBox(
  host: HostContext,
  placement: GridPlacement,
  def: PlaceableItemDef,
  topHeight: number,
  childHeight: number,
): { min: Vec3; max: Vec3 } {
  const { cellSize } = ROOM_SHELL;
  const { w, d } = occupiedFootprint(placement, def);
  const hostCentre = floorCellToRoom(
    host.placement.cell,
    rotatedFootprint(host.def.footprint, host.placement.rotSteps),
  );
  const spin = (host.placement.rotSteps * Math.PI) / 2;
  const cos = Math.cos(spin);
  const sin = Math.sin(spin);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [cx, cy] of [
    [placement.cell.x, placement.cell.y],
    [placement.cell.x + w, placement.cell.y],
    [placement.cell.x, placement.cell.y + d],
    [placement.cell.x + w, placement.cell.y + d],
  ]) {
    const lx = (cx - host.def.footprint.w / 2) * cellSize;
    const lz = (cy - host.def.footprint.d / 2) * cellSize;
    const x = hostCentre.x + lx * cos + lz * sin;
    const z = hostCentre.z - lx * sin + lz * cos;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  return {
    min: { x: minX, y: ROOM_SHELL.floor.y + topHeight, z: minZ },
    max: { x: maxX, y: ROOM_SHELL.floor.y + topHeight + childHeight, z: maxZ },
  };
}

// The centre of a wall placement — on the wall's inner face, so a frame hangs flat against it. Wall grids run at WALL_CELL_SIZE (0.25), the same pitch as the floor's cellSize — see roomShell.
export function wallCellToRoom(
  wall: WallId,
  cell: Cell,
  footprint: Footprint,
): Vec3 {
  const spec = ROOM_SHELL.walls[wall];
  const along = spec.from + (cell.x + footprint.w / 2) * WALL_CELL_SIZE;
  const up = spec.bottom + (cell.y + footprint.d / 2) * WALL_CELL_SIZE;
  return isXWall(wall)
    ? { x: spec.innerFace, y: up, z: along }
    : { x: along, y: up, z: spec.innerFace };
}

// The shell GLB node names a placement's hole covers — what the scene knocks out of the wall. Empty for anything that does not open the wall (floor items, frames). Cells outside the authored window band have no removable node and resolve to null; they are skipped rather than thrown on, so the renderer stays total even mid-drag over an illegal spot — canPlace is what REJECTS such a placement, this only answers what geometry disappears.
export function windowCellNamesFor(placement: GridPlacement, def: PlaceableItemDef): string[] {
  if (placement.surface.kind !== "wall" || !def.opensWall) return [];
  const wall = placement.surface.wall;
  const names: string[] = [];
  for (const cell of cellsFor(placement, def)) {
    const name = windowCellEntityName(wall, cell.x, cell.y);
    if (name) names.push(name);
  }
  return names;
}

// The floor cell containing a point, for turning a picking ray's hit into a cell. Returns the cell the point falls in even when that is off-grid; callers clamp or reject via canPlace.
export function roomPointToFloorCell(point: Pick<Vec3, "x" | "z">): Cell {
  const { cellSize, floor } = ROOM_SHELL;
  return {
    x: Math.floor((point.x - floor.minX) / cellSize),
    y: Math.floor((point.z - floor.minZ) / cellSize),
  };
}

// The wall cell containing a point on (or near) the wall's plane — the wall twin of roomPointToFloorCell, and like it may return an off-grid cell for callers to clamp or reject. x is the cell along the wall's run, y the row above the floor, both at WALL_CELL_SIZE.
export function roomPointToWallCell(wall: WallId, point: Vec3): Cell {
  const spec = ROOM_SHELL.walls[wall];
  const along = isXWall(wall) ? point.z : point.x;
  return {
    x: Math.floor((along - spec.from) / WALL_CELL_SIZE),
    y: Math.floor((point.y - spec.bottom) / WALL_CELL_SIZE),
  };
}

// The anchor cell that centres a footprint on the cell under the finger — what a drag actually wants, since the player is pointing at the middle of the piece, not its min corner.
export function anchorForCentre(centre: Cell, footprint: Footprint): Cell {
  return {
    x: centre.x - Math.floor((footprint.w - 1) / 2),
    y: centre.y - Math.floor((footprint.d - 1) / 2),
  };
}
