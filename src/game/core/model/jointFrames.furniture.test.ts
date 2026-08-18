// Guard that the joint derivation stays AUTOMATIC. Auto-discovers every shipped furniture GLB and re-measures the four invariants the design was validated on, so a newly onboarded furniture that would need hand-authored anchors fails here — named — instead of silently degrading the drag to the old visual-center heuristic.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { applyStructure, buildLiaisons } from "./liaisons";
import { boxCenter, clampIntoBox, deriveJointFrames, partAnchorOffsets, CONTACT_EXPANSION_M } from "./jointFrames";
import type { PartBox, Vec3 } from "@/src/game/core/type";

const MODELS = path.join(process.cwd(), "src", "assets", "models", "furnitures");
const CONTENT = path.join(process.cwd(), "src", "game", "content", "furnitures");
/** Sub-millimetre agreement was measured on all four shipped furnitures (worst 1.04mm); 2mm leaves room for hand-repaired geometry without letting a wrong coordinate space through. */
const CENTER_TOLERANCE_M = 0.002;

const FURNITURES = fs
  .readdirSync(MODELS, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(MODELS, d.name, `${d.name}.glb`)) && fs.existsSync(path.join(CONTENT, d.name, "parts.gen.ts")))
  .map((d) => d.name);

function parseGlb(file: string) {
  const b = fs.readFileSync(file);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString("utf8"));
  const off = 20 + jsonLen;
  return { json, bin: b.subarray(off + 8, off + 8 + b.readUInt32LE(off)) };
}

function readPositions(json: any, bin: Buffer, ai: number): Vec3[] {
  const acc = json.accessors[ai];
  const bv = json.bufferViews[acc.bufferView];
  const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const stride = bv.byteStride ?? 12;
  const out: Vec3[] = new Array(acc.count);
  for (let i = 0; i < acc.count; i++) {
    const o = base + i * stride;
    out[i] = [bin.readFloatLE(o), bin.readFloatLE(o + 4), bin.readFloatLE(o + 8)];
  }
  return out;
}

const rotQ = ([x, y, z, w]: number[], [vx, vy, vz]: Vec3): Vec3 => {
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
};

