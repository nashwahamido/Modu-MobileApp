import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import type { GridPlacement } from "./grid";
import { sanitizeLayout } from "./layoutSanitise";
import { registerPlaceables } from "./placeableItems";

// The registry is module state. Every test starts from the bundled built set plus one bought floor row, matching the shape placeableItems.test.ts uses.
beforeEach(() => {
  registerPlaceables([
    { id: "malm-chest", source: "bought", category: "fur", size: { x: 0.804, y: 1.004, z: 0.483 }, baseOffsetY: 0 },
  ]);
});

const row = (instanceId: string, itemId: string, cell: { x: number; y: number }): GridPlacement => ({
  instanceId,
  itemId,
  variation: null,
  surface: { kind: "floor" },
  cell,
  rotSteps: 0,
});

test("a layout that is still legal passes through untouched", () => {
  const layout = [row("a", "lack-table", { x: 2, y: 2 }), row("b", "lack-table", { x: 6, y: 6 })];
  assert.deepEqual(sanitizeLayout(layout), layout);
});

test("a row that no longer fits the grid is dropped", () => {
  // The floor is 18 x 18 cells; nothing can be anchored at 99.
  const kept = row("a", "lack-table", { x: 2, y: 2 });
  const result = sanitizeLayout([kept, row("b", "lack-table", { x: 99, y: 99 })]);
  assert.deepEqual(result, [kept]);
});

test("of two rows that now collide, the EARLIER one is kept", () => {
  // Sequential accept: occupancy is built from the rows already admitted, not from the input.
  const first = row("a", "lack-table", { x: 2, y: 2 });
  const result = sanitizeLayout([first, row("b", "lack-table", { x: 2, y: 2 })]);
  assert.deepEqual(result, [first]);
});

test("a row whose item is not in the catalog is KEPT, not dropped", () => {
  // The catalog syncs after first paint. Dropping unknowns here would delete bought furniture on every cold start; the scene already skips rendering them.
  const unknown = row("a", "not-in-the-catalog-yet", { x: 2, y: 2 });
  assert.deepEqual(sanitizeLayout([unknown]), [unknown]);
});
