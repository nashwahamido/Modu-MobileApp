import { test } from "node:test";
import assert from "node:assert/strict";
import { createIslandDriverRegistry } from "./offsetDriver";

test("registry returns the SAME driver for a repeated id", () => {
  const reg = createIslandDriverRegistry();
  const a = reg.get("sideL");
  const b = reg.get("sideL");
  assert.equal(a, b);
});

test("registry returns DISTINCT drivers for different ids and lists them", () => {
  const reg = createIslandDriverRegistry();
  const a = reg.get("sideL");
  const b = reg.get("sideR");
  assert.notEqual(a, b);
  assert.deepEqual(reg.ids().sort(), ["sideL", "sideR"]);
});

test("driver offset is settable per island", () => {
  const reg = createIslandDriverRegistry();
  const d = reg.get("sideL");
  d.set([0.6, 0, 0]);
  assert.deepEqual(d.value, [0.6, 0, 0]);
});
