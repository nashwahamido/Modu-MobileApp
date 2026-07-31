// The room's DIMENSIONS, measured from the shell GLB once and frozen here.
// Everything that needs to know where the floor is — the grid, collision, the renderer, picking —
// reads these numbers. Nothing measures the mesh at runtime and nothing carries its own copy: the
// alignment bugs in the old placement code all came from two modules approximating the same plane
// with different constants.
//
// Units are AUTHORED units, i.e. exactly what the GLB (and Blender) says. That makes every number
// here checkable against the source file. Scene space is a pure function of them — see roomToScene.
//
// Provenance: measured 2026-07-29 from the "room" object of print_room.blend at export time (the
// same numbers were re-read from the GLB's POSITION accessor bounds + node translation as a check).
// Authored units are REAL METRES — the shell was rescaled against real-size furniture (a 1.43 x 1.95
// double bed, a 0.75-high desk), landing on a 4.5 x 4.5 m floor with 2.92 m walls: a believable room
// where a bed reads as bed-sized. The grid is a clean 9 x 9 at cellSize 0.5.
// The shell carries exactly four materials, and their NAMES are load-bearing: the decor system
// retextures Floor and Wall by material name at runtime and tints FloorEdge and Trim to match.
//   Floor      the raised walkable slab: top face y -0.3951, sitting on the plinth below
//   FloorEdge  the plinth (down to y -0.6771) plus the exposed border ledge around the raised slab on the two open sides
//   Wall       both walls, 0.12 m thick (thinned from the authored 0.22 so window jambs read slim; the plinth and cornice still span the original outer skins, reading as a foundation lip and cornice overhang from outside), inner faces at x -0.8297 and z 1.542, band top y 2.5224 (2.92 above the floor); both walls' window bands are diced into removable WCell_* nodes, see WINDOW_BANDS below
//   Trim       cornice along both wall tops, y 2.5224..2.72 (overhangs the open edges slightly)
// Re-run the measurement if the shell is re-exported; a moved wall silently invalidates the grid.

export type Vec3 = { x: number; y: number; z: number };

// The two walls the diorama actually shows. Named by the plane they occupy rather than by compass
// point: "north/east" means nothing on a room with no fixed orientation, and these strings persist.
// UI copy calls them the left wall (x-min) and the back wall (z-max).
export type WallId = "x-min" | "z-max";

export type WallSpec = {
  // The face the player places against — the inner surface, not the wall's outer skin.
  innerFace: number;
  // The wall's horizontal run along its own axis: z for x-min, x for z-max.
  from: number;
  to: number;
  // Vertical extent of the placeable band, floor surface upward.
  bottom: number;
  top: number;
};

export type RoomShellSpec = {
  // The whole-model AABB in authored units, as Filament computes it for transformToUnitCube.
  bounds: { min: Vec3; max: Vec3 };
  floor: {
    // The inner rect a piece may stand on, inset to the walls' inner faces.
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    // Top surface of the floor slab — where a piece's base rests.
    y: number;
  };
  walls: Record<WallId, WallSpec>;
  // Authored units (metres) per grid cell. 0.5 with the 4.5 floor gives a 9 x 9 floor.
  cellSize: number;
};

export const ROOM_SHELL: RoomShellSpec = {
  bounds: {
    min: { x: -1.0539, y: -0.6771, z: -3.069 },
    max: { x: 3.7824, y: 2.7249, z: 1.7664 },
  },
  floor: {
    // The PLINTH footprint, not the raised slab's: the raised top is inset on the open sides, and anchoring the grid on the plinth keeps both axes at a clean 9 cells. The cost is that a piece flush against an open-side cell edge can cantilever slightly over the ledge, which sits below the walkable top.
    minX: -0.8297,
    maxX: 3.6703,
    minZ: -2.9569,
    maxZ: 1.542,
    // Top face of the RAISED slab — the walkable plane a piece's base rests on.
    y: -0.3951,
  },
  walls: {
    "x-min": { innerFace: -0.8297, from: -2.9569, to: 1.542, bottom: -0.3951, top: 2.5224 },
    "z-max": { innerFace: 1.542, from: -0.8297, to: 3.6703, bottom: -0.3951, top: 2.5224 },
  },
  cellSize: 0.5,
};

