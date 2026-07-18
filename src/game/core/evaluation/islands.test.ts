import { test } from "node:test";
import assert from "node:assert/strict";
import type { ActionId, Furniture, PartId } from "@/src/game/core/type";
import {
  degradeLoneIslands,
  isLoneIsland,
  islandsOf,
  islandLabel,
  isMergeable,
  islandToParkOnSeed,
  parkTriggeredBy,
  unparkAfterUndo,
  type ParkedIsland,
} from "./islands";

// Minimal synthetic furniture: two seed side panels + a top that joins both + a securing screw driven only into sideL (insert iL realizes a connection → sideL stops being "lone"). Liaisons: top–sideL, top–sideR (structural press joints).
function fixture(): Furniture {
  const parts = {
    sideL: { partId: "sideL", meshName: "sideL", group: "sidePanelL", type: "structural", cluster: "box", seed: true, islandRoot: true, pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] } },
    sideR: { partId: "sideR", meshName: "sideR", group: "sidePanelR", type: "structural", cluster: "box", seed: true, islandRoot: true, pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] } },
    top:   { partId: "top",   meshName: "top",   group: "topPanel",   type: "structural", cluster: "box", directJoins: ["sideL", "sideR"], pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] } },
    screwL: { partId: "screwL", meshName: "screwL", group: "screw", type: "fastener", cluster: "box", attached: ["sideL"], pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] } },
  } as any;
  const actions = [
    { actionId: "pL", type: "placePart", partId: "sideL", stage: 1, order: 1, requires: [] },
    { actionId: "pR", type: "placePart", partId: "sideR", stage: 1, order: 2, requires: [] },
    { actionId: "pT", type: "placePart", partId: "top",   stage: 1, order: 3, requires: [] },
    { actionId: "insert_screwL", type: "insertFastener", partId: "screwL", stage: 1, order: 4, requires: [] },
  ] as any;
  const labels = { sidePanelL: { standard: "Left side panel" }, sidePanelR: { standard: "Right side panel" }, topPanel: { standard: "Top panel" } } as any;
  const clusters = { box: { label: "Cabinet" } } as any;
  return { meta: { id: "TEST" }, parts, actions, labels, clusters } as unknown as Furniture;
}

test("islandsOf: one island per placed seed before a bridge is placed", () => {
  const f = fixture();
  const islands = islandsOf(f, ["pL", "pR"] as any);
  assert.equal(islands.length, 2);
  const ids = islands.map((i) => i.id).sort();
  assert.deepEqual(ids, ["sideL", "sideR"]);
});

test("islandsOf: placing the bridge merges into one island", () => {
  const f = fixture();
  const islands = islandsOf(f, ["pL", "pR", "pT"] as any);
  assert.equal(islands.length, 1);
  assert.equal(islands[0].members.length, 3);
});

test("islandsOf: no placed parts → no islands", () => {
  assert.equal(islandsOf(fixture(), [] as any).length, 0);
});

test("islandLabel: uses the seed part's label, never the id", () => {
  const f = fixture();
  assert.equal(islandLabel(f, { seed: "sideL", cluster: "box" } as any), "Left side panel");
});

test("isMergeable: false before a bridge part touches the parked island", () => {
  const f = fixture();
  // sideR parked; only sideL + sideR placed. top not placed → no bridge.
  assert.equal(isMergeable(f, ["pL", "pR"] as any, ["sideR"] as any), false);
});

test("isMergeable: true once the bridge (top) is placed outside the island", () => {
  const f = fixture();
  // sideR parked (members: [sideR]); sideL + top placed on the active side.
  assert.equal(isMergeable(f, ["pL", "pR", "pT"] as any, ["sideR"] as any), true);
});

test("islandToParkOnSeed: first seed parks nothing", () => {
  const f = fixture();
  assert.equal(islandToParkOnSeed(f, [] as ActionId[], "sideL" as PartId), null);
});

test("islandToParkOnSeed: second seed parks the first island", () => {
  const f = fixture();
  const parked = islandToParkOnSeed(f, ["pL"] as ActionId[], "sideR" as PartId);
  assert.ok(parked);
  assert.equal(parked!.id, "sideL");
  assert.deepEqual(parked!.members, ["sideL"]);
});

test("islandToParkOnSeed: does not park when the new seed connects to the active island", () => {
  // A seed that neighbours the active island would merge, not park.
  const f = fixture();
  (f.parts as any).top.seed = true; // pretend top is a seed neighbouring sideL
  assert.equal(islandToParkOnSeed(f, ["pL"] as ActionId[], "top" as PartId), null);
});

