// The room's DIMENSIONS, measured from the shell GLB once and keep unchanged
export type Vec3 = { x: number; y: number; z: number };

export type ShellWallId = "x-min" | "x-max" | "z-min" | "z-max";

export const SHELL_WALL_IDS: readonly ShellWallId[] = [
  "x-min",
  "x-max",
  "z-min",
  "z-max",
];

// alpha 0 at load
export const CEILING_MATERIAL = "Ceiling";

export type WallId = ShellWallId;

export function isXWall(wall: WallId): boolean {
  return wall === "x-min" || wall === "x-max";
}

// The wall's outward normal: decides which walls the camera stands outside of.
export function wallOutward(wall: WallId): -1 | 1 {
  return wall === "x-min" || wall === "z-min" ? -1 : 1;
}

// The quarter turn that faces a wall-mounted model into the room.
export function wallMountYaw(wall: WallId): number {
  switch (wall) {
    case "z-max":
      return 0;
    case "x-min":
      return -Math.PI / 2;
    case "x-max":
      return Math.PI / 2;
    case "z-min":
      return Math.PI;
  }
}

export type WallSpec = {
  // The room's inner surface
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
  // Authored units (metres) per grid cell. 0.25 with the 4.5 floor gives an 18 x 18 floor.
  cellSize: number;
};

export const ROOM_SHELL: RoomShellSpec = {
  // SCENE_SCALE and SCENE_CENTER follow from these, so every placement moves with them; the GRID does not, being derived from floor.* below.
  // min.y is the plinth's underside and the only number that has moved. That matters because Filament normalizes the SHELL by this AABB while roomToScene normalizes FURNITURE by the constants here — they then disagree by half the drift and every piece floats (~14cm after one past export).
  bounds: {
    min: { x: -1.2415, y: -0.8158, z: -3.3687 },
    max: { x: 4.0821, y: 2.7249, z: 1.954 },
  },
  floor: {
    // The PLINTH footprint, not the raised slab's, which is inset on the open sides — anchoring on the plinth keeps both axes clean. The cost is a slight cantilever over the ledge at an open-side edge.
    minX: -0.8297,
    maxX: 3.6703,
    minZ: -2.9569,
    maxZ: 1.542,
    // Top face of the RAISED slab — the walkable plane a piece's base rests on.
    y: -0.3951,
  },
  // Each pair shares its run exactly, so the four inner faces are precisely the floor rect's edges — which is what keeps the grid unchanged by the walls existing.
  walls: {
    "x-min": {
      innerFace: -0.8297,
      from: -2.9569,
      to: 1.542,
      bottom: -0.3951,
      top: 2.5224,
    },
    "x-max": {
      innerFace: 3.6703,
      from: -2.9569,
      to: 1.542,
      bottom: -0.3951,
      top: 2.5224,
    },
    "z-min": {
      innerFace: -2.9569,
      from: -0.8297,
      to: 3.6703,
      bottom: -0.3951,
      top: 2.5224,
    },
    "z-max": {
      innerFace: 1.542,
      from: -0.8297,
      to: 3.6703,
      bottom: -0.3951,
      top: 2.5224,
    },
  },
  cellSize: 0.25,
};

// Windows are WALL PLACEMENTS, not fixed sockets: each band ships pre-diced into one box per wall cell, and the scene removes exactly the cells a window covers. The neighbours' faces then read as jambs, so removal alone gives a finished opening.
// Everything outside a band is solid wall. Bands run sill 1.0m to head 2.5 with a 0.5 margin at both ends of the run, guaranteeing no window sits flush against a corner.
// Coordinates are WALL-GRID cells: windows share the frames' grid, so plain occupancy keeps them apart. The band bounds only what can become a HOLE — a frame may hang anywhere.
export const WINDOW_BANDS: Record<
  WallId,
  {
    // Wall-grid columns/rows whose cells are removable in the GLB; end-exclusive.
    cols: { from: number; to: number };
    rows: { from: number; to: number };
  }
> = {
  "x-min": { cols: { from: 2, to: 16 }, rows: { from: 4, to: 10 } },
  "x-max": { cols: { from: 2, to: 16 }, rows: { from: 4, to: 10 } },
  "z-min": { cols: { from: 2, to: 16 }, rows: { from: 4, to: 10 } },
  "z-max": { cols: { from: 2, to: 16 }, rows: { from: 4, to: 10 } },
};

// The GLB node name for the removable cell at (col, row), or null where the wall is solid. Indices are BAND-LOCAL, and the wall id drops its dash: WCell_zmax_c03_r1.
// Matched by name via getFirstEntityByName, so this format is part of the shell's authored contract.
export function windowCellEntityName(
  wall: WallId,
  col: number,
  row: number,
): string | null {
  const band = WINDOW_BANDS[wall];
  if (col < band.cols.from || col >= band.cols.to) return null;
  if (row < band.rows.from || row >= band.rows.to) return null;
  return `WCell_${wall.replace("-", "")}_c${String(col - band.cols.from).padStart(2, "0")}_r${row - band.rows.from}`;
}

