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

export const DEFAULT_FURNITURE_FOOTPRINT: FurnitureFootprint = {
  width: 0.12,
  depth: 0.07,
};

// Normalized screen-space metadata for virtualroom_empty.glb with the current
// fixed room camera. The replacement keeps the previous room shell dimensions,
// but no longer contains the old sofa, chair, or plant-table obstacles.
export const EMPTY_ROOM_PLACEMENT: RoomPlacementMetadata = {
  floor: [
    { x: 0.27, y: 0.42 },
    { x: 0.73, y: 0.42 },
    { x: 0.84, y: 0.89 },
    { x: 0.17, y: 0.89 },
  ],
  staticObstacles: [],
};

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
    const crossesRay =
      (currentPoint.y > point.y) !== (previousPoint.y > point.y);

    if (
      crossesRay &&
      point.x <
        ((previousPoint.x - currentPoint.x) *
          (point.y - currentPoint.y)) /
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

export function getPlacementPerspectiveScale(pointY: number, height: number) {
  const nearScale = 0.55;
  const farScale = 1.18;
  const progress = (pointY - height * 0.25) / (height * 0.47);
  return Math.max(nearScale, Math.min(farScale, nearScale + progress * (farScale - nearScale)));
}

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

  return overlapsFurniture
    ? "That spot is occupied. Try another place."
    : null;
}
