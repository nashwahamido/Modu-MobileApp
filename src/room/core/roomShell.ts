// The room's DIMENSIONS, measured from the shell GLB once and frozen here.
// Everything that needs to know where the floor is — the grid, collision, the renderer, picking —
// reads these numbers. Nothing measures the mesh at runtime and nothing carries its own copy: the
// alignment bugs in the old placement code all came from two modules approximating the same plane
// with different constants.
//
// Units are AUTHORED units, i.e. exactly what the GLB (and Blender) says. That makes every number
// here checkable against the source file. Scene space is a pure function of them — see roomToScene.
//
// Provenance: measured from src/assets/models/room/*.glb by walking node transforms over the
// POSITION accessor bounds. Both shells that exist (homepageroom-runtime, virtualroom_empty) are the
// same authored room and agree on every figure below; they differ only in clutter and texturing.
//   Cube.007  floor slab   min [ 0.04, -0.92, -5.39]  size [5.50, 0.14, 5.48]
//   Cube.004  wall (z-max) min [-0.40, -1.00,  0.13]  size [5.94, 4.12, 0.38]
//   Cube      wall (x-min) min [-0.40, -1.00, -5.47]  size [0.38, 4.12, 5.60]
//   Cube.001 / Cube.005    cornices at y 3.11 — the ceiling line
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
  // Authored units per grid cell. 0.5 with a ~5.5 room gives an 11 x 10 floor.
  cellSize: number;
};

export const ROOM_SHELL: RoomShellSpec = {
  bounds: {
    min: { x: -0.44, y: -1.27, z: -5.49 },
    max: { x: 5.65, y: 3.57, z: 0.86 },
  },
  floor: {
    minX: 0.04,
    maxX: 5.54,
    minZ: -5.39,
    maxZ: 0.09,
    // Slab top: base -0.92 plus its 0.14 thickness.
    y: -0.78,
  },
  walls: {
    "x-min": { innerFace: -0.02, from: -5.47, to: 0.13, bottom: -0.78, top: 3.11 },
    "z-max": { innerFace: 0.13, from: -0.40, to: 5.54, bottom: -0.78, top: 3.11 },
  },
  cellSize: 0.5,
};

// How many square cells cover the floor rect, ROUNDED rather than truncated.
// Truncating left the z axis one cell short — 5.48 / 0.5 is 10.96, so ten cells covered 5.00 of 5.48 and the leftover 0.48 showed as a bare strip the full width of the room against the back wall.
// Rounding up costs a 0.02 overhang at maxZ, which lands in the gap between the slab edge (0.095) and the z-max wall's inner face (0.134) and so is never visible. Check that gap again if the shell is re-exported: a remainder near half a cell would push the last row past the wall.
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
