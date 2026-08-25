import assert from "node:assert/strict";
import test from "node:test";

import { applySurfaceItem } from "./applySurfaceItem";
import { SHELL_GROUPS } from "./shellMaterials";

type Call = { method: string; args: unknown[] };

function fakeInstances(names: readonly string[]) {
  const calls: Call[] = [];
  const instances: Record<string, unknown> = {};
  for (const name of names) {
    instances[name] = {
      setTextureParameter: (...args: unknown[]) => calls.push({ method: `${name}.setTextureParameter`, args }),
      setMat3fParameter: (...args: unknown[]) => calls.push({ method: `${name}.setMat3fParameter`, args }),
      setFloat4Parameter: (...args: unknown[]) => calls.push({ method: `${name}.setFloat4Parameter`, args }),
    };
  }
  return { instances, calls };
}

const ALL = [...SHELL_GROUPS.slab, ...SHELL_GROUPS.cornice, ...SHELL_GROUPS.walls, "FloorEdge", "Ceiling"];
// The inner cast, not an outer one on the whole literal, so `TEX.base` stays a legal property access (property access on a value already typed `never` is a type error) while the fake stand-in still satisfies the real `Texture` shape wherever it is passed.
const TEX = { base: { width: 1, height: 1 } as never };
// setTextureParameter takes the renderable manager as its FIRST argument — it is what holds the texture alive past the material instance wrapper's own life (see the Task 6 patch). Never called on directly here, so a bare stand-in is enough.
const RM = {} as never;
// The stand-ins for slots the item does not fill. Distinct objects from TEX.base so an assertion can tell "the item's own map" apart from "the neutral that replaced a missing one" — the whole bug was the two being confused with the PREVIOUS item's map.
const NEUTRAL = {
  normal: { width: 1, height: 1 } as never,
  rough: { width: 1, height: 1 } as never,
};

test("a wall item writes all four wall materials and nothing else", () => {
  const { instances, calls } = fakeInstances(ALL);
  applySurfaceItem({
    slot: "wall",
    instances: instances as never,
    renderableManager: RM,
    neutral: null,
    maps: TEX,
    spec: { tiling: { scale: [1, 1], offset: [0, 0] }, maps: ["texture"] },
  });
  const touched = new Set(calls.map((c) => c.method.split(".")[0]));
  assert.deepEqual([...touched].sort(), [...SHELL_GROUPS.walls].sort());
});

test("Ceiling is never touched", () => {
  const { instances, calls } = fakeInstances(ALL);
  applySurfaceItem({
    slot: "floor",
    instances: instances as never,
    renderableManager: RM,
    neutral: null,
    maps: TEX,
    spec: { tiling: { scale: [1, 1], offset: [0, 0] }, edgeColor: [0.5, 0.5, 0.5], maps: ["texture"] },
  });
  assert.equal(calls.some((c) => c.method.startsWith("Ceiling")), false);
});

test("FloorEdge takes a tint and no texture", () => {
  const { instances, calls } = fakeInstances(ALL);
  applySurfaceItem({
    slot: "floor",
    instances: instances as never,
    renderableManager: RM,
    neutral: null,
    maps: TEX,
    spec: { tiling: { scale: [1, 1], offset: [0, 0] }, edgeColor: [0.2, 0.3, 0.4], maps: ["texture"] },
  });
  const edge = calls.filter((c) => c.method.startsWith("FloorEdge"));
  assert.deepEqual(edge.map((c) => c.method), ["FloorEdge.setFloat4Parameter"]);
  assert.deepEqual(edge[0].args, ["baseColorFactor", [0.2, 0.3, 0.4, 1]]);
});

test("the cornice is left alone when the item ships no trim maps", () => {
  const { instances, calls } = fakeInstances(ALL);
  applySurfaceItem({
    slot: "wall",
    instances: instances as never,
    renderableManager: RM,
    neutral: null,
    maps: TEX,
    spec: { tiling: { scale: [1, 1], offset: [0, 0] }, maps: ["texture"] },
  });
  assert.equal(calls.some((c) => SHELL_GROUPS.cornice.includes(c.method.split(".")[0])), false);
});

// The regression this pins: the cornice moved from the floor path to the wall path on 2026-08-10 (it sits at the wall/ceiling junction and follows the wallpaper, not the rug). A floor item is never the one that paints it, even if its spec somehow carries a `trim` map set — that shape simply cannot arise from a real floor item post-migration, but the renderer must not depend on that being true.
test("the cornice paints only on the wall path, never the floor path, regardless of what maps.trim carries", () => {
  const { instances, calls } = fakeInstances(ALL);
  applySurfaceItem({
    slot: "floor",
    instances: instances as never,
    renderableManager: RM,
    neutral: null,
    maps: { base: TEX.base, trim: TEX.base } as never,
    spec: {
      tiling: { scale: [1, 1], offset: [0, 0] },
      trimTiling: { scale: [2, 2], offset: [0, 0] },
      maps: ["texture", "trim_texture"],
    },
  });
  assert.equal(calls.some((c) => SHELL_GROUPS.cornice.includes(c.method.split(".")[0])), false, "the floor path must never touch the cornice group");
});

