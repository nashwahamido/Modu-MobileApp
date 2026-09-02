import { test } from "node:test";
import assert from "node:assert";
import { migrateRoomPlacements, readRoomFinishes } from "./layoutMigrate";
import type { PlacedFurniture, PlacementSurface } from "../core/types";

test("v1 floor placements: cell coordinates double", () => {
  const v1Envelope = {
    version: 1,
    placements: [
      { instanceId: "t1", furnitureId: "lack-table", surface: { kind: "floor" } as PlacementSurface, cell: { x: 3, y: 2 }, rotSteps: 0 as const },
      { instanceId: "s1", furnitureId: "dalfred-stool", surface: { kind: "floor" } as PlacementSurface, cell: { x: 5, y: 4 }, rotSteps: 1 as const, color: "white" },
    ] satisfies PlacedFurniture[],
  };
  const result = migrateRoomPlacements(v1Envelope);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0]!.cell, { x: 6, y: 4 });
  assert.deepEqual(result[1]!.cell, { x: 10, y: 8 });
  assert.equal(result[1]!.color, "white");
});

test("v1 wall placements: cells unchanged, surface preserved", () => {
  const v1Envelope = {
    version: 1,
    placements: [
      { instanceId: "w1", furnitureId: "window", surface: { kind: "wall", wall: "x-min" } as PlacementSurface, cell: { x: 1, y: 2 }, rotSteps: 0 as const },
    ] satisfies PlacedFurniture[],
  };
  const result = migrateRoomPlacements(v1Envelope);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0]!.cell, { x: 1, y: 2 });
  assert.deepEqual(result[0]!.surface, { kind: "wall", wall: "x-min" });
});

test("v1 furniture-surface placements: cells unchanged, surface preserved", () => {
  const v1Envelope = {
    version: 1,
    placements: [
      { instanceId: "v1", furnitureId: "vase", surface: { kind: "furniture", hostInstanceId: "shelf1", slot: "top" } as PlacementSurface, cell: { x: 2, y: 1 }, rotSteps: 0 as const },
    ] satisfies PlacedFurniture[],
  };
  const result = migrateRoomPlacements(v1Envelope);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0]!.cell, { x: 2, y: 1 });
  assert.deepEqual(result[0]!.surface, { kind: "furniture", hostInstanceId: "shelf1", slot: "top" });
});

test("v2 placements: pass through unchanged", () => {
  const v2Envelope = {
    version: 2,
    placements: [
      { instanceId: "t1", furnitureId: "lack-table", surface: { kind: "floor" } as PlacementSurface, cell: { x: 6, y: 4 }, rotSteps: 0 as const },
      { instanceId: "s1", furnitureId: "dalfred-stool", surface: { kind: "floor" } as PlacementSurface, cell: { x: 10, y: 8 }, rotSteps: 1 as const },
    ] satisfies PlacedFurniture[],
  };
  const result = migrateRoomPlacements(v2Envelope);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0]!.cell, { x: 6, y: 4 });
  assert.deepEqual(result[1]!.cell, { x: 10, y: 8 });
});

test("legacy bare array: returns empty", () => {
  const legacyArray = [
    { instanceId: "t1", furnitureId: "lack-table", cell: { x: 3, y: 2 }, rotSteps: 0 },
  ];
  const result = migrateRoomPlacements(legacyArray);
  assert.deepEqual(result, []);
});

test("unknown version: returns empty", () => {
  const unknownVersion = {
    version: 99,
    placements: [
      { instanceId: "t1", furnitureId: "lack-table", surface: { kind: "floor" } as PlacementSurface, cell: { x: 3, y: 2 }, rotSteps: 0 as const },
    ],
  };
  const result = migrateRoomPlacements(unknownVersion);
  assert.deepEqual(result, []);
});

test("malformed v1 (missing placements): returns empty", () => {
  const malformed = { version: 1 };
  const result = migrateRoomPlacements(malformed);
  assert.deepEqual(result, []);
});

test("null input: returns empty", () => {
  const result = migrateRoomPlacements(null);
  assert.deepEqual(result, []);
});

