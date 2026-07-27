export type PlacementPoint = { x: number; y: number };
export type NormalizedPlacementPoint = { x: number; y: number };
export type FurnitureFootprint = { width: number; depth: number };
export type PlacementObstacle = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};
export type RoomPlacementMetadata = {
  floor: NormalizedPlacementPoint[];
  staticObstacles: PlacementObstacle[];
};

export type RoomFloorPoint = {
  x: number;
  y: number;
  z: number;
};

export type ProjectedRoomFloor = readonly [
  PlacementPoint,
  PlacementPoint,
  PlacementPoint,
  PlacementPoint,
];

export type ProjectedFurnitureBounds = {
  // Screen projection of the furniture's base center on the room floor.
  // Dragging must use this point rather than the model's visual center,
  // because only the base center lies on the projected floor plane.
  floorAnchor: PlacementPoint;
  center: PlacementPoint;
  bounds: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
};

export const DEFAULT_FURNITURE_FOOTPRINT: FurnitureFootprint = {
  width: 0.12,
  depth: 0.07,
};

// Legacy screen-space metadata. Keep it temporarily for callers that have not
// migrated to the projected floor APIs below. New placement code must not use
// this fixed trapezoid because it does not follow room rotation or zoom.
export const EMPTY_ROOM_PLACEMENT: RoomPlacementMetadata = {
  floor: [
    { x: 0.27, y: 0.42 },
    { x: 0.73, y: 0.42 },
    { x: 0.84, y: 0.89 },
    { x: 0.17, y: 0.89 },
  ],
  staticObstacles: [],
};

// The floor plane used by virtualroom_empty.glb after its unit-cube transform.
export const ROOM_FLOOR = {
  width: 0.9,
  depth: 0.9,
  surfaceY: -0.5,
} as const;

function pointInPolygon(
  point: NormalizedPlacementPoint,
  polygon: NormalizedPlacementPoint[],
) {
  let inside = false;

  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index, index += 1
  ) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const crossesRay = currentPoint.y > point.y !== previousPoint.y > point.y;

    if (
      crossesRay &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x
    ) {
      inside = !inside;
    }
  }

  return inside;
}

export function normalizePlacementPoint(
  point: PlacementPoint,
  width: number,
  height: number,
): NormalizedPlacementPoint {
  return { x: point.x / width, y: point.y / height };
}

export function denormalizePlacementPoint(
  point: NormalizedPlacementPoint,
  width: number,
  height: number,
): PlacementPoint {
  return { x: point.x * width, y: point.y * height };
}

// Legacy screen-normalized conversion. New code should use
// getRoomFloorPointFromNormalizedFloor instead.
export function getRoomFloorPoint(
  point: NormalizedPlacementPoint,
  furnitureHeight: number,
): RoomFloorPoint {
  return {
    x: (point.x - 0.5) * ROOM_FLOOR.width,
    y: ROOM_FLOOR.surfaceY + furnitureHeight / 2,
    z: (point.y - 0.62) * ROOM_FLOOR.depth,
  };
}

// The normalized floor coordinate system is independent of the screen:
// x=0..1 maps left-to-right in room space, and y=0..1 maps back-to-front.
export function getRoomFloorPointFromNormalizedFloor(
  point: NormalizedPlacementPoint,
  furnitureHeight: number,
): RoomFloorPoint {
  return {
    x: (point.x - 0.5) * ROOM_FLOOR.width,
    y: ROOM_FLOOR.surfaceY + furnitureHeight / 2,
    z: (0.5 - point.y) * ROOM_FLOOR.depth,
  };
}

export function getRoomFloorCorners(): readonly [
  RoomFloorPoint,
  RoomFloorPoint,
  RoomFloorPoint,
  RoomFloorPoint,
] {
  const halfWidth = ROOM_FLOOR.width / 2;
  const halfDepth = ROOM_FLOOR.depth / 2;
  const y = ROOM_FLOOR.surfaceY;

  // Corresponds to normalized floor coordinates:
  // [0,0], [1,0], [1,1], [0,1].
  return [
    { x: -halfWidth, y, z: halfDepth },
    { x: halfWidth, y, z: halfDepth },
    { x: halfWidth, y, z: -halfDepth },
    { x: -halfWidth, y, z: -halfDepth },
  ];
}

export function getPlacementPerspectiveScale(pointY: number, height: number) {
  const nearScale = 0.55;
  const farScale = 1.18;
  const progress = (pointY - height * 0.25) / (height * 0.47);
  return Math.max(
    nearScale,
    Math.min(farScale, nearScale + progress * (farScale - nearScale)),
  );
}