test("baseColorUvMatrix is column-major: scale on the diagonal, offset in the last column", () => {
  const { instances, calls } = fakeInstances(ALL);
  // Non-square scale and a non-zero offset on purpose — these are the room floor's real authored tiling values, and a symmetric fixture like scale [1,1] offset [0,0] is invariant under transposition (or under swapping scale and offset) and would pass even a broken uvMatrix, so it would prove nothing here.
  applySurfaceItem({
    slot: "floor",
    instances: instances as never,
    renderableManager: RM,
    neutral: null,
    maps: TEX,
    spec: { tiling: { scale: [5.1, 5], offset: [0, -4] }, maps: ["texture"] },
  });
  // All THREE slot matrices, not just base colour: gltfio keeps one per texture slot, so writing only baseColorUvMatrix leaves the normal and roughness maps at raw UV0 and the grain ends up at a different scale from its own bump detail.
  const matrix = [5.1, 0, 0, 0, 5, 0, 0, -4, 1];
  assert.deepEqual(
    calls.filter((c) => c.method === "Floor.setMat3fParameter").map((c) => c.args),
    [
      ["baseColorUvMatrix", matrix],
      ["normalUvMatrix", matrix],
      ["metallicRoughnessUvMatrix", matrix],
    ],
  );
});

test("the uv matrices are written even for a map the item did not ship, so a stale one cannot misplace the next item", () => {
  const { instances, calls } = fakeInstances(ALL);
  applySurfaceItem({
    slot: "wall",
    instances: instances as never,
    renderableManager: RM,
    neutral: null,
    // Base colour only — no normal, no roughness.
    maps: TEX,
    spec: { tiling: { scale: [2, 2], offset: [0, 0] }, maps: ["texture"] },
  });
  const written = calls.filter((c) => c.method === "Wall_xmin.setMat3fParameter").map((c) => c.args[0]);
  assert.deepEqual(written, ["baseColorUvMatrix", "normalUvMatrix", "metallicRoughnessUvMatrix"]);
});

test("occlusionUvMatrix is never written — the baked AO has its own UV set and must not be retiled", () => {
  const { instances, calls } = fakeInstances(ALL);
  applySurfaceItem({
    slot: "floor",
    instances: instances as never,
    renderableManager: RM,
    neutral: null,
    maps: TEX,
    spec: { tiling: { scale: [3, 3], offset: [0, 0] }, maps: ["texture"] },
  });
  assert.equal(calls.some((c) => c.args.includes("occlusionUvMatrix")), false);
});

// THE REGRESSION THIS PINS. Filament keeps a texture HANDLE on the material and has no API to unset one, so a slot the incoming item does not write keeps sampling the OUTGOING item's map: apply a wallpaper with real weave in its normal, then a flat paint that ships none, and the paint wears the weave. The portal SKIPS publishing a map whose variance is below threshold, so an item with no normal is the ordinary case rather than a corner one. Every slot is therefore written on every apply, exactly as the UV matrices already were.
test("an absent normal or roughness is written with the neutral stand-in, so the previous item's map cannot persist", () => {
  const { instances, calls } = fakeInstances(ALL);
  applySurfaceItem({
    slot: "wall",
    instances: instances as never,
    renderableManager: RM,
    neutral: NEUTRAL,
    // Base colour only — exactly the item that used to leave its predecessor's bump and gloss behind.
    maps: TEX,
    spec: { tiling: { scale: [1, 1], offset: [0, 0] }, maps: ["texture"] },
  });
  const written = calls.filter((c) => c.method === "Wall_xmin.setTextureParameter");
  assert.deepEqual(
    written.map((c) => [c.args[1], c.args[2]]),
    [
      ["baseColorMap", TEX.base],
      ["normalMap", NEUTRAL.normal],
      ["metallicRoughnessMap", NEUTRAL.rough],
    ],
  );
});

test("an item's own maps always win over the neutral stand-ins", () => {
  const { instances, calls } = fakeInstances(ALL);
  const own = { normal: { width: 2, height: 2 } as never, rough: { width: 2, height: 2 } as never };
  applySurfaceItem({
    slot: "wall",
    instances: instances as never,
    renderableManager: RM,
    neutral: NEUTRAL,
    maps: { base: TEX.base, normal: own.normal, rough: own.rough },
    spec: { tiling: { scale: [1, 1], offset: [0, 0] }, maps: ["texture"] },
  });
  const written = calls.filter((c) => c.method === "Wall_xmin.setTextureParameter");
  assert.deepEqual(written.map((c) => c.args[2]), [TEX.base, own.normal, own.rough]);
});

