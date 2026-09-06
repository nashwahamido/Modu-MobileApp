// Grid placement: which cells a piece occupies, and whether it may stand there. Pure data, no Filament or React — the renderer is a function of the layout this validates, never the reverse.
// No physics on purpose: nothing moves under forces, so placement is in-bounds plus non-overlapping, which an occupancy set answers exactly in O(footprint) with no tunnelling or jitter.
import {
  FLOOR_CELLS,
  ROOM_SHELL,
  TOP_CELL_SIZE,
  WALL_CELLS,
  WALL_CELL_SIZE,
  WINDOW_BANDS,
  isXWall,
  wallDepthOffset,
  wallOutward,
  windowCellEntityName,
  type Vec3,
  type WallId,
} from "./roomShell";

export type SurfaceKind = "floor" | "wall" | "furniture";

// Which grid a placement lives on. Each surface is an INDEPENDENT 2D grid, so collision never reasons across surfaces.
export type SurfaceId =
  | { kind: "floor" }
  | { kind: "wall"; wall: WallId }
  | { kind: "furniture"; hostInstanceId: string; slot: string };

export type Cell = { x: number; y: number };

// Quarter turns. Floor items rotate; wall items face out of their wall and ignore this.
export type RotSteps = 0 | 1 | 2 | 3;

// Cells, at rotSteps 0. Rotating by an odd number of steps swaps the two.
export type Footprint = { w: number; d: number };