test("undefined input: returns empty", () => {
  const result = migrateRoomPlacements(undefined);
  assert.deepEqual(result, []);
});

test("v1 empty placements: returns empty array", () => {
  const v1Envelope = {
    version: 1,
    placements: [],
  };
  const result = migrateRoomPlacements(v1Envelope);
  assert.deepEqual(result, []);
});

test("v1 mixed surfaces: double only floor cells", () => {
  const v1Envelope = {
    version: 1,
    placements: [
      { instanceId: "t1", furnitureId: "lack-table", surface: { kind: "floor" } as PlacementSurface, cell: { x: 2, y: 3 }, rotSteps: 0 as const },
      { instanceId: "w1", furnitureId: "window", surface: { kind: "wall", wall: "x-max" } as PlacementSurface, cell: { x: 1, y: 1 }, rotSteps: 0 as const },
      { instanceId: "s1", furnitureId: "stool", surface: { kind: "floor" } as PlacementSurface, cell: { x: 4, y: 5 }, rotSteps: 2 as const },
    ] satisfies PlacedFurniture[],
  };
  const result = migrateRoomPlacements(v1Envelope);
  assert.equal(result.length, 3);
  assert.deepEqual(result[0]!.cell, { x: 4, y: 6 }, "first floor item should double");
  assert.deepEqual(result[1]!.cell, { x: 1, y: 1 }, "wall item should not double");
  assert.deepEqual(result[2]!.cell, { x: 8, y: 10 }, "second floor item should double");
});

test("v1 envelope with a corrupt row: that row drops, valid siblings survive with doubling applied", () => {
  const v1Envelope = {
    version: 1,
    placements: [
      { instanceId: "t1", furnitureId: "lack-table", surface: { kind: "floor" } as PlacementSurface, cell: { x: 3, y: 2 }, rotSteps: 0 as const },
      { instanceId: "bad-1", furnitureId: "missing-cell", surface: { kind: "floor" } as PlacementSurface, rotSteps: 0 as const },
      "not-an-object",
      { instanceId: "s1", furnitureId: "dalfred-stool", surface: { kind: "floor" } as PlacementSurface, cell: { x: 5, y: 4 }, rotSteps: 1 as const },
    ],
  };
  const result = migrateRoomPlacements(v1Envelope);
  assert.equal(result.length, 2);
  assert.equal(result[0]!.instanceId, "t1");
  assert.deepEqual(result[0]!.cell, { x: 6, y: 4 });
  assert.equal(result[1]!.instanceId, "s1");
  assert.deepEqual(result[1]!.cell, { x: 10, y: 8 });
});

test("v2 envelope with a corrupt row: that row drops, valid siblings pass through unchanged", () => {
  const v2Envelope = {
    version: 2,
    placements: [
      { instanceId: "t1", furnitureId: "lack-table", surface: { kind: "floor" } as PlacementSurface, cell: { x: 6, y: 4 }, rotSteps: 0 as const },
      { instanceId: "bad-1", furnitureId: "malformed-surface", surface: { kind: 42 }, cell: { x: 1, y: 1 }, rotSteps: 0 as const },
      "not-an-object",
      { instanceId: "s1", furnitureId: "dalfred-stool", surface: { kind: "floor" } as PlacementSurface, cell: { x: 10, y: 8 }, rotSteps: 1 as const },
    ],
  };
  const result = migrateRoomPlacements(v2Envelope);
  assert.equal(result.length, 2);
  assert.equal(result[0]!.instanceId, "t1");
  assert.deepEqual(result[0]!.cell, { x: 6, y: 4 });
  assert.equal(result[1]!.instanceId, "s1");
  assert.deepEqual(result[1]!.cell, { x: 10, y: 8 });
});

