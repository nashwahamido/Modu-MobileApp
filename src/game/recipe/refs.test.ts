// src/game/recipe/refs.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { PARTS } from "@/src/game/content/furnitures/EKET/parts.gen";
import { expandRef, expandRefs } from "./refs";

test("a plain action id passes through as a one-element expansion", () => {
  assert.deepEqual(expandRef("place_backPanel", PARTS), ["place_backPanel"]);
});

test("tighten-group expands to every instance's tighten action", () => {
  const ids = expandRef("tighten-group:cam139434", PARTS);
  assert.equal(ids.length, 8);
  assert.ok(ids.includes("tighten_cam139434_1" as never) && ids.includes("tighten_cam139434_8" as never));
});

test("place-group and place-cluster expand to place actions", () => {
  assert.equal(expandRef("place-group:dowel145572", PARTS).length, 4);
  const cabinet = expandRef("place-cluster:cabinet", PARTS);
  assert.ok(cabinet.every((id) => id.startsWith("place_")));
  assert.ok(cabinet.length > 0);
});

test("a ref matching nothing throws with the ref named", () => {
  assert.throws(() => expandRef("tighten-group:nosuchgroup", PARTS), /nosuchgroup/);
});

test("expandRefs concatenates in order", () => {
  const out = expandRefs(["place_backPanel", "tighten-group:dowel145572"], PARTS);
  assert.equal(out.length, 5);
  assert.equal(out[0], "place_backPanel");
});