// How many whole cells fit a run, for EVERY grid in the room — which is the point of it being one function. THE SLACK IS THE IDEA, and it is neither floor() nor round().
// A bare floor() turned the x walls' 1.1mm shortfall against the z walls into a wall one whole column narrower than the one facing it, silently disagreeing with the floor grid.
// round() is no answer either: the wall height is a genuine 11.67 cells, and rounding up hands the player a row 8cm above the wall to hang pictures on.
// So: snap up only when a run falls short by a few millimetres, which is measurement noise, and truncate otherwise, which is a real remainder. A remainder near HALF a cell means the geometry MOVED — re-measure rather than absorb it here.
const CELL_SNAP = 0.005;
function cellsIn(length: number, cell: number): number {
  return Math.floor((length + CELL_SNAP) / cell);
}

export const FLOOR_CELLS = {
  w: cellsIn(
    ROOM_SHELL.floor.maxX - ROOM_SHELL.floor.minX,
    ROOM_SHELL.cellSize,
  ),
  d: cellsIn(
    ROOM_SHELL.floor.maxZ - ROOM_SHELL.floor.minZ,
    ROOM_SHELL.cellSize,
  ),
} as const;

// Wall and floor grids share one 0.25 pitch. Wall items are small and windows want quarter-metre sizing, so frames and windows share this grid and plain occupancy keeps them apart — no cross-grid rounding anywhere.
export const WALL_CELL_SIZE = 0.25;

// The furniture-TOP pitch — half of cellSize, a clean integer division so a host's top extent always lands on WHOLE top cells with no remainder to round away.
// 0.25m was sized for furniture on the FLOOR: at that pitch a paperback claims the same square as a stool. Everything a top surface does reads this constant instead of cellSize.
export const TOP_CELL_SIZE = 0.125;

// The walls' authored thickness, and half a rendering contract: every wall item is authored with its origin on the mounting plane and its back face this far behind it, so the renderer can reconstruct the AABB centre from measured size alone.
export const WALL_THICKNESS = 0.12;

// How far a wall item's CENTRE sits from its anchor on the inner face, along the wall's OUTWARD normal. The unit-cube base erases the authored origin, so depth seating is a renderer policy over measured size, and pure arithmetic — hence here rather than in the transform effect.
// TWO policies, because one rule buries the other:
//   - A HOLE-CUTTER OCCUPIES the wall: front flush with the interior face, body extending back through the opening. Deeper than the wall and the excess pokes out the EXTERIOR, accepted since the diorama is viewed from inside.
//   - Everything else SITS ON the wall like furniture on the floor: back on the interior face, body into the room. The exact analogue of baseOffsetY one axis over.
// The second is not a refinement of the first but its opposite in SIGN, and the miss is total: a 3.6cm painting run through the window rule lands flush against the outer skin, invisible from the room it hangs in.
export function wallDepthOffset(sizeZ: number, opensWall: boolean): number {
  if (!opensWall) return -sizeZ / 2;
  const protrusion = Math.min(sizeZ - WALL_THICKNESS, 0);
  return sizeZ / 2 - protrusion;
}

export const WALL_CELLS: Record<WallId, { w: number; h: number }> = {
  "x-min": wallCells("x-min"),
  "x-max": wallCells("x-max"),
  "z-min": wallCells("z-min"),
  "z-max": wallCells("z-max"),
};

// Through cellsIn, like the floor: the x walls' 1.1mm shortfall must not cost them a column, so their 18th overhangs into the corner where the next wall begins.
// The HEIGHT genuinely does not divide (11.67 cells) and truncates, which keeps a picture from hanging above the wall.
function wallCells(wall: WallId): { w: number; h: number } {
  const spec = ROOM_SHELL.walls[wall];
  return {
    w: cellsIn(spec.to - spec.from, WALL_CELL_SIZE),
    h: cellsIn(spec.top - spec.bottom, WALL_CELL_SIZE),
  };
}

// Filament's own unit-cube normalization, replicated exactly so placements land in the same space as the room they stand in.
// From RNFTransformManagerImpl.cpp: scaling(2 / maxExtent) × translation(-center) — the LARGEST axis sets the scale, not each axis.
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

// Where the orbit looks: the room's centre in scene space. Lens and orbit geometry live in ./orbit, solved against these measurements — framing is solved, never dialled.
export const ROOM_TARGET = { x: 0, y: 0, z: 0 } as const;

// Deliberately NO yaw clamp: the room is enclosed on all four sides and the near walls fade out (./wallCulling), so every azimuth reads as a room and rotation is free.
// ORBIT.homeRadius was re-solved against the four-wall silhouette over the full turn — 9.87 holds at |ndc| 0.913, inside the 0.92 budget.
