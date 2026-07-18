import { test } from "node:test";
import assert from "node:assert/strict";
import type { ActionId, AssemblyAction, Furniture, PartId } from "@/src/game/core/type";
import { workspaceActionFilter, workspaceOf } from "./workspace";

// Two sides + a top joining both (bridge) + a shelf joining ONLY sideR + a screw secured entirely into sideR + a BRIDGE bolt spanning sideR (carded) and sideL (in scene).
function fixture(): Furniture {
  const parts = {
    sideL: { partId: "sideL", meshName: "sideL", group: "sidePanelL", type: "structural", cluster: "box", pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] } },
    sideR: { partId: "sideR", meshName: "sideR", group: "sidePanelR", type: "structural", cluster: "box", pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] } },
    top:   { partId: "top",   meshName: "top",   group: "topPanel",   type: "structural", cluster: "box", directJoins: ["sideL", "sideR"], pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] } },
    shelf: { partId: "shelf", meshName: "shelf", group: "shelf",      type: "structural", cluster: "box", directJoins: ["sideR"], pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] } },
    screwR: { partId: "screwR", meshName: "screwR", group: "screw", type: "fastener", cluster: "box", attached: ["sideR"], pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] } },
    bolt:   { partId: "bolt",   meshName: "bolt",   group: "bolt",  type: "fastener", cluster: "box", attached: ["sideR", "sideL"], pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] } },
  } as never as Furniture["parts"];
  const actions = [
    { actionId: "pL", type: "placePart", partId: "sideL", stage: 1, order: 1, requires: [] },
    { actionId: "pR", type: "placePart", partId: "sideR", stage: 1, order: 2, requires: [] },
    { actionId: "pT", type: "placePart", partId: "top",   stage: 1, order: 3, requires: [] },
    { actionId: "pS", type: "placePart", partId: "shelf", stage: 1, order: 4, requires: [] },
    { actionId: "iS", type: "insertFastener", partId: "screwR", stage: 1, order: 5, requires: [] },
    { actionId: "iB", type: "insertFastener", partId: "bolt",   stage: 1, order: 6, requires: [] },
  ] as never as Furniture["actions"];
  return { meta: { id: "TEST" }, parts, actions } as unknown as Furniture;
}

const actionOf = (f: Furniture, id: string): AssemblyAction =>
  f.actions.find((a) => a.actionId === id)!;

const parkedR = [
  { id: "sideR" as PartId, members: ["sideR"] as PartId[], trigger: "pR" as ActionId },
];

test("placed = every completed placement; carded parts stay in it (logic set)", () => {
  const ws = workspaceOf(fixture(), ["pL", "pR"] as ActionId[], parkedR);
  assert.deepEqual([...ws.placed].sort(), ["sideL", "sideR"]);
});

test("inScene = placed minus carded (presentation set)", () => {
  const ws = workspaceOf(fixture(), ["pL", "pR"] as ActionId[], parkedR);
  assert.deepEqual([...ws.inScene], ["sideL"]);
});

test("a fastener attached entirely inside a carded island cards with it", () => {
  const ws = workspaceOf(fixture(), ["pL", "pR"] as ActionId[], parkedR);
  assert.equal(ws.cardedIslandOf["screwR" as PartId], "sideR");
});

test("a BRIDGE fastener (one attachment in scene) does NOT card", () => {
  const ws = workspaceOf(fixture(), ["pL", "pR"] as ActionId[], parkedR);
  assert.equal(ws.cardedIslandOf["bolt" as PartId], undefined);
});

test("no parked islands → inScene equals placed, no carding", () => {
  const ws = workspaceOf(fixture(), ["pL", "pR"] as ActionId[], []);
  assert.deepEqual([...ws.inScene].sort(), ["sideL", "sideR"]);
  assert.deepEqual(ws.cardedIslandOf, {});
});

test("filter: insert into a carded island is NOT offered; a bridge fastener is", () => {
  const f = fixture();
  const inWs = workspaceActionFilter(f, workspaceOf(f, ["pL", "pR"] as ActionId[], parkedR));
  assert.equal(inWs(actionOf(f, "iS")), false); // screw entirely into carded sideR
  assert.equal(inWs(actionOf(f, "iB")), true); // bolt bridges carded sideR ↔ in-scene sideL
});

test("filter: placePart with ONLY carded neighbours hidden; bridge placements offered", () => {
  const f = fixture();
  const inWs = workspaceActionFilter(f, workspaceOf(f, ["pL", "pR"] as ActionId[], parkedR));
  assert.equal(inWs(actionOf(f, "pS")), false); // shelf joins only carded sideR — ghost would float
  assert.equal(inWs(actionOf(f, "pT")), true); // top joins sideL (in scene) too — the bridge
  // sideL's ONLY liaison is the bolt's connector edge to carded sideR, so with just R placed (and carded) it hides too — the island card is the affordance to resume that side, not a mid-air placement.
  const fresh = workspaceActionFilter(f, workspaceOf(f, ["pR"] as ActionId[], parkedR));
  assert.equal(fresh(actionOf(f, "pL")), false);
});

test("filter: no parked islands → everything offered", () => {
  const f = fixture();
  const inWs = workspaceActionFilter(f, workspaceOf(f, ["pL", "pR"] as ActionId[], []));
  for (const a of f.actions) assert.equal(inWs(a), true);
});
