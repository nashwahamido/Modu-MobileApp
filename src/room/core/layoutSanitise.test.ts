import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import type { GridPlacement, SurfaceId } from "./grid";
import { removeWithChildren, sanitizeLayout } from "./layoutSanitise";
import { registerPlaceables } from "./placeableItems";

// The registry is module state. Every test starts from the bundled built set plus one bought floor row, matching the shape placeableItems.test.ts uses — one flagged HOST so furniture-surface rows have somewhere to stand, and one onTop item to stand on it (a bundled dalfred-stool has no onTop of its own — a stool does not stand on a table — so the furniture-surface child needs its own fixture row, not the built set).
beforeEach(() => {
  registerPlaceables([
    { id: "malm-chest", source: "bought", category: "fur", size: { x: 0.804, y: 1.004, z: 0.483 }, baseOffsetY: 0, mount: "floor" },
    { id: "side-table", source: "bought", category: "fur", size: { x: 0.5, y: 0.5, z: 0.5 }, baseOffsetY: 0, mount: "floor", topSurface: true },
    { id: "table-lamp", source: "bought", category: "lit", size: { x: 0.2, y: 0.4, z: 0.2 }, baseOffsetY: 0, mount: "floor", onTop: true },
  ]);
});

const row = (instanceId: string, itemId: string, cell: { x: number; y: number }, surface: SurfaceId = { kind: "floor" }): GridPlacement => ({
  instanceId,
  itemId,
  variation: null,
  surface,
  cell,
  rotSteps: 0,
});
const onTop = (instanceId: string, hostInstanceId: string): GridPlacement =>
  row(instanceId, "table-lamp", { x: 0, y: 0 }, { kind: "furniture", hostInstanceId, slot: "top" });

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

test("furniture rows sanitise AFTER their hosts, whatever the saved order", () => {
  const host = row("t1", "side-table", { x: 2, y: 2 });
  const child = onTop("c1", "t1");
  // Child FIRST in the saved rows: a naive sequential pass would reject it before the host exists.
  assert.deepEqual(sanitizeLayout([child, host]).map((p) => p.instanceId).sort(), ["c1", "t1"]);
});

test("a child whose host is dropped drops with it; a child of a surviving host survives", () => {
  const hostA = row("a", "side-table", { x: 0, y: 0 });
  // hostB collides with hostA (same cells) and is dropped by sequential accept — its child must cascade.
  const hostB = row("b", "side-table", { x: 0, y: 0 });
  assert.deepEqual(
    sanitizeLayout([hostA, hostB, onTop("ca", "a"), onTop("cb", "b")]).map((p) => p.instanceId).sort(),
    ["a", "ca"],
  );
});

test("removeWithChildren takes the host and everything standing on it, and nothing else", () => {
  const host = row("t1", "side-table", { x: 2, y: 2 });
  const child = onTop("c1", "t1");
  const bystander = row("s1", "dalfred-stool", { x: 10, y: 10 });
  assert.deepEqual(removeWithChildren([host, child, bystander], "t1").map((p) => p.instanceId), ["s1"]);
  // Removing a CHILD takes only the child.
  assert.deepEqual(removeWithChildren([host, child, bystander], "c1").map((p) => p.instanceId), ["t1", "s1"]);
});
