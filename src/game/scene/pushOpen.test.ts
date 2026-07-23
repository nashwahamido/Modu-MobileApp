import { test } from "node:test";
import assert from "node:assert/strict";
import { createDriverRegistry } from "./offsetDriver";
import { setTravel } from "./pushOpen";
import type { PushOpenSpec } from "@/src/game/core/type";

const SPEC = {
  axis: [1, 0, 0],
  distance: 0.16,
  testActionIds: { "1": "test_drawerA", "2": "test_drawerB" },
  groups: [
    { level: "1", ratio: 1, parts: ["box"] },
    { level: "1", ratio: 0.5, parts: ["middle"] },
    { level: "2", ratio: 1, parts: ["box2"] },
  ],
} as unknown as PushOpenSpec;

test("a travel offset reaches the ratio-1 group in full", () => {
  const reg = createDriverRegistry();
  setTravel(SPEC, reg, "1", 0.16);
  assert.deepEqual(reg.get("push:1:1").value, [0.16, 0, 0]);
});

test("the ratio-0.5 group travels at half", () => {
  const reg = createDriverRegistry();
  setTravel(SPEC, reg, "1", 0.16);
  assert.deepEqual(reg.get("push:1:0.5").value, [0.08, 0, 0]);
});

test("another level is untouched", () => {
  const reg = createDriverRegistry();
  setTravel(SPEC, reg, "1", 0.16);
  assert.deepEqual(reg.get("push:2:1").value, [0, 0, 0]);
});

test("travel back to zero returns every group of the level to rest", () => {
  const reg = createDriverRegistry();
  setTravel(SPEC, reg, "1", 0.16);
  setTravel(SPEC, reg, "1", 0);
  assert.deepEqual(reg.get("push:1:1").value, [0, 0, 0]);
  assert.deepEqual(reg.get("push:1:0.5").value, [0, 0, 0]);
});