test("v1 envelope with a bogus wall id: that row drops, valid siblings survive", () => {
  const v1Envelope = {
    version: 1,
    placements: [
      { instanceId: "t1", furnitureId: "lack-table", surface: { kind: "floor" } as PlacementSurface, cell: { x: 3, y: 2 }, rotSteps: 0 as const },
      { instanceId: "bad-wall", furnitureId: "window", surface: { kind: "wall", wall: "bogus" }, cell: { x: 1, y: 1 }, rotSteps: 0 as const },
      { instanceId: "s1", furnitureId: "dalfred-stool", surface: { kind: "floor" } as PlacementSurface, cell: { x: 5, y: 4 }, rotSteps: 1 as const },
    ],
  };
  const result = migrateRoomPlacements(v1Envelope);
  assert.equal(result.length, 2);
  assert.equal(result[0]!.instanceId, "t1");
  assert.deepEqual(result[0]!.cell, { x: 6, y: 4 });
  assert.equal(result[1]!.instanceId, "s1");
  assert.deepEqual(result[1]!.cell, { x: 10, y: 8 });
});

test("v1 envelope with a wall-kind row missing `wall`: that row drops, valid siblings survive", () => {
  const v1Envelope = {
    version: 1,
    placements: [
      { instanceId: "t1", furnitureId: "lack-table", surface: { kind: "floor" } as PlacementSurface, cell: { x: 3, y: 2 }, rotSteps: 0 as const },
      { instanceId: "bad-wall", furnitureId: "window", surface: { kind: "wall" }, cell: { x: 1, y: 1 }, rotSteps: 0 as const },
      { instanceId: "s1", furnitureId: "dalfred-stool", surface: { kind: "floor" } as PlacementSurface, cell: { x: 5, y: 4 }, rotSteps: 1 as const },
    ],
  };
  const result = migrateRoomPlacements(v1Envelope);
  assert.equal(result.length, 2);
  assert.equal(result[0]!.instanceId, "t1");
  assert.deepEqual(result[0]!.cell, { x: 6, y: 4 });
  assert.equal(result[1]!.instanceId, "s1");
  assert.deepEqual(result[1]!.cell, { x: 10, y: 8 });
});

test("v1 envelope with a legit wall row: it still passes through unchanged", () => {
  const v1Envelope = {
    version: 1,
    placements: [
      { instanceId: "w1", furnitureId: "window", surface: { kind: "wall", wall: "z-max" } as PlacementSurface, cell: { x: 1, y: 1 }, rotSteps: 0 as const },
    ] satisfies PlacedFurniture[],
  };
  const result = migrateRoomPlacements(v1Envelope);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0]!.surface, { kind: "wall", wall: "z-max" });
  assert.deepEqual(result[0]!.cell, { x: 1, y: 1 });
});

test("v2 envelope with a bogus wall id or missing `wall`: both rows drop, valid siblings survive", () => {
  const v2Envelope = {
    version: 2,
    placements: [
      { instanceId: "t1", furnitureId: "lack-table", surface: { kind: "floor" } as PlacementSurface, cell: { x: 6, y: 4 }, rotSteps: 0 as const },
      { instanceId: "bad-wall-1", furnitureId: "window", surface: { kind: "wall", wall: "bogus" }, cell: { x: 1, y: 1 }, rotSteps: 0 as const },
      { instanceId: "bad-wall-2", furnitureId: "window", surface: { kind: "wall" }, cell: { x: 2, y: 2 }, rotSteps: 0 as const },
      { instanceId: "w1", furnitureId: "window", surface: { kind: "wall", wall: "x-min" } as PlacementSurface, cell: { x: 1, y: 1 }, rotSteps: 0 as const },
    ],
  };
  const result = migrateRoomPlacements(v2Envelope);
  assert.equal(result.length, 2);
  assert.equal(result[0]!.instanceId, "t1");
  assert.equal(result[1]!.instanceId, "w1");
  assert.deepEqual(result[1]!.surface, { kind: "wall", wall: "x-min" });
});

test("v1 floor placement preserves all fields including optional color", () => {
  const v1Envelope = {
    version: 1,
    placements: [
      { instanceId: "id-123", furnitureId: "malm-chest", surface: { kind: "floor" } as PlacementSurface, cell: { x: 1, y: 1 }, rotSteps: 3 as const, color: "oak" },
    ] satisfies PlacedFurniture[],
  };
  const result = migrateRoomPlacements(v1Envelope);
  assert.equal(result.length, 1);
  const item = result[0]!;
  assert.equal(item.instanceId, "id-123");
  assert.equal(item.furnitureId, "malm-chest");
  assert.deepEqual(item.surface, { kind: "floor" });
  assert.deepEqual(item.cell, { x: 2, y: 2 });
  assert.equal(item.rotSteps, 3);
  assert.equal(item.color, "oak");
});