// Windows are WALL PLACEMENTS, not fixed sockets: the z-max wall's window band ships in the shell GLB pre-diced into one solid box per wall-grid cell, and the scene knocks out exactly the cells a placed window covers (scene.removeEntity on the named node). The neighbouring boxes' faces then read as the jambs, so removal alone produces a finished opening. Everything outside the band is solid wall and can never hold a window.
// Each wall's band runs from sill 1.0 m above the floor (real furniture height) to head 2.5, with a solid 0.5 margin at both ends of the run — a structural guarantee that no window can sit flush against the corner or a wall's open end (on x-min the corner-side margin is the grid's natural remainder plus authored fill).
// Coordinates below are WALL-GRID cells (WALL_CELL_SIZE, 0.25): windows are ordinary wall placements on the same grid as photo frames, so plain occupancy keeps them apart. The band bounds what can become a HOLE: a window's footprint must lie inside them, while a frame may hang anywhere on the wall. Window sizes step by 0.25 in both axes — a 1.0 x 1.31 sash covers a 4 x 5-cell hole and its frame overlaps the remainder.
export const WINDOW_BANDS: Record<WallId, {
  // Wall-grid columns/rows whose cells are removable in the GLB; end-exclusive.
  cols: { from: number; to: number };
  rows: { from: number; to: number };
}> = {
  "x-min": { cols: { from: 2, to: 16 }, rows: { from: 4, to: 10 } },
  "z-max": { cols: { from: 2, to: 16 }, rows: { from: 4, to: 10 } },
};

// The GLB node name for the removable cell at wall-grid (col, row), or null where the wall is
// solid. The name's indices are band-local (c00 is the band's first column, not the wall's).
// Matching is by NAME via asset.getFirstEntityByName, so this string format is part of the shell's
// authored contract. The wall id is embedded without its dash: WCell_zmax_c03_r1.
export function windowCellEntityName(wall: WallId, col: number, row: number): string | null {
  const band = WINDOW_BANDS[wall];
  if (col < band.cols.from || col >= band.cols.to) return null;
  if (row < band.rows.from || row >= band.rows.to) return null;
  return `WCell_${wall.replace("-", "")}_c${String(col - band.cols.from).padStart(2, "0")}_r${row - band.rows.from}`;
}

// How many square cells cover the floor rect, ROUNDED rather than truncated.
// Truncating left the old shell's z axis one cell short — ten cells covered 5.00 of a 5.48 floor and the leftover 0.48 showed as a bare strip the full width of the room against the back wall.
// The current shell was authored so this comes out clean: x is exactly 12 cells, z is 5.9988 so twelve cells overhang maxZ by 0.0012 — which is INSIDE the z-max wall, whose inner face sits exactly at the floor edge. Check again if the shell is re-exported: a remainder near half a cell would push the last row past the wall.
export const FLOOR_CELLS = {
  w: Math.round((ROOM_SHELL.floor.maxX - ROOM_SHELL.floor.minX) / ROOM_SHELL.cellSize),
  d: Math.round((ROOM_SHELL.floor.maxZ - ROOM_SHELL.floor.minZ) / ROOM_SHELL.cellSize),
} as const;

// Wall grids are FINER than the floor grid: 0.25 per cell against the floor's 0.5. Wall items are
// small (frames, shelves, windows) and windows want quarter-metre sizing, so frames and windows
// share this one fine grid and plain occupancy keeps them apart — no cross-grid rounding anywhere.
export const WALL_CELL_SIZE = 0.25;