// --- Fix B: islandRoot-keyed parking, single-cluster islands, pure helpers ---

// A component with a plain-seed member ("legA") and an islandRoot member
// ("legB") joined together — id selection must prefer the islandRoot member.
function twoMemberFixture(): Furniture {
  const parts = {
    legA: {
      partId: "legA",
      meshName: "legA",
      group: "legA",
      type: "structural",
      cluster: "box",
      seed: true,
      directJoins: ["legB"],
      pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
    },
    legB: {
      partId: "legB",
      meshName: "legB",
      group: "legB",
      type: "structural",
      cluster: "box",
      islandRoot: true,
      pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
    },
  } as any;
  const actions = [
    { actionId: "pA", type: "placePart", partId: "legA", stage: 1, order: 1, requires: [] },
    { actionId: "pB", type: "placePart", partId: "legB", stage: 1, order: 2, requires: [] },
  ] as any;
  const labels = { legA: { standard: "Leg A" }, legB: { standard: "Leg B" } } as any;
  const clusters = { box: { label: "Cabinet" } } as any;
  return { meta: { id: "TEST2" }, parts, actions, labels, clusters } as unknown as Furniture;
}

// Two independent clusters ("box" and "drawer"), each with its own islandRoot
// seed, and no liaisons between them.
function twoClusterFixture(): Furniture {
  const parts = {
    sideL: {
      partId: "sideL",
      meshName: "sideL",
      group: "sidePanelL",
      type: "structural",
      cluster: "box",
      seed: true,
      islandRoot: true,
      pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
    },
    sideR: {
      partId: "sideR",
      meshName: "sideR",
      group: "sidePanelR",
      type: "structural",
      cluster: "box",
      seed: true,
      islandRoot: true,
      pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
    },
    drawerFront: {
      partId: "drawerFront",
      meshName: "drawerFront",
      group: "drawerFront",
      type: "structural",
      cluster: "drawer",
      islandRoot: true,
      pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
    },
  } as any;
  const actions = [
    { actionId: "pL", type: "placePart", partId: "sideL", stage: 1, order: 1, requires: [] },
    { actionId: "pR", type: "placePart", partId: "sideR", stage: 1, order: 2, requires: [] },
    { actionId: "pDF", type: "placePart", partId: "drawerFront", stage: 1, order: 3, requires: [] },
  ] as any;
  const labels = {
    sidePanelL: { standard: "Left side panel" },
    sidePanelR: { standard: "Right side panel" },
    drawerFront: { standard: "Drawer front" },
  } as any;
  const clusters = { box: { label: "Cabinet" }, drawer: { label: "Drawer" } } as any;
  return { meta: { id: "TEST3" }, parts, actions, labels, clusters } as unknown as Furniture;
}

// Same shape as `fixture()` but sideL/sideR are only `seed`, never `islandRoot`
// — models furniture (like DALFRED) with no authored islandRoot flags at all.
function seedOnlyFixture(): Furniture {
  const f = fixture();
  delete (f.parts as any).sideL.islandRoot;
  delete (f.parts as any).sideR.islandRoot;
  return f;
}

test("islandsOf: id prefers islandRoot over a plain seed in the same component", () => {
  const f = twoMemberFixture();
  const islands = islandsOf(f, ["pA", "pB"] as ActionId[]);
  assert.equal(islands.length, 1);
  assert.equal(islands[0].id, "legB");
});

test("islandToParkOnSeed: a new seed in a DIFFERENT cluster does not park (v1 islands are single-cluster)", () => {
  const f = twoClusterFixture();
  const parked = islandToParkOnSeed(f, ["pL"] as ActionId[], "drawerFront" as PartId);
  assert.equal(parked, null);
});

test("islandToParkOnSeed: a new seed in the SAME cluster still parks as before", () => {
  const f = twoClusterFixture();
  const parked = islandToParkOnSeed(f, ["pL"] as ActionId[], "sideR" as PartId);
  assert.ok(parked);
  assert.equal(parked!.id, "sideL");
});

test("parkTriggeredBy: a LONE active part never cards — it degrades at commit instead", () => {
  const f = fixture();
  const result = parkTriggeredBy(
    f,
    ["pL"] as ActionId[],
    "pR" as ActionId,
    [] as ParkedIsland[],
  );
  assert.deepEqual(result, []);
});

test("parkTriggeredBy: a REAL island (part + inserted fastener) cards when unconnected work starts — pure liaison rule, no islandRoot needed", () => {
  const f = seedOnlyFixture();
  const result = parkTriggeredBy(
    f,
    ["pL", "insert_screwL"] as ActionId[],
    "pR" as ActionId,
    [] as ParkedIsland[],
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "sideL");
  assert.deepEqual(result[0].members, ["sideL"]);
  assert.equal(result[0].trigger, "pR");
});

