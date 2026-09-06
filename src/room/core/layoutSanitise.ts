// The filter between a SAVED room and a rendered one: saved rows are re-validated against TODAY'S rules, not the ones they were placed under.
// Grids have shrunk and window bands have moved, and a stale row otherwise renders verbatim forever — a window frozen outside its band with no way to grab it.
// Its own module so node:test can import it: placement.ts reaches the repo seam and through it react-native, which esbuild cannot transform.
import { canPlaceInLayout, type GridPlacement } from "./grid";
import { getRoomItemDef, roomItemDefs } from "./placeableItems";

export function sanitizeLayout(rows: GridPlacement[]): GridPlacement[] {
  // Hosts before children, since a furniture-surface row can only validate against an accepted host. Stable within each group, and a dropped host cascades to its children through canPlace's no-host answer.
  const ordered = [...rows.filter((r) => r.surface.kind !== "furniture"), ...rows.filter((r) => r.surface.kind === "furniture")];
  const layout: GridPlacement[] = [];
  for (const row of ordered) {
    const def = getRoomItemDef(row.itemId);
    // Sequential accept keeps the earlier of two now-colliding pieces. A MISSING def is kept: the catalog syncs after first paint, and dropping it here would delete bought furniture on every cold start.
    if (def && !canPlaceInLayout(row, layout, roomItemDefs()).ok) {
      console.warn("[room] dropping stale placement", row.instanceId, row.surface, row.cell);
      continue;
    }
    layout.push(row);
  }
  return layout;
}

// A host leaves with everything standing on it, so eject-on-remove is one layout update. Removing a non-host is just itself — children never host, so one level is the whole cascade.
export function removeWithChildren(layout: GridPlacement[], instanceId: string): GridPlacement[] {
  return layout.filter(
    (p) => p.instanceId !== instanceId && !(p.surface.kind === "furniture" && p.surface.hostInstanceId === instanceId),
  );
}
