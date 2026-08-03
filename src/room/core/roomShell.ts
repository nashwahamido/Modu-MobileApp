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
// The shell carries FIFTEEN materials, and their NAMES are load-bearing twice over: the decor system retextures Floor and the Wall_* group by material name at runtime and tints FloorEdge and the Trim_* group to match, and camera-facing wall culling fades a wall by writing alpha on the material instance its name identifies (see ./wallCulling). scripts/set-shell-blend-modes.mjs holds the authoritative list and FAILS the build if a re-export drops one.
//   Floor        the raised walkable slab: top face y -0.3951, sitting on the plinth below
//   FloorEdge    the plinth (down to y -0.8158) plus the border ledge around the raised slab
//   Wall_<id>    one material per wall, 0.12 m thick (thinned from the authored 0.22 so window jambs read slim; the plinth and cornice still span the original outer skins, reading as a foundation lip and cornice overhang from outside), band top y 2.5224 (2.92 above the floor); the x-min and z-max bands are diced into removable WCell_* nodes, see WINDOW_BANDS below
//   Trim_<id>    one cornice run per wall, y 2.5224..2.72, fading with the wall it caps
// The four walls are ONE material each because gltfio hands out a MaterialInstance per glTF material: a shared 'Wall' would fade all four at once. Each wall's cornice, its share of the band cells, and its corner post all carry the same name, so one alpha write hides the whole wall.
// x-walls run the FULL depth and therefore own all four corner posts; z-walls butt into them. That is what makes a hidden x-wall leave the neighbouring z-wall ending in a clean face — which is what a wall with its neighbour removed actually looks like — instead of tearing a notch out of it.
// Re-run the measurement if the shell is re-exported; a moved wall silently invalidates the grid.

export type Vec3 = { x: number; y: number; z: number };

// All four walls the shell is built from. Named by the plane they occupy rather than by compass point: "north/east" means nothing on a room with no fixed orientation, and these strings persist.
export type ShellWallId = "x-min" | "x-max" | "z-min" | "z-max";

export const SHELL_WALL_IDS: readonly ShellWallId[] = ["x-min", "x-max", "z-min", "z-max"];

// The ceiling's material. It is never drawn — the renderer pins it to alpha 0 at load and leaves it there — and exists only so the SHADOW pass has something overhead to stop the key light falling into the room from above. Without it the room is enclosed on the sides but open to the sky, so sunlight lands on the floor and the walls print their silhouettes across it; with it, the only daylight that gets in comes through window openings, which is both physically right and what makes lamps worth having.
export const CEILING_MATERIAL = "Ceiling";

// All four walls are placement surfaces: each carries a diced window band and a wall grid. This used to be a two-member subset while x-max and z-min were light blockers only.
export type WallId = ShellWallId;

// True for the walls whose PLANE is fixed in x and whose run is along z. Every wall-space conversion is one of two mirror cases, and branching on this keeps the four walls from turning into four-way conditionals scattered across grid, picking, and the renderer.
export function isXWall(wall: WallId): boolean {
  return wall === "x-min" || wall === "x-max";
}

// The wall's outward normal — away from the room. Used to seat a mounted model's depth and to decide which walls the camera is standing outside of.
export function wallOutward(wall: WallId): -1 | 1 {
  return wall === "x-min" || wall === "z-min" ? -1 : 1;
}

// The quarter turn that puts a wall-mounted model's face into the room. Models are authored facing the room with the wall at -z behind them, which is exactly the z-max pose.
export function wallMountYaw(wall: WallId): number {
  switch (wall) {
    case "z-max": return 0;
    case "x-min": return -Math.PI / 2;
    case "x-max": return Math.PI / 2;
    case "z-min": return Math.PI;
  }
}

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
  // Grew on two axes when the x-max and z-min walls were added: their plinth and cornice overhang the new outer faces by the same 0.1042 the original two always did, so the diorama's lip reads identically from every angle. SCENE_SCALE and SCENE_CENTER follow from these numbers, so every placement moves with them — the GRID does not, because it is derived from floor.* below, and the new walls' inner faces sit exactly on the old floor rect.
  // min.y is the plinth's underside, and it is the ONLY number here that has moved since the four-wall shell landed: -0.7773, then -1.0598 on 2026-08-02 when the floor slab was thickened to 0.1519 and the plinth deepened with it, then -0.8158 on 2026-08-03 when the plinth was made 24 cm shallower again. Nothing a player stands on has ever moved with it — floor.y and every wall bottom are untouched — but the AABB is what Filament normalizes the shell by while roomToScene normalizes the FURNITURE by the constants here, so the two disagree by exactly half the drift and every piece floats: the 2026-08-02 export left them ~14 cm high, this one would have left them 12.2 cm high. SCENE_SCALE has survived all three, because the largest extent is x at 5.3236 and only y ever changed.
  bounds: {
    min: { x: -1.2415, y: -0.8158, z: -3.3687 },
    max: { x: 4.0821, y: 2.7249, z: 1.954 },
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
  // The x walls run along z and the z walls run along x; each pair shares its run exactly, so the four inner faces are precisely the floor rect's four edges. That is what keeps the grid unchanged by the walls existing.
  walls: {
    "x-min": { innerFace: -0.8297, from: -2.9569, to: 1.542, bottom: -0.3951, top: 2.5224 },
    "x-max": { innerFace: 3.6703, from: -2.9569, to: 1.542, bottom: -0.3951, top: 2.5224 },
    "z-min": { innerFace: -2.9569, from: -0.8297, to: 3.6703, bottom: -0.3951, top: 2.5224 },
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
  "x-max": { cols: { from: 2, to: 16 }, rows: { from: 4, to: 10 } },
  "z-min": { cols: { from: 2, to: 16 }, rows: { from: 4, to: 10 } },
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
// The current shell was authored so this comes out clean: x is exactly 9 cells (4.5 / 0.5), z is 4.4989 so nine cells overhang maxZ by 0.0011 — which is INSIDE the z-max wall, whose inner face sits exactly at the floor edge. Check again if the shell is re-exported: a remainder near half a cell would push the last row past the wall.
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
  "x-max": wallCells("x-max"),
  "z-min": wallCells("z-min"),
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

// There is deliberately NO yaw clamp here any more. The shell used to have two walls and be open on the other two sides, so only a 90-degree arc read as a room — 45 degrees either way put a wall edge-on and showed the open side straight through it, and MAX_ROOM_YAW existed to stop a drag spinning the room to its missing back. The room is enclosed on all four sides now and the two walls between the camera and the room fade out instead (see ./wallCulling), so every azimuth reads as a room and rotation is free. ORBIT.homeRadius was re-solved against the four-wall silhouette over the full turn: 9.87 holds at |ndc| 0.913, inside the 0.92 budget.
