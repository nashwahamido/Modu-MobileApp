import { test } from "node:test";
import assert from "node:assert/strict";
import { trsToMat4, mulMat4, transformPoint, parentIndex, worldMatrix } from "../lib/gltf.mjs";

test("trsToMat4 translates and rotates", () => {
  // 90° about Z: x-axis -> y-axis, then translate +1 x
  const q = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
  const m = trsToMat4([1, 0, 0], q, [1, 1, 1]);
  const p = transformPoint(m, [1, 0, 0]);
  assert.ok(Math.abs(p[0] - 1) < 1e-6 && Math.abs(p[1] - 1) < 1e-6 && Math.abs(p[2]) < 1e-6);
});

test("worldMatrix composes parent chain", () => {
  const json = { nodes: [
    { name: "p", translation: [1, 0, 0], children: [1] },
    { name: "c", translation: [0, 2, 0] },
  ]};
  const parents = parentIndex(json);
  assert.equal(parents.get(1), 0);
  const w = worldMatrix(json, 1, parents);
  assert.deepEqual(transformPoint(w, [0, 0, 0]).map((v) => +v.toFixed(6)), [1, 2, 0]);
});

test("mulMat4 identity", () => {
  const I = trsToMat4();
  const m = trsToMat4([3, 4, 5]);
  assert.deepEqual(mulMat4(I, m), m);
});