// The per-item metadata the grid needs. Identity, names and variations come from the catalog; this is only what placement has to know.
export type PlaceableItemDef = {
  itemId: string;
  footprint: Footprint;
  // The footprint on a FURNITURE TOP, at TOP_CELL_SIZE — derived from the measured SIZE at that pitch, never by scaling `footprint`, which is already ceil'd at the coarser pitch and would compound the rounding.
  // Every def carries one so none is ever missing the field a furniture-surface caller needs; wall items just never have it read.
  topFootprint: Footprint;
  allowedSurfaces: SurfaceKind[];
  // Wall items: how far up the wall the piece extends, in cells.
  wallHeightCells?: number;
  // Windows: the footprint is a HOLE and the scene knocks those shell cells out. Frames hang on the wall and leave it intact.
  opensWall?: boolean;
  // The renderer hangs a light over this piece and moves it with it. Purely a rendering concern: placement, collision and persistence treat it as ordinary furniture.
  emitsLight?: boolean;
  // Which cells of the w×d footprint are solid at rotSteps 0: d rows of w chars, 'X' solid, row 0 the -y edge. Absent = solid rectangle.
  // Read on the FLOOR as this item's silhouette, and on its TOP when it hosts — a top cannot exist where the piece does not, so an L-shaped desk must not offer its bounding rectangle. Never read on a wall.
  mask?: readonly string[];
  // This item exposes its top as a placement surface: tables and cabinets host, sofas and beds do not.
  // The top grid is its own unrotated footprint scaled to TOP_CELL_SIZE (hostTopExtent), gated by its mask read UNROTATED, since child cells there are already host-frame.
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
  // Mirrors PlacedFurniture.lightOn: undefined means ON, so only a switched-off lamp carries it. Nothing here reads it; it rides along so toGrid/fromGrid round-trips.
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

// A stable string per surface, so occupancy can be a flat map: two walls are two grids, and two host cabinets are two more.
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

// The grid's extent in cells. A furniture surface's is HOST-DEPENDENT and checked in canPlace instead, so this context-free answer stays 0×0 — callers without a layout reject rather than silently accept.
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

// TOP_CELL_SIZE divides cellSize cleanly, so this is always whole (2 today) and a host's floor footprint always scales to whole top cells.
const TOP_SUBDIVISION = ROOM_SHELL.cellSize / TOP_CELL_SIZE;

// A host's top extent in TOP_CELL_SIZE cells: its UNROTATED floor footprint scaled by TOP_SUBDIVISION.
// Unrotated because the top grid is host-frame — rotation is applied once on the way out to room space, never to the grid.
export function hostTopExtent(hostDef: PlaceableItemDef): Footprint {
  return { w: hostDef.footprint.w * TOP_SUBDIVISION, d: hostDef.footprint.d * TOP_SUBDIVISION };
}

// The mask as rotated — the grid twin of the renderer's yaw, mapping (dx, dy) to (dy, w-1-dx) per step. Stepwise, so one derivation covers all four turns.
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

// The footprint a placement occupies on its own surface. A wall grid's second axis is vertical, so wall items use wallHeightCells; a furniture surface uses topFootprint, never `footprint` scaled.
export function occupiedFootprint(
  placement: GridPlacement,
  def: PlaceableItemDef,
): Footprint {
  if (placement.surface.kind === "wall") {
    return { w: def.footprint.w, d: def.wallHeightCells ?? def.footprint.d };
  }
  if (placement.surface.kind === "furniture") {
    return rotatedFootprint(def.topFootprint, placement.rotSteps);
  }
  return rotatedFootprint(def.footprint, placement.rotSteps);
}

// Every cell a placement covers, anchor included.
export function cellsFor(placement: GridPlacement, def: PlaceableItemDef): Cell[] {
  const { w, d } = occupiedFootprint(placement, def);
  // Rotated because a floor placement's cells are ROOM-space while the mask is authored at rotSteps 0. canPlace reads the HOST's mask unrotated instead — same data, two frames, and conflating them turns it twice.
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

// surfaceKey → the cells taken on it. Derived, never stored: a persisted occupancy map is one more thing that can disagree with the placements it describes.
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

// The resolved host a furniture-surface check needs, so canPlace itself stays layout-free.
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

// Can this placement stand here? Runs every drag frame, so it stays allocation-light and returns a reason code — the UI owns the wording.
export function canPlace(
  placement: GridPlacement,
  def: PlaceableItemDef | undefined,
  occupancy: Occupancy,
  host?: HostContext | null,
): PlacementCheck {
  if (!def) return { ok: false, reason: "unknown-item" };
  // Checked against the placement's OWN surface kind, no remapping: treating a furniture-top placement as floor made every floor item stackable regardless of its onTop flag.
  if (!def.allowedSurfaces.includes(placement.surface.kind)) {
    return { ok: false, reason: "surface-not-allowed" };
  }

  if (placement.surface.kind === "furniture") {
    // Host must exist, stand on the FLOOR (a stacked host is not on the floor, so depth > 1 dies here), and be flagged to host.
    if (!host || host.placement.surface.kind !== "floor" || !host.def.hostsTop) {
      return { ok: false, reason: "no-host" };
    }
    // The top grid is the host's UNROTATED footprint scaled to TOP_CELL_SIZE (hostTopExtent): child cells are host-frame at the finer pitch, so host rotation is invisible here.
    const top = hostTopExtent(host.def);
    const { w, d } = occupiedFootprint(placement, def);
    if (placement.cell.x < 0 || placement.cell.y < 0 || placement.cell.x + w > top.w || placement.cell.y + d > top.d) {
      return { ok: false, reason: "out-of-bounds" };
    }
    // The mask gates the top too: a top cannot exist where the host does not, or an L-shaped desk offers its bounding rectangle and a book sits in mid-air over the notch.
    // Read UNROTATED, unlike the floor check — child cells are already host-frame, so rotating would turn it twice. TOP_CELL_SIZE divides cellSize evenly, so a child cell maps to exactly one mask cell.
    if (host.def.mask) {
      const per = Math.round(ROOM_SHELL.cellSize / TOP_CELL_SIZE);
      for (const cell of cellsFor(placement, def)) {
        if (host.def.mask[Math.floor(cell.y / per)]?.[Math.floor(cell.x / per)] !== "X") {
          return { ok: false, reason: "out-of-bounds" };
        }
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

  // A hole only opens where the shell has removable cells, so the whole footprint must sit in the window band. Outside it the wall is structural: in-bounds for a FRAME, out for a window.
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

// Clamp an anchor so the piece stays fully on its surface: the drag snaps to the nearest legal cell rather than refusing to move, keeping the ghost under the finger at the room's edges.
export function clampToSurface(
  cell: Cell,
  surface: SurfaceId,
  footprint: Footprint,
  // The host's TOP EXTENT for a furniture surface, NOT its floor footprint. Absent, the clamp collapses to (0,0) — surfaceExtent's own conservative answer.
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

// The CENTRE of a floor placement in authored room units, base on the floor. Authored units so it can be checked against the GLB by eye; callers hand the result to roomToScene.
export function floorCellToRoom(cell: Cell, footprint: Footprint): Vec3 {
  const { cellSize, floor } = ROOM_SHELL;
  return {
    x: floor.minX + (cell.x + footprint.w / 2) * cellSize,
    y: floor.y,
    z: floor.minZ + (cell.y + footprint.d / 2) * cellSize,
  };
}

// The VOLUME a floor placement occupies: its claimed cells, floor up to the rendered height. This is what a finger points at — tested against the floor PLANE instead, a ray answers with the cell BEHIND the piece, one per 20cm of model height.
// Height is measured size.y × fitScale, passed in so this module stays free of the catalog.
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

// The CENTRE of a stacked placement, base on the host's top. Child cells are HOST-LOCAL at TOP_CELL_SIZE, and the host's yaw turns the offset with the same rotation the renderer applies, so grid and model cannot disagree.
// Centring uses the host's TOP EXTENT, not its floor footprint: the two are proportional but only the extent is in the same units as `cell`.
export function topCellToRoom(
  host: HostContext,
  cell: Cell,
  childFootprint: Footprint,
  topHeight: number,
): Vec3 {
  const hostCentre = floorCellToRoom(
    host.placement.cell,
    rotatedFootprint(host.def.footprint, host.placement.rotSteps),
  );
  const top = hostTopExtent(host.def);
  const lx = (cell.x + childFootprint.w / 2 - top.w / 2) * TOP_CELL_SIZE;
  const lz = (cell.y + childFootprint.d / 2 - top.d / 2) * TOP_CELL_SIZE;
  const spin = (host.placement.rotSteps * Math.PI) / 2;
  const cos = Math.cos(spin);
  const sin = Math.sin(spin);
  return {
    x: hostCentre.x + lx * cos + lz * sin,
    y: ROOM_SHELL.floor.y + topHeight,
    z: hostCentre.z - lx * sin + lz * cos,
  };
}

// The inverse: a room point back into the host-frame cell it falls in. May be off-grid, so callers run it through anchor/clamp/canPlace like any pick.
// Must stay an EXACT inverse of topCellToRoom (grid.test.ts pins the round trip), or a book renders off the edge of the desk it validated onto.
export function roomPointToTopCell(host: HostContext, point: Pick<Vec3, "x" | "z">): Cell {
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
  const top = hostTopExtent(host.def);
  return {
    x: Math.floor(lx / TOP_CELL_SIZE + top.w / 2),
    y: Math.floor(lz / TOP_CELL_SIZE + top.d / 2),
  };
}

// The pickable VOLUME of a stacked child: its host-local rect in world space, host's top up the child's height. Four corners then min/max — an axis-aligned cover of the rotated rect is plenty for a finger.
export function topPlacementBox(
  host: HostContext,
  placement: GridPlacement,
  def: PlaceableItemDef,
  topHeight: number,
  childHeight: number,
): { min: Vec3; max: Vec3 } {
  const { w, d } = occupiedFootprint(placement, def);
  const hostCentre = floorCellToRoom(
    host.placement.cell,
    rotatedFootprint(host.def.footprint, host.placement.rotSteps),
  );
  const top = hostTopExtent(host.def);
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
    const lx = (cx - top.w / 2) * TOP_CELL_SIZE;
    const lz = (cy - top.d / 2) * TOP_CELL_SIZE;
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

// The pickable VOLUME of a wall placement: its cells across the wall's run and up its height, and along the OUTWARD normal the item's true depth, centred where wallDepthOffset seats it.
// Tested against the wall's inner-face PLANE instead, only a zero-depth item is right — a real face sits sizeZ from that plane, so pressing the visible body missed the wall grid's one thin cell.
// sizeZ is measured size.z at fitScale, matching floorPlacementBox's height contract. Wall items always have fitScale 1, but that exemption is not assumed here.
export function wallPlacementBox(
  wall: WallId,
  placement: GridPlacement,
  def: PlaceableItemDef,
  sizeZ: number,
): { min: Vec3; max: Vec3 } {
  const spec = ROOM_SHELL.walls[wall];
  const { w, d } = occupiedFootprint(placement, def);
  const alongMin = spec.from + placement.cell.x * WALL_CELL_SIZE;
  const alongMax = alongMin + w * WALL_CELL_SIZE;
  const upMin = spec.bottom + placement.cell.y * WALL_CELL_SIZE;
  const upMax = upMin + d * WALL_CELL_SIZE;
  // The centre sits at innerFace + outward × offset, and the box spans centre ± sizeZ/2 on that axis. outward may be -1 or +1, so the endpoints are sorted rather than assumed ordered.
  const outward = wallOutward(wall);
  const centreOffset = wallDepthOffset(sizeZ, def.opensWall === true);
  const normalA = spec.innerFace + outward * (centreOffset - sizeZ / 2);
  const normalB = spec.innerFace + outward * (centreOffset + sizeZ / 2);
  const normalMin = Math.min(normalA, normalB);
  const normalMax = Math.max(normalA, normalB);
  return isXWall(wall)
    ? {
        min: { x: normalMin, y: upMin, z: alongMin },
        max: { x: normalMax, y: upMax, z: alongMax },
      }
    : {
        min: { x: alongMin, y: upMin, z: normalMin },
        max: { x: alongMax, y: upMax, z: normalMax },
      };
}

// The centre of a wall placement, on the inner face so a frame hangs flat. Wall grids run at WALL_CELL_SIZE, the same pitch as the floor's cellSize.
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

// The shell GLB nodes a placement's hole covers. Empty for anything that does not open the wall.
// Cells outside the window band have no removable node and are skipped rather than thrown on, so the renderer stays total mid-drag over an illegal spot — canPlace is what rejects it, this only says what disappears.
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

// The floor cell containing a point, for turning a ray hit into a cell. May be off-grid; callers clamp or reject via canPlace.
export function roomPointToFloorCell(point: Pick<Vec3, "x" | "z">): Cell {
  const { cellSize, floor } = ROOM_SHELL;
  return {
    x: Math.floor((point.x - floor.minX) / cellSize),
    y: Math.floor((point.z - floor.minZ) / cellSize),
  };
}

// The wall twin of roomPointToFloorCell, and like it may answer off-grid. x is the cell along the wall's run, y the row above the floor, both at WALL_CELL_SIZE.
export function roomPointToWallCell(wall: WallId, point: Vec3): Cell {
  const spec = ROOM_SHELL.walls[wall];
  const along = isXWall(wall) ? point.z : point.x;
  return {
    x: Math.floor((along - spec.from) / WALL_CELL_SIZE),
    y: Math.floor((point.y - spec.bottom) / WALL_CELL_SIZE),
  };
}

// The anchor that centres a footprint on the cell under the finger — what a drag wants, since the player points at the middle of the piece, not its min corner.
export function anchorForCentre(centre: Cell, footprint: Footprint): Cell {
  return {
    x: centre.x - Math.floor((footprint.w - 1) / 2),
    y: centre.y - Math.floor((footprint.d - 1) / 2),
  };
}
