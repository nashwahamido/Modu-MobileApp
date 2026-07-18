import { test } from "node:test";
import assert from "node:assert/strict";
import type { ActionId, Furniture, PartId } from "@/src/game/core/type";
import { deriveSceneState } from "./useSceneState";

// Single-cluster furniture: two seed sides + a top joining both + a screw secured entirely into sideR (must card WITH sideR's island).
function fixture(): Furniture {
  const parts = {
    sideL: { partId: "sideL", meshName: "sideL", group: "sidePanelL", type: "structural", cluster: "box", seed: true, pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] } },
    sideR: { partId: "sideR", meshName: "sideR", group: "sidePanelR", type: "structural", cluster: "box", seed: true, pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] } },
    top:   { partId: "top",   meshName: "top",   group: "topPanel",   type: "structural", cluster: "box", directJoins: ["sideL", "sideR"], pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] } },
    screwR: { partId: "screwR", meshName: "screwR", group: "screw", type: "fastener", cluster: "box", attached: ["sideR"], pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] } },
  } as any;
  const actions = [
    { actionId: "pL", type: "placePart", partId: "sideL", stage: 1, order: 1, requires: [] },
    { actionId: "pR", type: "placePart", partId: "sideR", stage: 1, order: 2, requires: [] },
    { actionId: "pT", type: "placePart", partId: "top",   stage: 1, order: 3, requires: [] },
    { actionId: "iS", type: "insertFastener", partId: "screwR", stage: 1, order: 4, requires: [] },
  ] as any;
  return { meta: { id: "TEST" }, parts, actions, labels: {}, clusters: { box: { label: "Cabinet" } } } as unknown as Furniture;
}

test("parked members are HIDDEN (in the tray) and map to their island id", () => {
  const f = fixture();
  // sideR is parked; sideL placed and active.
  const s = deriveSceneState(
    f, ["pL", "pR"] as ActionId[], null, null, null, "free", null, false, false,
    [{ id: "sideR" as PartId, members: ["sideR"] as PartId[], trigger: "pR" as ActionId }],
  );
  assert.equal(s.modes["sideR"], "hidden");
  assert.equal(s.parkedIslandOf["sideR" as PartId], "sideR");
  // Active-side part is unaffected (placed → flush).
  assert.equal(s.modes["sideL"], "flush");
});

test("the RETURNING island's members render 'parked' (visible, driver-driven)", () => {
  const f = fixture();
  const s = deriveSceneState(
    f, ["pL", "pR"] as ActionId[], null, null, null, "free", null, false, false,
    [{ id: "sideR" as PartId, members: ["sideR"] as PartId[], trigger: "pR" as ActionId }],
    "sideR" as PartId,
  );
  assert.equal(s.modes["sideR"], "parked");
  assert.equal(s.modes["sideL"], "flush");
});

test("carded members stay HIDDEN even while a bridge part interacts with them (the held part's own socket ghost is the guidance — user decision, no island silhouettes)", () => {
  const f = fixture();
  const parked = [
    { id: "sideR" as PartId, members: ["sideR"] as PartId[], trigger: "pR" as ActionId },
  ];
  // top joins sideL (in scene) + sideR (carded), held AND matched at its socket → sideR island STILL hidden.
  const s = deriveSceneState(
    f, ["pL", "pR", "iS"] as ActionId[], "pT" as ActionId, null, "pT" as ActionId, "free", null, false, false, parked,
  );
  assert.equal(s.modes["sideR"], "hidden");
  assert.equal(s.modes["screwR"], "hidden");
  assert.equal(s.modes["sideL"], "flush");
});

test("a fastener attached entirely inside a parked island cards WITH it", () => {
  const f = fixture();
  const parked = [
    { id: "sideR" as PartId, members: ["sideR"] as PartId[], trigger: "pR" as ActionId },
  ];
  // Inserted screw on the carded side: hidden with the island…
  const s = deriveSceneState(
    f, ["pL", "pR", "iS"] as ActionId[], null, null, null, "free", null, false, false, parked,
  );
  assert.equal(s.modes["screwR"], "hidden");
  assert.equal(s.parkedIslandOf["screwR" as PartId], "sideR");
  // …and driver-driven while the island returns.
  const r = deriveSceneState(
    f, ["pL", "pR", "iS"] as ActionId[], null, null, null, "free", null, false, false, parked,
    "sideR" as PartId,
  );
  assert.equal(r.modes["screwR"], "parked");
});

test("with no parked islands, parkedIslandOf is empty and no part is 'parked'", () => {
  const f = fixture();
  const s = deriveSceneState(f, ["pL"] as ActionId[], null, null, null, "free", null, false, false, []);
  assert.deepEqual(s.parkedIslandOf, {});
  assert.ok(!Object.values(s.modes).includes("parked"));
});
