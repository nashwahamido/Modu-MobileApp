import assert from "node:assert/strict";
import test from "node:test";
import { parseRecipe } from "./schema";

const MINIMAL = {
  schemaVersion: 1,
  id: "test-shelf",
  parts: {
    board_top: { partId: "board_top", group: "board_top", meshName: "shelf_board_top", type: "structural", cluster: "shelf", pose: { position: [0, 0.2, 0], rotation: [0, 0, 0, 1] } },
    leg_1: { partId: "leg_1", group: "leg", meshName: "shelf_leg_1", type: "structural", cluster: "shelf", pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] } },
    screw_1: { partId: "screw_1", group: "screw999", meshName: "shelf_screw999_1__board_top&leg_1", type: "fastener", cluster: "shelf", pose: { position: [0, 0.1, 0], rotation: [0, 0, 0, 1] }, attached: ["board_top", "leg_1"], engageDir: [0, -1, 0] },
  },
  structure: { board_top: { seed: true } },
  fastenerRules: [{ group: "screw999", stage: 1 }],
  actions: [
    { type: "placePart", stage: 1, partId: "board_top", requires: [] },
    { type: "placePart", stage: 1, partId: "leg_1", requires: [] },
    { type: "reorient", actionId: "finishing_checks", stage: 1, requires: ["tighten-group:screw999"] },
  ],
  labels: { board_top: { standard: "Board" }, leg: { standard: "Leg" }, screw999: { standard: "Screw" } },
  hardware: { screw999: { tool: "screwdriver", motion: "turn" } },
};

test("a minimal valid recipe parses", () => {
  const r = parseRecipe(MINIMAL);
  assert.ok(r.ok, r.ok ? "" : r.errors.join("; "));
});

test("wrong schemaVersion is rejected by name", () => {
  const r = parseRecipe({ ...MINIMAL, schemaVersion: 2 });
  assert.ok(!r.ok && r.errors.some((e) => e.includes("schemaVersion")));
});

test("errors carry the path to the offending field", () => {
  const bad = structuredClone(MINIMAL) as Record<string, unknown>;
  (bad.parts as Record<string, Record<string, unknown>>).leg_1.pose = { position: [0, 0], rotation: [0, 0, 0, 1] };
  const r = parseRecipe(bad);
  assert.ok(!r.ok && r.errors.some((e) => e.includes("parts.leg_1.pose.position")));
});

test("unknown structure-overlay keys are rejected — absence is load-bearing authoring, so no silent extras", () => {
  const bad = structuredClone(MINIMAL) as Record<string, unknown>;
  (bad.structure as Record<string, Record<string, unknown>>).board_top.wobble = true;
  const r = parseRecipe(bad);
  assert.ok(!r.ok && r.errors.some((e) => e.includes("wobble")));
});

test("non-object input fails without throwing", () => {
  assert.ok(!parseRecipe(null).ok && !parseRecipe("[]").ok && !parseRecipe(42).ok);
});

test("overlay VALUES are shape-checked, not just keys — junk survives the engine validator and NaNs out at runtime otherwise", () => {
  const bad = structuredClone(MINIMAL) as Record<string, unknown>;
  (bad.structure as Record<string, Record<string, unknown>>).board_top = { placeDir: "north", parkBackoff: "3cm", seed: "yes", stageOffset: [0, 0.1], directJoins: "leg_1" };
  const r = parseRecipe(bad);
  assert.ok(!r.ok);
  const errs = r.ok ? [] : r.errors;
  for (const path of ["structure.board_top.placeDir", "structure.board_top.parkBackoff", "structure.board_top.seed", "structure.board_top.stageOffset", "structure.board_top.directJoins"]) {
    assert.ok(errs.some((e) => e.startsWith(path)), `missing error for ${path}; got: ${errs.join("; ")}`);
  }
});

test("a 100k-deep gate expression is rejected with a path error instead of blowing the stack", () => {
  let expr: unknown = { done: "place_board_top" };
  for (let i = 0; i < 100_000; i++) expr = { all: [expr] };
  const bad = { ...structuredClone(MINIMAL), gates: { deep: expr } } as Record<string, unknown>;
  const r = parseRecipe(bad);
  assert.ok(!r.ok && r.errors.some((e) => e.includes("nests deeper")), r.ok ? "parsed ok?!" : r.errors.slice(0, 3).join("; "));
});

test("pairedWith and action id fields are shape-checked", () => {
  const bad = structuredClone(MINIMAL) as Record<string, unknown>;
  (bad.fastenerRules as Record<string, unknown>[])[0].pairedWith = "cam";
  (bad.actions as Record<string, unknown>[])[0].partId = 5;
  const r = parseRecipe(bad);
  assert.ok(!r.ok);
  const errs = r.ok ? [] : r.errors;
  assert.ok(errs.some((e) => e.startsWith("fastenerRules[0].pairedWith")), errs.join("; "));
  assert.ok(errs.some((e) => e.startsWith("actions[0].partId")), errs.join("; "));
});
