import {
  buildOccupancy,
  canPlace,
  rotatedFootprint,
  type GridPlacement,
  type PlaceableItemDef,
  type RotSteps,
} from "../core/grid";
import { FLOOR_CELLS } from "../core/roomShell";

export const CLEAR_PATH_BED_ITEM_ID = "wooden-bed";
export const CLEAR_PATH_BED_INSTANCE_ID = "__clear-path-bed__";
const CLEAR_PATH_BED_DIRECTION_FLIP = 2;

const placementAt = (
  cell: { x: number; y: number },
  rotSteps: RotSteps,
): GridPlacement => ({
  instanceId: CLEAR_PATH_BED_INSTANCE_ID,
  itemId: CLEAR_PATH_BED_ITEM_ID,
  variation: null,
  surface: { kind: "floor" },
  cell,
  // Present the catalog bed with its head and foot ends exchanged. Pebble's
  // transform reads this final rotation, then independently faces and offsets
  // toward the bed model's local headboard.
  rotSteps: ((rotSteps + CLEAR_PATH_BED_DIRECTION_FLIP) % 4) as RotSteps,
});

/**
 * Finds the nearest available corner for Clear Path's non-persisted bed.
 * Existing furniture always wins: the bed moves to another corner rather than
 * overlap, and disappears only when no legal floor position remains.
 */
export function clearPathBedPlacement(
  layout: readonly GridPlacement[],
  bedDef: PlaceableItemDef | undefined,
  defs: ReadonlyMap<string, PlaceableItemDef>,
): GridPlacement | null {
  if (!bedDef || !bedDef.allowedSurfaces.includes("floor")) return null;
  const occupancy = buildOccupancy(layout, defs);
  const candidates: { placement: GridPlacement; score: number }[] = [];

  // A one-cell inset keeps the bed frame off the wall. If a busy room cannot
  // fit that margin, the second pass permits a flush corner before giving up.
  for (const margin of [1, 0]) {
    for (const rotSteps of [0, 1] as const) {
      const footprint = rotatedFootprint(bedDef.footprint, rotSteps);
      const maxX = FLOOR_CELLS.w - footprint.w - margin;
      const maxY = FLOOR_CELLS.d - footprint.d - margin;
      if (maxX < margin || maxY < margin) continue;
      for (let x = margin; x <= maxX; x += 1) {
        for (let y = margin; y <= maxY; y += 1) {
          const placement = placementAt({ x, y }, rotSteps);
          if (!canPlace(placement, bedDef, occupancy).ok) continue;
          const right = FLOOR_CELLS.w - (x + footprint.w);
          const far = FLOOR_CELLS.d - (y + footprint.d);
          const cornerDistance = Math.min(x + y, right + y, x + far, right + far);
          candidates.push({ placement, score: cornerDistance * 100 + x + y });
        }
      }
    }
    if (candidates.length > 0) break;
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates[0]?.placement ?? null;
}
