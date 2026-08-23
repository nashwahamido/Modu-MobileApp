import { test } from "node:test";
import assert from "node:assert/strict";
import { actionableGroups } from "./availability";
import type { AssemblyAction, Furniture } from "@/src/game/core/type";

const F = {
  parts: {
    screwA: { partId: "screwA", group: "camScrew" },
    screwB: { partId: "screwB", group: "camScrew" },
    sideL: { partId: "sideL", group: "side" },
    orphan: { partId: "orphan" },
  },
} as unknown as Furniture;

const act = (actionId: string, partId?: string, type = "placePart"): AssemblyAction =>
  ({ actionId, partId, type }) as unknown as AssemblyAction;

test("eight tightens of one group count as one way", () => {
  const actions = Array.from({ length: 8 }, (_, i) =>
    act(`t${i}`, i % 2 ? "screwA" : "screwB", "tightenFastener"),
  );
  assert.deepEqual(actionableGroups(F, actions), ["camScrew"]);
});

test("insert and tighten of one group collapse to one way", () => {
  const actions = [
    act("i1", "screwA", "insertFastener"),
    act("t1", "screwA", "tightenFastener"),
  ];
  assert.deepEqual(actionableGroups(F, actions), ["camScrew"]);
});

test("distinct groups each count once, in first-seen order", () => {
  const actions = [
    act("p1", "sideL"),
    act("t1", "screwA", "tightenFastener"),
    act("p2", "sideL"),
  ];
  assert.deepEqual(actionableGroups(F, actions), ["side", "camScrew"]);
});

test("actions with no partId name nothing and are skipped", () => {
  assert.deepEqual(actionableGroups(F, [act("c1", undefined, "combineClusters")]), []);
});

test("a partId with no group on its part is skipped", () => {
  assert.deepEqual(actionableGroups(F, [act("p1", "orphan")]), []);
});

test("an empty action list offers no ways", () => {
  assert.deepEqual(actionableGroups(F, []), []);
});