// Legacy screen-space collision API. Retained so unrelated callers do not
// immediately break while RoomExperience migrates to normalized floor space.
export function getPlacementIssue(
  point: PlacementPoint,
  width: number,
  height: number,
  scale: number,
  footprint: FurnitureFootprint,
  occupiedAreas: readonly PlacementObstacle[] = [],
) {
  const normalized = normalizePlacementPoint(point, width, height);
  const halfWidth = (footprint.width * scale) / 2;
  const halfDepth = (footprint.depth * scale) / 2;
  const furnitureBounds = {
    left: normalized.x - halfWidth,
    right: normalized.x + halfWidth,
    top: normalized.y - halfDepth,
    bottom: normalized.y + halfDepth,
  };
  const corners = [
    { x: furnitureBounds.left, y: furnitureBounds.top },
    { x: furnitureBounds.right, y: furnitureBounds.top },
    { x: furnitureBounds.right, y: furnitureBounds.bottom },
    { x: furnitureBounds.left, y: furnitureBounds.bottom },
  ];

  if (
    !corners.every((corner) =>
      pointInPolygon(corner, EMPTY_ROOM_PLACEMENT.floor),
    )
  ) {
    return "Keep the furniture on the room floor.";
  }

  const overlapsFurniture = [
    ...EMPTY_ROOM_PLACEMENT.staticObstacles,
    ...occupiedAreas,
  ].some(
    (obstacle) =>
      furnitureBounds.left < obstacle.right &&
      furnitureBounds.right > obstacle.left &&
      furnitureBounds.top < obstacle.bottom &&
      furnitureBounds.bottom > obstacle.top,
  );

  return overlapsFurniture ? "That spot is occupied. Try another place." : null;
}

export function getNormalizedFloorPlacementIssue(
  point: NormalizedPlacementPoint,
  footprint: FurnitureFootprint,
  occupiedAreas: readonly PlacementObstacle[] = [],
) {
  const halfWidth = footprint.width / 2;
  const halfDepth = footprint.depth / 2;
  const furnitureBounds = {
    left: point.x - halfWidth,
    right: point.x + halfWidth,
    top: point.y - halfDepth,
    bottom: point.y + halfDepth,
  };

  if (
    furnitureBounds.left < 0 ||
    furnitureBounds.right > 1 ||
    furnitureBounds.top < 0 ||
    furnitureBounds.bottom > 1
  ) {
    return "Keep the furniture on the room floor.";
  }

  const overlapsFurniture = occupiedAreas.some(
    (obstacle) =>
      furnitureBounds.left < obstacle.right &&
      furnitureBounds.right > obstacle.left &&
      furnitureBounds.top < obstacle.bottom &&
      furnitureBounds.bottom > obstacle.top,
  );

  return overlapsFurniture ? "That spot is occupied. Try another place." : null;
}

function squareToQuadMatrix(quad: ProjectedRoomFloor) {
  const [p0, p1, p2, p3] = quad;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;

  let g = 0;
  let h = 0;

  if (Math.abs(dx3) > 1e-8 || Math.abs(dy3) > 1e-8) {
    const denominator = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(denominator) < 1e-8) return null;

    g = (dx3 * dy2 - dx2 * dy3) / denominator;
    h = (dx1 * dy3 - dx3 * dy1) / denominator;
  }

  return [
    p1.x - p0.x + g * p1.x,
    p3.x - p0.x + h * p3.x,
    p0.x,
    p1.y - p0.y + g * p1.y,
    p3.y - p0.y + h * p3.y,
    p0.y,
    g,
    h,
    1,
  ] as const;
}

function invertMat3(matrix: readonly number[]) {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const determinant =
    a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);

  if (Math.abs(determinant) < 1e-10) return null;
  const inverseDeterminant = 1 / determinant;

  return [
    (e * i - f * h) * inverseDeterminant,
    (c * h - b * i) * inverseDeterminant,
    (b * f - c * e) * inverseDeterminant,
    (f * g - d * i) * inverseDeterminant,
    (a * i - c * g) * inverseDeterminant,
    (c * d - a * f) * inverseDeterminant,
    (d * h - e * g) * inverseDeterminant,
    (b * g - a * h) * inverseDeterminant,
    (a * e - b * d) * inverseDeterminant,
  ] as const;
}

export function screenPointToNormalizedFloor(
  point: PlacementPoint,
  projectedFloor: ProjectedRoomFloor,
): NormalizedPlacementPoint | null {
  const floorToScreen = squareToQuadMatrix(projectedFloor);
  if (!floorToScreen) return null;

  const screenToFloor = invertMat3(floorToScreen);
  if (!screenToFloor) return null;

  const x =
    screenToFloor[0] * point.x + screenToFloor[1] * point.y + screenToFloor[2];
  const y =
    screenToFloor[3] * point.x + screenToFloor[4] * point.y + screenToFloor[5];
  const w =
    screenToFloor[6] * point.x + screenToFloor[7] * point.y + screenToFloor[8];

  if (Math.abs(w) < 1e-10) return null;
  return { x: x / w, y: y / w };
}

export function transformPointByMat4(
  matrix: readonly number[],
  point: RoomFloorPoint,
): RoomFloorPoint {
  const x = point.x;
  const y = point.y;
  const z = point.z;
  const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  const divisor = Math.abs(w) > 1e-10 ? w : 1;

  return {
    x: (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) / divisor,
    y: (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) / divisor,
    z: (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) / divisor,
  };
}

