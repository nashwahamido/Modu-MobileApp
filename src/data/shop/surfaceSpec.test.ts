import assert from "node:assert/strict";
import test from "node:test";

import { parseSurfaceSpec } from "./surfaceSpec";

// A conforming public.item_surfaces row (migration 017). Fixtures override individual columns from this so a test names only what it is actually about.
const row = (over: Record<string, unknown> = {}) => ({
  scale_x: 3,
  scale_y: 3,
  offset_x: 0,
  offset_y: 0,
  has_normal: false,
  has_rough: false,
  edge_r: null,
  edge_g: null,
  edge_b: null,
  has_trim: false,
  has_trim_normal: false,
  has_trim_rough: false,
  trim_scale_x: null,
  trim_scale_y: null,
  trim_offset_x: null,
  trim_offset_y: null,
  ...over,
});

test("a minimal row becomes tiling plus the base colour, and nothing else", () => {
  const spec = parseSurfaceSpec(row());
  assert.deepEqual(spec, { tiling: { scale: [3, 3], offset: [0, 0] }, maps: ["texture"] });
  assert.equal("edgeColor" in (spec as object), false);
  assert.equal("trimTiling" in (spec as object), false);
});

test("a full floor row round-trips every group", () => {
  const spec = parseSurfaceSpec(
    row({
      scale_x: 3, scale_y: 3, offset_x: 0.5, offset_y: -4,
      has_normal: true, has_rough: true,
      edge_r: 0.696, edge_g: 0.508, edge_b: 0.338,
      has_trim: true, has_trim_normal: true, has_trim_rough: false,
      trim_scale_x: 6, trim_scale_y: 6, trim_offset_x: 0, trim_offset_y: 0,
    }),
  );
  assert.deepEqual(spec, {
    tiling: { scale: [3, 3], offset: [0.5, -4] },
    maps: ["texture", "normal", "rough", "trim_texture", "trim_normal"],
    edgeColor: [0.696, 0.508, 0.338],
    trimTiling: { scale: [6, 6], offset: [0, 0] },
  });
});

test("the maps list only ever grows from the booleans, so an unknown map name is unrepresentable", () => {
  const spec = parseSurfaceSpec(row({ has_normal: true }));
  assert.deepEqual(spec?.maps, ["texture", "normal"]);
});

test("a missing row is not an error — it reads as an item with no surface data", () => {
  for (const raw of [undefined, null, "nonsense", 7, [], [row()]]) {
    assert.equal(parseSurfaceSpec(raw), undefined, `${JSON.stringify(raw)} should yield undefined`);
  }
});

test("tiling is required, because guessing it would render a floor at an arbitrary size that looks deliberate", () => {
  for (const over of [
    { scale_x: null },
    { scale_y: undefined },
    { scale_x: "not a number" },
    { scale_x: 0 },
    { scale_y: -2 },
    { scale_x: Number.NaN },
  ]) {
    assert.equal(parseSurfaceSpec(row(over)), undefined, `${JSON.stringify(over)} should yield undefined`);
  }
});

test("a numeric arriving as a string is accepted, but a blank one is not — Number('') is 0 and would collapse the floor onto one texel", () => {
  assert.deepEqual(parseSurfaceSpec(row({ scale_x: "5.1", scale_y: "5" }))?.tiling.scale, [5.1, 5]);
  assert.equal(parseSurfaceSpec(row({ scale_x: "" })), undefined);
  assert.equal(parseSurfaceSpec(row({ scale_x: "   " })), undefined);
});

test("a missing offset defaults to zero rather than dropping the row", () => {
  assert.deepEqual(parseSurfaceSpec(row({ offset_x: null, offset_y: undefined }))?.tiling.offset, [0, 0]);
});

test("a half-written plinth colour is dropped as a group, and costs the floor nothing else", () => {
  for (const over of [
    { edge_r: 0.5, edge_g: 0.5, edge_b: null },
    { edge_r: 0.5, edge_g: null, edge_b: 0.5 },
    { edge_r: 0.5, edge_g: 0.5, edge_b: 1.5 },
    { edge_r: -0.1, edge_g: 0.5, edge_b: 0.5 },
  ]) {
    const spec = parseSurfaceSpec(row(over));
    assert.equal(spec?.edgeColor, undefined, `${JSON.stringify(over)} should drop edgeColor`);
    assert.deepEqual(spec?.tiling.scale, [3, 3], "the rest of the spec must survive");
  }
});

test("has_trim without a trim scale drops the cornice entirely rather than applying it at the slab's scale", () => {
  const spec = parseSurfaceSpec(row({ has_trim: true, has_trim_normal: true, trim_scale_x: null, trim_scale_y: null }));
  assert.equal(spec?.trimTiling, undefined);
  assert.deepEqual(spec?.maps, ["texture"], "no trim map may be listed without the tiling to place it");
});

test("trim maps are ignored unless has_trim is set", () => {
  const spec = parseSurfaceSpec(row({ has_trim: false, has_trim_normal: true, has_trim_rough: true, trim_scale_x: 6, trim_scale_y: 6 }));
  assert.deepEqual(spec?.maps, ["texture"]);
  assert.equal(spec?.trimTiling, undefined);
});
