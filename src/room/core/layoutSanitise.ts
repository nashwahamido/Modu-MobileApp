// The filter that stands between a SAVED room and a rendered one. Saved rows are re-validated against TODAY'S rules, not the rules they were placed under: grids have shrunk and window bands have moved this project, and a stale row otherwise renders verbatim forever — a window frozen outside its band with no way to grab it.
// Its own module rather than a function inside placement.ts so node:test can import it: placement.ts reaches the repo seam and through it react-native, which the test runner's esbuild cannot transform. Same constraint placeableItems.ts documents in its own header.
import { canPlaceInLayout, type GridPlacement } from "./grid";
import { getRoomItemDef, roomItemDefs } from "./placeableItems";

export function sanitizeLayout(rows: GridPlacement[]): GridPlacement[] {
  // Hosts before children: furniture-surface rows can only validate against a host that has already been accepted, so floor and wall rows go first (stable within each group — sequential accept still keeps the earlier of two colliding pieces, and a dropped host cascades to its children via canPlace's no-host answer).
  const ordered = [...rows.filter((r) => r.surface.kind !== "furniture"), ...rows.filter((r) => r.surface.kind === "furniture")];
  const layout: GridPlacement[] = [];
  for (const row of ordered) {
    const def = getRoomItemDef(row.itemId);
    // Sequential accept keeps the earlier of two now-colliding pieces. An item whose def is MISSING is kept — the catalog syncs after first paint, the scene already skips rendering unknowns, and dropping it here would delete bought furniture on every cold start.
    if (def && !canPlaceInLayout(row, layout, roomItemDefs()).ok) {
      console.warn("[room] dropping stale placement", row.instanceId, row.surface, row.cell);
      continue;
    }
    layout.push(row);
  }
  return layout;
}

// A host leaves with everything standing on it — the store's remove() calls this so eject-on-remove is one layout update. Removing a non-host is just itself (children never host, so one level is the whole cascade).
export function removeWithChildren(layout: GridPlacement[], instanceId: string): GridPlacement[] {
  return layout.filter(
    (p) => p.instanceId !== instanceId && !(p.surface.kind === "furniture" && p.surface.hostInstanceId === instanceId),
  );
}