export function invertMat4(matrix: readonly number[]): number[] | null {
  const output = new Array<number>(16);
  const m = matrix;

  output[0] =
    m[5] * m[10] * m[15] -
    m[5] * m[11] * m[14] -
    m[9] * m[6] * m[15] +
    m[9] * m[7] * m[14] +
    m[13] * m[6] * m[11] -
    m[13] * m[7] * m[10];
  output[4] =
    -m[4] * m[10] * m[15] +
    m[4] * m[11] * m[14] +
    m[8] * m[6] * m[15] -
    m[8] * m[7] * m[14] -
    m[12] * m[6] * m[11] +
    m[12] * m[7] * m[10];
  output[8] =
    m[4] * m[9] * m[15] -
    m[4] * m[11] * m[13] -
    m[8] * m[5] * m[15] +
    m[8] * m[7] * m[13] +
    m[12] * m[5] * m[11] -
    m[12] * m[7] * m[9];
  output[12] =
    -m[4] * m[9] * m[14] +
    m[4] * m[10] * m[13] +
    m[8] * m[5] * m[14] -
    m[8] * m[6] * m[13] -
    m[12] * m[5] * m[10] +
    m[12] * m[6] * m[9];
  output[1] =
    -m[1] * m[10] * m[15] +
    m[1] * m[11] * m[14] +
    m[9] * m[2] * m[15] -
    m[9] * m[3] * m[14] -
    m[13] * m[2] * m[11] +
    m[13] * m[3] * m[10];
  output[5] =
    m[0] * m[10] * m[15] -
    m[0] * m[11] * m[14] -
    m[8] * m[2] * m[15] +
    m[8] * m[3] * m[14] +
    m[12] * m[2] * m[11] -
    m[12] * m[3] * m[10];
  output[9] =
    -m[0] * m[9] * m[15] +
    m[0] * m[11] * m[13] +
    m[8] * m[1] * m[15] -
    m[8] * m[3] * m[13] -
    m[12] * m[1] * m[11] +
    m[12] * m[3] * m[9];
  output[13] =
    m[0] * m[9] * m[14] -
    m[0] * m[10] * m[13] -
    m[8] * m[1] * m[14] +
    m[8] * m[2] * m[13] +
    m[12] * m[1] * m[10] -
    m[12] * m[2] * m[9];
  output[2] =
    m[1] * m[6] * m[15] -
    m[1] * m[7] * m[14] -
    m[5] * m[2] * m[15] +
    m[5] * m[3] * m[14] +
    m[13] * m[2] * m[7] -
    m[13] * m[3] * m[6];
  output[6] =
    -m[0] * m[6] * m[15] +
    m[0] * m[7] * m[14] +
    m[4] * m[2] * m[15] -
    m[4] * m[3] * m[14] -
    m[12] * m[2] * m[7] +
    m[12] * m[3] * m[6];
  output[10] =
    m[0] * m[5] * m[15] -
    m[0] * m[7] * m[13] -
    m[4] * m[1] * m[15] +
    m[4] * m[3] * m[13] +
    m[12] * m[1] * m[7] -
    m[12] * m[3] * m[5];
  output[14] =
    -m[0] * m[5] * m[14] +
    m[0] * m[6] * m[13] +
    m[4] * m[1] * m[14] -
    m[4] * m[2] * m[13] -
    m[12] * m[1] * m[6] +
    m[12] * m[2] * m[5];
  output[3] =
    -m[1] * m[6] * m[11] +
    m[1] * m[7] * m[10] +
    m[5] * m[2] * m[11] -
    m[5] * m[3] * m[10] -
    m[9] * m[2] * m[7] +
    m[9] * m[3] * m[6];
  output[7] =
    m[0] * m[6] * m[11] -
    m[0] * m[7] * m[10] -
    m[4] * m[2] * m[11] +
    m[4] * m[3] * m[10] +
    m[8] * m[2] * m[7] -
    m[8] * m[3] * m[6];
  output[11] =
    -m[0] * m[5] * m[11] +
    m[0] * m[7] * m[9] +
    m[4] * m[1] * m[11] -
    m[4] * m[3] * m[9] -
    m[8] * m[1] * m[7] +
    m[8] * m[3] * m[5];
  output[15] =
    m[0] * m[5] * m[10] -
    m[0] * m[6] * m[9] -
    m[4] * m[1] * m[10] +
    m[4] * m[2] * m[9] +
    m[8] * m[1] * m[6] -
    m[8] * m[2] * m[5];

  const determinant =
    m[0] * output[0] + m[1] * output[4] + m[2] * output[8] + m[3] * output[12];

  if (Math.abs(determinant) < 1e-10) return null;
  const inverseDeterminant = 1 / determinant;

  for (let index = 0; index < 16; index += 1) {
    output[index] *= inverseDeterminant;
  }

  return output;
}