// The cornice is painted through the same `paint` as the walls and the slab, so it inherits the fix rather than needing its own. A trim map set with no normal of its own must not pick up the last wallpaper's.
test("the cornice fills its absent slots from the neutrals too", () => {
  const { instances, calls } = fakeInstances(ALL);
  applySurfaceItem({
    slot: "wall",
    instances: instances as never,
    renderableManager: RM,
    neutral: NEUTRAL,
    maps: { base: TEX.base, trim: { base: TEX.base } } as never,
    spec: { tiling: { scale: [1, 1], offset: [0, 0] }, maps: ["texture", "trim_texture"] },
  });
  const written = calls.filter((c) => c.method === "Trim_xmin.setTextureParameter");
  assert.deepEqual(
    written.map((c) => [c.args[1], c.args[2]]),
    [
      ["baseColorMap", TEX.base],
      ["normalMap", NEUTRAL.normal],
      ["metallicRoughnessMap", NEUTRAL.rough],
    ],
  );
});

// The degraded path, and it is deliberately still the OLD behaviour: the stand-ins are decoded asynchronously, so for the first frames of a scene — or on a dev client where FilamentProxy never installs — there is nothing to write. Leaving the slot alone is wrong in the old way; writing null would be a crash. This test exists so that trade-off stays a decision rather than an accident.
test("with no neutrals available a missing map leaves its slot untouched, exactly as before", () => {
  const withAll = fakeInstances(ALL);
  applySurfaceItem({
    slot: "wall",
    instances: withAll.instances as never,
    renderableManager: RM,
    neutral: null,
    maps: { base: TEX.base, normal: TEX.base, rough: TEX.base },
    spec: { tiling: { scale: [1, 1], offset: [0, 0] }, maps: ["texture"] },
  });
  const wallTextureCalls = withAll.calls.filter((c) => c.method === "Wall_xmin.setTextureParameter");
  assert.deepEqual(
    wallTextureCalls.map((c) => c.args[1]),
    ["baseColorMap", "normalMap", "metallicRoughnessMap"],
  );

  const baseOnly = fakeInstances(ALL);
  applySurfaceItem({
    slot: "wall",
    instances: baseOnly.instances as never,
    renderableManager: RM,
    neutral: null,
    maps: TEX,
    spec: { tiling: { scale: [1, 1], offset: [0, 0] }, maps: ["texture"] },
  });
  const baseOnlyWallTextureCalls = baseOnly.calls.filter((c) => c.method === "Wall_xmin.setTextureParameter");
  assert.equal(baseOnlyWallTextureCalls.length, 1);
  assert.deepEqual(baseOnlyWallTextureCalls[0].args[1], "baseColorMap");
});

test("the cornice falls back to the wall's tiling when the item ships trim maps but no trimTiling", () => {
  const { instances, calls } = fakeInstances(ALL);
  applySurfaceItem({
    slot: "wall",
    instances: instances as never,
    renderableManager: RM,
    neutral: null,
    maps: { base: TEX.base, trim: TEX.base } as never,
    spec: { tiling: { scale: [3, 4], offset: [1, 2] }, maps: ["texture", "trim_texture"] },
  });
  const corniceMatrixCall = calls.find((c) => c.method === "Trim_xmin.setMat3fParameter");
  assert.deepEqual(corniceMatrixCall?.args, ["baseColorUvMatrix", [3, 0, 0, 0, 4, 0, 1, 2, 1]]);
});

test("no surface item ever writes occlusionMap or a Trim_ baseColorFactor", () => {
  const { instances, calls } = fakeInstances(ALL);
  applySurfaceItem({
    slot: "wall",
    instances: instances as never,
    renderableManager: RM,
    neutral: null,
    maps: { base: TEX.base, trim: TEX.base } as never,
    spec: {
      tiling: { scale: [1, 1], offset: [0, 0] },
      trimTiling: { scale: [2, 2], offset: [0, 0] },
      maps: ["texture", "trim_texture"],
    },
  });
  // Index-independent on purpose: setTextureParameter takes the parameter name SECOND and setFloat4Parameter takes it first, so asserting a fixed position would silently stop checking one of them the next time a signature moves.
  assert.equal(calls.some((c) => c.args.includes("occlusionMap")), false);
  const trimFactor = calls.filter(
    (c) => SHELL_GROUPS.cornice.includes(c.method.split(".")[0]) && c.args.includes("baseColorFactor"),
  );
  assert.deepEqual(trimFactor, []);
});
