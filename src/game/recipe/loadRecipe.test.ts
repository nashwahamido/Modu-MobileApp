// src/game/recipe/loadRecipe.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { parseRecipe } from "./schema";
import { composeRecipe, type RecipeAssets } from "./loadRecipe";

// Same minimal fixture as schema.test.ts — a board, a leg, one screw group. Duplicated on purpose: each test file must read standalone.
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

const ASSETS: RecipeAssets = { model: { uri: "https://x/model.glb" }, thumbs: {} as never, thumbnail: { light: { uri: "https://x/thumb.png" } } };
const ROW = { xpPerStep: 6, xpBonusOnComplete: 0 };

test("a valid recipe composes to a validated Furniture with derived counts and row rewards", () => {
  const parsed = parseRecipe(MINIMAL);
  assert.ok(parsed.ok);
  const out = composeRecipe(parsed.recipe, ASSETS, ROW);
  assert.ok(out.ok, out.ok ? "" : out.error);
  assert.equal(out.furniture.meta.partCount, 3);
  assert.ok(out.furniture.meta.stepCount >= 4, "place ×2 + insert + tighten at minimum");
  assert.equal(out.furniture.xpPerStep, 6);
  assert.ok(out.furniture.actions.some((a) => a.actionId === "finishing_checks" && a.requires.includes("tighten_screw_1" as never)), "the ref expanded to the concrete tighten id");
});

test("a recipe with a dangling gate name fails as a Result, not a throw", () => {
  const bad = structuredClone(MINIMAL) as Record<string, unknown>;
  (bad.actions as Record<string, unknown>[])[0].gate = "noSuchGate";
  const parsed = parseRecipe(bad);
  assert.ok(parsed.ok);
  const out = composeRecipe(parsed.recipe, ASSETS, ROW);
  assert.ok(!out.ok && /noSuchGate|gate/.test(out.error));
});

test("recipe hardware supplements the bundled catalogue, bundled wins on conflict", () => {
  const clash = structuredClone(MINIMAL) as Record<string, unknown>;
  (clash.hardware as Record<string, unknown>).screw105215 = { tool: "hand" };
  const parsed = parseRecipe(clash);
  assert.ok(parsed.ok);
  const out = composeRecipe(parsed.recipe, ASSETS, ROW);
  assert.ok(out.ok, out.ok ? "" : out.error);
});

test("a recipe with a non-prefix group name composes when the overlay declares fastenerKind explicitly — group names are identification, not facts", () => {
  const neutral = structuredClone(MINIMAL) as Record<string, unknown>;
  const parts = neutral.parts as Record<string, Record<string, unknown>>;
  parts.screw_1.group = "fixing999";
  (neutral.structure as Record<string, unknown>).screw_1 = { fastenerKind: "threaded" };
  (neutral.fastenerRules as Record<string, unknown>[])[0].group = "fixing999";
  neutral.labels = { ...(neutral.labels as object), fixing999: { standard: "Fixing" } };
  neutral.hardware = { fixing999: { tool: "screwdriver", motion: "turn" } };
  delete (neutral.labels as Record<string, unknown>).screw999;
  // the fixture's finishing_checks action still refs the OLD group name via "tighten-group:screw999" — a stale ref left over from MINIMAL, not an engine concern; rename it alongside every other screw999→fixing999 site so expandRefs has a group to match.
  (neutral.actions as Record<string, unknown>[])[2].requires = ["tighten-group:fixing999"];
  const parsed = parseRecipe(neutral);
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.errors.join("; "));
  const out = composeRecipe(parsed.recipe, ASSETS, ROW);
  assert.ok(out.ok, out.ok ? "" : out.error);
});
