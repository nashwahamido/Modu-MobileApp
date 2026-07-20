import { test } from "node:test";
import assert from "node:assert/strict";
import { shaftOf, headSignOf, buildInventory } from "../lib/inspect.mjs";

test("shaftOf picks longest axis + aspect", () => {
  const r = shaftOf([0.012, 0.0415, 0.012]);
  assert.equal(r.axis, 1);
  assert.ok(Math.abs(r.aspect - 0.0415 / 0.012) < 1e-9);
});

test("headSignOf: bulky end wins", () => {
  // shaft along Y: thin at -Y (r=0.1), wide head at +Y (r=0.5)
  const verts = [];
  for (const [y, r] of [[-1, 0.1], [1, 0.5]])
    for (let k = 0; k < 8; k++)
      verts.push([r * Math.cos(k), y, r * Math.sin(k)]);
  assert.equal(headSignOf(verts, 1), 1);
});

test("buildInventory: world dims through a parent, article extraction", () => {
  // one triangle mesh, child of a translated parent
  const positions = [[0, 0, 0], [0.1, 0, 0], [0, 0.02, 0]];
  const bin = Buffer.alloc(positions.length * 12);
  positions.forEach((v, i) => v.forEach((c, j) => bin.writeFloatLE(c, i * 12 + j * 4)));
  const json = {
    accessors: [{ bufferView: 0, count: 3, type: "VEC3", componentType: 5126 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.length }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [
      { name: "root", translation: [1, 0, 0], children: [1] },
      { name: "110519_03", mesh: 0 },
    ],
  };
  const inv = buildInventory(json, bin, "test.glb");
  assert.equal(inv.count, 1);
  const n = inv.nodes[0];
  assert.equal(n.article, "110519");
  assert.equal(n.parent, "root");
  assert.ok(Math.abs(n.worldMin[0] - 1) < 1e-6); // parent translation applied
  assert.equal(n.shaftAxisLocal, "X");
});
