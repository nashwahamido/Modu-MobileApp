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
// This shell replaced the original virtualroom_empty; the floor was scaled at authoring so the
// walkable floor face spans exactly 6.0 on x (5.9988 on z), a clean 12 x 12 grid at cellSize 0.5.
// The shell carries exactly four materials, and their NAMES are load-bearing: the decor system
// retextures Floor and Wall by material name at runtime and tints FloorEdge and Trim to match.
//   Floor      the raised walkable slab: top face y -0.4449, sitting on the plinth below
//   FloorEdge  the plinth (the original slab, down to y -0.9028) plus the exposed border ledge around the raised slab — the ledge is ~0.096 wide on the two open sides and 0.2 below the walkable top
//   Wall       both walls, inner faces at x -1.1062 and z 2.0563, band top y 3.0771; the z-max wall carries the two window openings, jambs included
//   Trim       cornice along both wall tops, y 3.0771..3.35 (overhangs the open edges slightly)
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
  // Authored units per grid cell. 0.5 with the 6.0 floor gives a 12 x 12 floor.
  cellSize: number;
};

export const ROOM_SHELL: RoomShellSpec = {
  bounds: {
    min: { x: -1.4051, y: -0.9028, z: -4.092 },
    max: { x: 5.0432, y: 3.3472, z: 2.3553 },
  },
  floor: {
    // The PLINTH footprint, not the raised slab's: the raised top is inset ~0.096 on the open sides, and anchoring the grid on the plinth keeps both axes at a clean 12 cells. The cost is that a piece flush against an open-side cell edge can cantilever up to ~0.096 over the ledge, which sits 0.2 lower.
    minX: -1.1062,
    maxX: 4.8938,
    minZ: -3.9425,
    maxZ: 2.0563,
    // Top face of the RAISED slab — the walkable plane a piece's base rests on.
    y: -0.4449,
  },
  walls: {
    "x-min": { innerFace: -1.1062, from: -3.9425, to: 2.0563, bottom: -0.4449, top: 3.0771 },
    "z-max": { innerFace: 2.0563, from: -1.1062, to: 4.8938, bottom: -0.4449, top: 3.0771 },
  },
  cellSize: 0.5,
};

// The two authored window openings, cut into the z-max wall at export time. Identical size by design: every window-style GLB is authored to this opening and overlaps its edges by 0.02 per side, so styles are interchangeable without touching the shell. Positions are FIXED — moving a window means rendering its GLB at the other socket and a blank insert at this one, never re-cutting the wall.
export type WindowSocket = {
  wall: WallId;
  // Opening centre in authored units: x along the wall run, y vertical. The insert's origin plane sits on the wall's inner face.
  centre: { x: number; y: number };
  size: { w: number; h: number };
};

export const WINDOW_SOCKETS: readonly WindowSocket[] = [
  { wall: "z-max", centre: { x: 0.5642, y: 1.114 }, size: { w: 1.793, h: 1.696 } },
  { wall: "z-max", centre: { x: 3.1618, y: 1.114 }, size: { w: 1.793, h: 1.696 } },
];

// How many square cells cover the floor rect, ROUNDED rather than truncated.
// Truncating left the old shell's z axis one cell short — ten cells covered 5.00 of a 5.48 floor and the leftover 0.48 showed as a bare strip the full width of the room against the back wall.
// The current shell was authored so this comes out clean: x is exactly 12 cells, z is 5.9988 so twelve cells overhang maxZ by 0.0012 — which is INSIDE the z-max wall, whose inner face sits exactly at the floor edge. Check again if the shell is re-exported: a remainder near half a cell would push the last row past the wall.
export const FLOOR_CELLS = {
  w: Math.round((ROOM_SHELL.floor.maxX - ROOM_SHELL.floor.minX) / ROOM_SHELL.cellSize),
  d: Math.round((ROOM_SHELL.floor.maxZ - ROOM_SHELL.floor.minZ) / ROOM_SHELL.cellSize),
} as const;

export const WALL_CELLS: Record<WallId, { w: number; h: number }> = {
  "x-min": wallCells("x-min"),
  "z-max": wallCells("z-max"),
};

function wallCells(wall: WallId): { w: number; h: number } {
  const spec = ROOM_SHELL.walls[wall];
  return {
    w: Math.floor((spec.to - spec.from) / ROOM_SHELL.cellSize),
    h: Math.floor((spec.top - spec.bottom) / ROOM_SHELL.cellSize),
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