// The walls' authored thickness — HALF a rendering contract: every wall item's GLB is authored
// with its origin on the mounting plane and its back face exactly this far behind it (the
// anchor-empty convention, enforced by scripts/fix_window_anchors.py), so the renderer can
// reconstruct the model's AABB centre from its measured size alone. Re-measure on re-export.
export const WALL_THICKNESS = 0.12;

export const WALL_CELLS: Record<WallId, { w: number; h: number }> = {
  "x-min": wallCells("x-min"),
  "z-max": wallCells("z-max"),
};

function wallCells(wall: WallId): { w: number; h: number } {
  const spec = ROOM_SHELL.walls[wall];
  return {
    w: Math.floor((spec.to - spec.from) / WALL_CELL_SIZE),
    h: Math.floor((spec.top - spec.bottom) / WALL_CELL_SIZE),
  };
}

// The unit-cube normalization Filament applies to the shell, replicated exactly so placements land
// in the same space as the room they stand in. From RNFTransformManagerImpl.cpp:139 —
// scaling(2 / maxExtent) * translation(-center), i.e. centred on the origin and scaled so the
// model's LARGEST axis spans 2 units. Note the largest axis is what sets the scale, not each axis.
export const SCENE_CENTER: Vec3 = {
  x: (ROOM_SHELL.bounds.min.x + ROOM_SHELL.bounds.max.x) / 2,
  y: (ROOM_SHELL.bounds.min.y + ROOM_SHELL.bounds.max.y) / 2,
  z: (ROOM_SHELL.bounds.min.z + ROOM_SHELL.bounds.max.z) / 2,
};

export const SCENE_SCALE =
  2 /
  Math.max(
    ROOM_SHELL.bounds.max.x - ROOM_SHELL.bounds.min.x,
    ROOM_SHELL.bounds.max.y - ROOM_SHELL.bounds.min.y,
    ROOM_SHELL.bounds.max.z - ROOM_SHELL.bounds.min.z,
  );

// Authored units -> the scene space the shell entity lives in after transformToUnitCube.
export function roomToScene(point: Vec3): Vec3 {
  return {
    x: (point.x - SCENE_CENTER.x) * SCENE_SCALE,
    y: (point.y - SCENE_CENTER.y) * SCENE_SCALE,
    z: (point.z - SCENE_CENTER.z) * SCENE_SCALE,
  };
}

// Scene space back to authored units — the direction picking needs once a ray hits a plane.
export function sceneToRoom(point: Vec3): Vec3 {
  return {
    x: point.x / SCENE_SCALE + SCENE_CENTER.x,
    y: point.y / SCENE_SCALE + SCENE_CENTER.y,
    z: point.z / SCENE_SCALE + SCENE_CENTER.z,
  };
}


// Where the orbit looks: the room's centre in scene space (the shell is unit-cube centred on the
// origin). Lens and orbit geometry live in ./orbit — solved against these shell measurements.
// History worth keeping: the original camera sat at distance 2.30 with a 32 mm lens, which put the
// shell at |ndc| 2.4 vertically — the room was over twice the viewport's height and had its floor
// and ceiling cut off at every aspect ratio. Framing has been solved, not dialled, ever since.
export const ROOM_TARGET = { x: 0, y: 0, z: 0 } as const;

// How far the room may be turned from its resting angle.
//
// The shell is a diorama: it has exactly two walls, at x-min and z-max, and is open on the other
// two sides. The camera rests on the bisector of that open corner, so there is only a 90-degree arc
// over which the room reads as a room — 45 degrees either way puts a wall edge-on and shows the
// open side straight through it. Unbounded rotation is what let a drag spin the room to its
// missing back and look like the scene had been cut away.
export const MAX_ROOM_YAW = Math.PI / 4;

export function clampRoomYaw(yaw: number): number {
  return Math.max(-MAX_ROOM_YAW, Math.min(MAX_ROOM_YAW, yaw));
}
