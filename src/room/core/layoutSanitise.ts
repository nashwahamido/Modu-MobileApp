// The filter that stands between a SAVED room and a rendered one. Saved rows are re-validated against TODAY'S rules, not the rules they were placed under: grids have shrunk and window bands have moved this project, and a stale row otherwise renders verbatim forever — a window frozen outside its band with no way to grab it.
// Its own module rather than a function inside placement.ts so node:test can import it: placement.ts reaches the repo seam and through it react-native, which the test runner's esbuild cannot transform. Same constraint placeableItems.ts documents in its own header.
import { buildOccupancy, canPlace, type GridPlacement } from "./grid";
import { getRoomItemDef, roomItemDefs } from "./placeableItems";

export function sanitizeLayout(rows: GridPlacement[]): GridPlacement[] {
  const layout: GridPlacement[] = [];
  for (const row of rows) {
    const def = getRoomItemDef(row.itemId);
    // Sequential accept keeps the earlier of two now-colliding pieces. An item whose def is MISSING is kept — the catalog syncs after first paint, the scene already skips rendering unknowns, and dropping it here would delete bought furniture on every cold start.
    if (def && !canPlace(row, def, buildOccupancy(layout, roomItemDefs())).ok) {
      console.warn("[room] dropping stale placement", row.instanceId, row.surface, row.cell);
      continue;
    }
    layout.push(row);
  }
  return layout;
}