test("isLoneIsland: true for a bare part, false once any attached fastener is inserted", () => {
  const f = fixture();
  assert.equal(isLoneIsland(f, new Set(["pL"] as ActionId[]), { members: ["sideL" as PartId] }), true);
  assert.equal(isLoneIsland(f, new Set(["pL", "insert_screwL"] as ActionId[]), { members: ["sideL" as PartId] }), false);
});

test("degradeLoneIslands: a lone same-cluster part loses its placement when unconnected work commits", () => {
  const f = fixture();
  const completed = degradeLoneIslands(f, ["pL", "pR"] as ActionId[], [], "sideR" as PartId);
  assert.deepEqual(completed, ["pR"]);
});

test("degradeLoneIslands: a part with a realized fastener connection is a REAL island — protected", () => {
  const f = fixture();
  const completed = degradeLoneIslands(
    f,
    ["pL", "insert_screwL", "pR"] as ActionId[],
    [],
    "sideR" as PartId,
  );
  assert.deepEqual(completed, ["pL", "insert_screwL", "pR"]);
});

test("degradeLoneIslands: cross-cluster lone parts are untouched (v1 islands are per-cluster)", () => {
  const f = twoClusterFixture();
  const completed = degradeLoneIslands(f, ["pL", "pDF"] as ActionId[], [], "drawerFront" as PartId);
  assert.deepEqual(completed, ["pL", "pDF"]);
});

test("parkTriggeredBy: inert for an ordinary (non-seed, non-islandRoot) placePart", () => {
  const f = fixture();
  const parked: ParkedIsland[] = [];
  const result = parkTriggeredBy(
    f,
    ["pL", "pR"] as ActionId[],
    "pT" as ActionId,
    parked,
  );
  assert.deepEqual(result, parked);
});

test("parkTriggeredBy: does not double-add an island whose id is already parked", () => {
  const f = fixture();
  const already: ParkedIsland[] = [
    { id: "sideL" as PartId, members: ["sideL"] as PartId[], trigger: "pX" as ActionId },
  ];
  const result = parkTriggeredBy(f, ["pL"] as ActionId[], "pR" as ActionId, already);
  assert.equal(result.length, 1);
  assert.equal(result[0].trigger, "pX");
});

test("unparkAfterUndo: removes exactly the entry matching the undone trigger", () => {
  const f = fixture();
  const parked: ParkedIsland[] = [
    { id: "sideL" as PartId, members: ["sideL"] as PartId[], trigger: "pR" as ActionId },
  ];
  const result = unparkAfterUndo(f, ["pL"] as ActionId[], "pR" as ActionId, parked);
  assert.deepEqual(result, []);
});

test("unparkAfterUndo: an unrelated undo leaves entries intact", () => {
  const f = fixture();
  const parked: ParkedIsland[] = [
    { id: "sideL" as PartId, members: ["sideL"] as PartId[], trigger: "pR" as ActionId },
  ];
  const result = unparkAfterUndo(f, ["pL", "pR"] as ActionId[], "pT" as ActionId, parked);
  assert.deepEqual(result, parked);
});

test("unparkAfterUndo: drops an entry whose member is no longer placed", () => {
  const f = fixture();
  const parked: ParkedIsland[] = [
    { id: "sideL" as PartId, members: ["sideL"] as PartId[], trigger: "pR" as ActionId },
  ];
  const result = unparkAfterUndo(f, [] as ActionId[], "someOtherAction" as ActionId, parked);
  assert.deepEqual(result, []);
});

test("unparkAfterUndo: with two parked islands, undoing island B's trigger removes only B and leaves island A intact", () => {
  const f = fixture();
  const parked: ParkedIsland[] = [
    { id: "sideL" as PartId, members: ["sideL"] as PartId[], trigger: "pA" as ActionId },
    { id: "sideR" as PartId, members: ["sideR"] as PartId[], trigger: "pB" as ActionId },
  ];
  // Both members remain placed after the undo — only pB's trigger should be
  // pulled from `parked`, proving unparkAfterUndo matches by `trigger`, not
  // by position or by clearing everything.
  const result = unparkAfterUndo(f, ["pL", "pR"] as ActionId[], "pB" as ActionId, parked);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "sideL");
  assert.equal(result[0].trigger, "pA");
  assert.ok(!result.some((p) => p.id === "sideR"));
});