/** World-space bounds per GLB node name — the same quantity the runtime harvest must produce from Filament. Assumes a FLAT node hierarchy (each mesh node's own TRS is its world transform), which holds by this project's export convention; a nested node under a transforming parent is self-detecting rather than silent, because the box computed here would then miss the parent's contribution and its centre would disagree with visualCenterOffset, failing R1 by name. */
function glbBoxes(file: string): Record<string, PartBox> {
  const { json, bin } = parseGlb(file);
  const out: Record<string, PartBox> = {};
  for (const n of json.nodes ?? []) {
    if (!n.name || n.mesh == null) continue;
    const t = n.translation ?? [0, 0, 0];
    const q = n.rotation ?? [0, 0, 0, 1];
    const s = n.scale ?? [1, 1, 1];
    const min: number[] = [Infinity, Infinity, Infinity];
    const max: number[] = [-Infinity, -Infinity, -Infinity];
    let any = false;
    for (const prim of json.meshes[n.mesh].primitives) {
      if (prim.attributes.POSITION == null) continue;
      for (const v of readPositions(json, bin, prim.attributes.POSITION)) {
        const r = rotQ(q, [v[0] * s[0], v[1] * s[1], v[2] * s[2]]);
        const w: Vec3 = [r[0] + t[0], r[1] + t[1], r[2] + t[2]];
        any = true;
        for (let k = 0; k < 3; k++) {
          if (w[k] < min[k]) min[k] = w[k];
          if (w[k] > max[k]) max[k] = w[k];
        }
      }
    }
    if (any) out[n.name] = { min: [min[0], min[1], min[2]], max: [max[0], max[1], max[2]] };
  }
  return out;
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// This file exists to fail when a furniture needs hand-authoring, so a scan that silently finds NOTHING — reporting zero tests and exiting 0 — is the exact failure it is meant to prevent. Newly onboarded furnitures are still picked up with no edit here; these four are the measured baseline and must never vanish quietly.
test("furniture discovery found the measured baseline", () => {
  assert.ok(FURNITURES.length > 0, `no furnitures discovered under ${MODELS} — the path constants have drifted`);
  for (const expected of ["LACK", "DALFRED", "BEKVAM", "EKET"]) {
    assert.ok(FURNITURES.includes(expected), `baseline furniture ${expected} was not discovered; found: ${FURNITURES.join(", ") || "(none)"}`);
  }
});

for (const F of FURNITURES) {
  test(`${F}: joint frames derive automatically`, async () => {
    const { PARTS } = await import(`@/src/game/content/furnitures/${F}/parts.gen`);
    const { STRUCTURE } = await import(`@/src/game/content/furnitures/${F}/authored`);
    const parts = applyStructure(PARTS, STRUCTURE);
    const liaisons = buildLiaisons(parts);
    const named = glbBoxes(path.join(MODELS, F, `${F}.glb`));

    const boxes: Record<string, PartBox> = {};
    for (const p of Object.values(parts)) if (named[p.meshName]) boxes[p.partId] = named[p.meshName];

    assert.ok(Object.keys(boxes).length > 0, `${F}: no part matched a GLB node by meshName — the mesh names have drifted from parts.gen.ts`);

    // R1 — this test's own GLB parser agrees with the extractor: the box centre lands on pose.position + visualCenterOffset. It does NOT validate the RUNTIME coordinate space, because visualCenterOffset is itself derived from the same GLB by src/game/helper-scripts/read-parts.mjs — both sides here read the file. What Filament actually hands back at runtime is checked by the AssemblyScene harvest's validation gate, which refuses to publish boxes that fail this same comparison.
    for (const p of Object.values(parts)) {
      const b = boxes[p.partId];
      if (!b) continue;
      const vco = p.visualCenterOffset ?? [0, 0, 0];
      const expect: Vec3 = [p.pose.position[0] + vco[0], p.pose.position[1] + vco[1], p.pose.position[2] + vco[2]];
      const d = dist(boxCenter(b), expect);
      assert.ok(d <= CENTER_TOLERANCE_M, `${F}/${p.partId}: box center is ${(d * 1000).toFixed(2)}mm from pose+visualCenterOffset (tolerance ${CENTER_TOLERANCE_M * 1000}mm)`);
    }

    // R2 — every liaison whose endpoints both have geometry resolves to a frame.
    const frames = deriveJointFrames(parts, liaisons, boxes);
    const resolvable = Object.values(liaisons).filter((l) => boxes[l.a] && boxes[l.b]);
    const missing = resolvable.filter((l) => !frames[l.id]).map((l) => `${l.a}~${l.b}`);
    assert.equal(missing.length, 0, `${F}: ${missing.length} liaison(s) yielded no joint frame: ${missing.join(", ")}`);

    // R3 — every DRAGGABLE structural part resolves an anchor with no hand authoring.
    const offsets = partAnchorOffsets(parts, liaisons, frames);
    const unanchored = Object.values(parts)
      .filter((p) => p.type === "structural" && !offsets[p.partId])
      .map((p) => p.partId);
    assert.equal(unanchored.length, 0, `${F}: structural part(s) need a hand-authored jointAnchor: ${unanchored.join(", ")}`);

    // R4 — a resolved anchor never floats outside its own part's bounds.
    for (const p of Object.values(parts)) {
      const off = offsets[p.partId];
      const b = boxes[p.partId];
      if (!off || !b || p.jointAnchor) continue;
      const world: Vec3 = [p.pose.position[0] + off[0], p.pose.position[1] + off[1], p.pose.position[2] + off[2]];
      const d = dist(world, clampIntoBox(world, b));
      assert.ok(d <= 1e-6, `${F}/${p.partId}: resolved anchor sits ${(d * 1000).toFixed(2)}mm outside its own bounds`);
    }
  });

  test(`${F}: the contact expansion is not fitted to this furniture`, async () => {
    const { PARTS } = await import(`@/src/game/content/furnitures/${F}/parts.gen`);
    const { STRUCTURE } = await import(`@/src/game/content/furnitures/${F}/authored`);
    const parts = applyStructure(PARTS, STRUCTURE);
    const liaisons = buildLiaisons(parts);
    const named = glbBoxes(path.join(MODELS, F, `${F}.glb`));
    const boxes: Record<string, PartBox> = {};
    for (const p of Object.values(parts)) if (named[p.meshName]) boxes[p.partId] = named[p.meshName];
    const resolvable = Object.values(liaisons).filter((l) => boxes[l.a] && boxes[l.b]).length;

    // Full coverage must hold across the whole safe window, so the constant is a plateau pick and not a per-furniture fit. Anchors are also stable across it: nothing may drift more than a millimetre from the shipped 10mm value.
    const ref = deriveJointFrames(parts, liaisons, boxes);
    for (const e of [0.002, 0.004, 0.008, 0.015, 0.02]) {
      const grown = deriveJointFrames(parts, liaisons, boxes, e);
      assert.equal(Object.keys(grown).length, resolvable, `${F}: coverage broke at expansion ${e * 1000}mm — the constant is fitted, not a plateau`);
      for (const [lid, f] of Object.entries(grown)) {
        const r = ref[lid as never];
        if (!r || f.via !== r.via) continue;
        assert.ok(dist(f.anchor, r.anchor) < 0.001, `${F}/${lid}: anchor drifted ${(dist(f.anchor, r.anchor) * 1000).toFixed(2)}mm at expansion ${e * 1000}mm`);
      }
    }
    assert.equal(CONTACT_EXPANSION_M, 0.01);
  });
}