// the per-lamp switch was added as an OPTIONAL field with no version bump, on the strength of v2 passing rows through untouched
// if a v3 branch rebuilds rows field by field, every switched-off lamp silently relights — this test fails first
test("a switched-off lamp stays off across a v2 load", () => {
  const envelope = {
    version: 2,
    placements: [
      { instanceId: "l1", furnitureId: "astid-table-lamp", surface: { kind: "floor" } as PlacementSurface, cell: { x: 4, y: 4 }, rotSteps: 0 as const, lightOn: false },
      { instanceId: "l2", furnitureId: "astid-table-lamp", surface: { kind: "floor" } as PlacementSurface, cell: { x: 8, y: 4 }, rotSteps: 0 as const },
    ] satisfies PlacedFurniture[],
  };
  const result = migrateRoomPlacements(envelope);
  assert.equal(result.length, 2);
  assert.equal(result[0]!.lightOn, false, "an explicitly switched-off lamp must survive the load");
  // absent means ON, the reason this field needed no migration — rooms saved before it keep every lamp burning
  assert.equal(result[1]!.lightOn, undefined, "a lamp with no flag must stay unflagged rather than be defaulted to a literal");
});

// two of the same lamp differing is the point of storing this per instance — item_lights is keyed by item
test("two instances of one lamp carry independent switches", () => {
  const envelope = {
    version: 2,
    placements: [
      { instanceId: "l1", furnitureId: "barlast-floor-lamp", surface: { kind: "floor" } as PlacementSurface, cell: { x: 2, y: 2 }, rotSteps: 0 as const, lightOn: false },
      { instanceId: "l2", furnitureId: "barlast-floor-lamp", surface: { kind: "floor" } as PlacementSurface, cell: { x: 12, y: 2 }, rotSteps: 0 as const, lightOn: true },
    ] satisfies PlacedFurniture[],
  };
  const result = migrateRoomPlacements(envelope);
  assert.equal(result[0]!.lightOn, false);
  assert.equal(result[1]!.lightOn, true);
});

test("finishes: both slots read back", () => {
  assert.deepEqual(readRoomFinishes({ version: 2, placements: [], finishes: { floor: "oak-plank", wall: "linen-cream" } }), {
    floor: "oak-plank",
    wall: "linen-cream",
  });
});

test("finishes: absent field is an empty object, not undefined", () => {
  assert.deepEqual(readRoomFinishes({ version: 2, placements: [] }), {});
});

test("finishes: a non-string slot drops THAT slot only", () => {
  assert.deepEqual(readRoomFinishes({ version: 2, placements: [], finishes: { floor: 7, wall: "linen-cream" } }), {
    wall: "linen-cream",
  });
});

test("finishes: an empty-string slot is dropped", () => {
  assert.deepEqual(readRoomFinishes({ version: 2, placements: [], finishes: { floor: "", wall: "linen-cream" } }), {
    wall: "linen-cream",
  });
});

test("finishes: unknown slot keys are ignored", () => {
  assert.deepEqual(readRoomFinishes({ version: 2, placements: [], finishes: { floor: "oak-plank", trim: "walnut" } }), {
    floor: "oak-plank",
  });
});

test("finishes: malformed envelope yields the authored look", () => {
  assert.deepEqual(readRoomFinishes(null), {});
  assert.deepEqual(readRoomFinishes("nonsense"), {});
  assert.deepEqual(readRoomFinishes([]), {});
  assert.deepEqual(readRoomFinishes({ version: 2, placements: [], finishes: "nonsense" }), {});
  assert.deepEqual(readRoomFinishes({ version: 2, placements: [], finishes: [] }), {});
});

test("finishes: a v1 envelope still reads its finishes", () => {
  assert.deepEqual(readRoomFinishes({ version: 1, placements: [], finishes: { wall: "linen-cream" } }), {
    wall: "linen-cream",
  });
});
