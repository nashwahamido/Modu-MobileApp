// One-shot GLB patch: the 8 EKET runner screws (cabinet_screw100349_*) are mounted BACKWARDS in the model — derive-fasteners found each head buried mid-panel and the tip poking into the cabinet (physically: head proud on the frame, tip threaded into the panel). Flips each node 180° about its own shaft CENTRE (screws are rotationally symmetric, so end-swap is the whole fix), keeping the mesh centred where it was. Prints the new pose fragments for parts.gen. Backup of the original GLB goes next to the patched file as EKET.glb.pre-screwflip.
//
// Same caveat as the frameL_1 patch (see memory): the .blend source still has the screws backwards — a re-export reverts this until the source is fixed.
//
//   node src/game/helper-scripts/patch-eket-runner-screws.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { add, analyse, mul, norm, parseGlb, readVec3, rotQ, sub, unit } from "./derive-fasteners.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const GLB = path.join(ROOT, "..", "..", "assets", "models", "furnitures", "EKET", "EKET.glb");
const TARGET = /^cabinet_screw100349_\d+__/;

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// Hamilton product, (x,y,z,w) — qmul(a,b) applies b first, then a (world-side left-multiply)
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qunit = (q) => {
  const n = Math.hypot(...q) || 1;
  return q.map((x) => x / n);
};
const round6 = (v) => v.map((x) => +(+x.toFixed(6)));

const { json, bin } = parseGlb(GLB);
let patched = 0;
for (const nd of json.nodes ?? []) {
  if (!nd.name || nd.mesh == null || !TARGET.test(nd.name)) continue;
  const t = nd.translation ?? [0, 0, 0];
  const q = nd.rotation ?? [0, 0, 0, 1];
  const s = nd.scale ?? [1, 1, 1];

  let verts = [];
  for (const prim of json.meshes[nd.mesh].primitives) {
    if (prim.attributes.POSITION == null) continue;
    verts = verts.concat(readVec3(json, bin, prim.attributes.POSITION));
  }
  const a = analyse(verts);
  if (!a) throw new Error(`${nd.name}: no analysable mesh`);

  const toWorld = (v) => add(rotQ(q, [v[0] * s[0], v[1] * s[1], v[2] * s[2]]), t);
  const axisPoint = (tc) => add(a.centroid, mul(a.axis, tc));
  const cW = toWorld(axisPoint((a.tMin + a.tMax) / 2)); // world shaft centre — the flip's fixed point
  const shaftW = unit(rotQ(q, a.axis));
  // flip axis: any unit ⊥ shaft (cross with the world basis vector least aligned with it)
  const basis = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].sort(
    (x, y) => Math.abs(x[0] * shaftW[0] + x[1] * shaftW[1] + x[2] * shaftW[2]) - Math.abs(y[0] * shaftW[0] + y[1] * shaftW[1] + y[2] * shaftW[2]),
  )[0];
  const u = unit(cross(basis, shaftW));
  const r180 = (v) => sub(mul(u, 2 * (u[0] * v[0] + u[1] * v[1] + u[2] * v[2])), v);

  const qNew = qunit(qmul([u[0], u[1], u[2], 0], q));
  const tNew = add(r180(sub(t, cW)), cW);

  // verify: the head extreme must land where the tip extreme was (and vice versa)
  const toWorldNew = (v) => add(rotQ(qNew, [v[0] * s[0], v[1] * s[1], v[2] * s[2]]), tNew);
  const headOld = toWorld(axisPoint(a.tHead));
  const tipOldT = a.tHead === a.tMax ? a.tMin : a.tMax;
  const tipOld = toWorld(axisPoint(tipOldT));
  const headNew = toWorldNew(axisPoint(a.tHead));
  const errSwap = norm(sub(headNew, tipOld));
  const errCentre = norm(sub(toWorldNew(axisPoint((a.tMin + a.tMax) / 2)), cW));
  if (errSwap > 0.001 || errCentre > 0.0005) {
    throw new Error(`${nd.name}: flip verification failed (swap ${(errSwap * 1000).toFixed(2)}mm, centre ${(errCentre * 1000).toFixed(2)}mm)`);
  }

  nd.translation = round6(tNew);
  nd.rotation = round6(qNew);
  patched++;
  console.log(
    `${nd.name}\n  head ${JSON.stringify(round6(headOld))} → ${JSON.stringify(round6(headNew))}\n  parts.gen: "pose":{"position":${JSON.stringify(round6(tNew))},"rotation":${JSON.stringify(round6(qNew))}}`,
  );
}
if (patched !== 8) throw new Error(`expected 8 runner screws, patched ${patched}`);

// rebuild the GLB container (JSON chunk resized; BIN unchanged)
const backup = GLB.replace(/\.glb$/, ".glb.pre-screwflip");
if (!fs.existsSync(backup)) fs.copyFileSync(GLB, backup);
let jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
if (jsonPad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);
let binBuf = Buffer.from(bin);
const binPad = (4 - (binBuf.length % 4)) % 4;
if (binPad) binBuf = Buffer.concat([binBuf, Buffer.alloc(binPad)]);
const total = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
const out = Buffer.alloc(total);
out.writeUInt32LE(0x46546c67, 0);
out.writeUInt32LE(2, 4);
out.writeUInt32LE(total, 8);
out.writeUInt32LE(jsonBuf.length, 12);
out.writeUInt32LE(0x4e4f534a, 16);
jsonBuf.copy(out, 20);
const bo = 20 + jsonBuf.length;
out.writeUInt32LE(binBuf.length, bo);
out.writeUInt32LE(0x004e4942, bo + 4);
binBuf.copy(out, bo + 8);
fs.writeFileSync(GLB, out);
console.log(`\npatched ${patched} nodes → ${GLB} (backup: ${path.basename(backup)})`);
