import assert from "node:assert/strict";
import test from "node:test";

import { surfaceMapPath, thumbPath, tilePath, assemblyModelPath, assemblyRecipePath, assemblyThumbnailPath, assemblyThumbPath, assemblyClusterThumbPath, workshopAssemblyDir } from "./assets";

test("a surface's catalogue picture is its own tile image, not a per-variation render it does not have", () => {
  assert.equal(tilePath("bought", "linen-wallpaper"), "room/bought/linen-wallpaper/tile.jpg");
});

// The bug this pins: a one-look model-item resolves to a NULL default variation exactly as a surface does, so anything that routes on nullness sends the windows to a tile.jpg that was never uploaded.
test("a one-look model-item still shows its default render, so nullness alone cannot pick the path", () => {
  assert.equal(thumbPath("bought", "window-wood-classic", null), "room/bought/window-wood-classic/default.jpg");
  assert.notEqual(thumbPath("bought", "window-wood-classic", null), tilePath("bought", "window-wood-classic"));
});

test("surface map paths sit in the item's own folder, beside its tile", () => {
  assert.equal(surfaceMapPath("bought", "oak-plank", "texture"), "room/bought/oak-plank/texture.ktx2");
  assert.equal(surfaceMapPath("bought", "oak-plank", "normal"), "room/bought/oak-plank/normal.ktx2");
  assert.equal(surfaceMapPath("bought", "oak-plank", "rough"), "room/bought/oak-plank/rough.ktx2");
});

test("trim maps are separate files, not the slab's reused", () => {
  assert.equal(surfaceMapPath("bought", "oak-plank", "trim_texture"), "room/bought/oak-plank/trim_texture.ktx2");
  assert.notEqual(
    surfaceMapPath("bought", "oak-plank", "trim_texture"),
    surfaceMapPath("bought", "oak-plank", "texture"),
  );
});

test("a surface item's maps share the folder its shop tile already uses", () => {
  const dir = (p: string) => p.slice(0, p.lastIndexOf("/"));
  assert.equal(dir(surfaceMapPath("bought", "oak-plank", "texture")), dir(tilePath("bought", "oak-plank")));
});

test("the built subtree is addressable too", () => {
  assert.equal(surfaceMapPath("built", "oak-plank", "texture"), "room/built/oak-plank/texture.ktx2");
});

test("assembly assets live in their own per-furniture tree, apart from room placement", () => {
  assert.equal(assemblyModelPath("eket-cabinet"), "assembly/eket-cabinet/model.glb");
  assert.equal(assemblyRecipePath("eket-cabinet"), "assembly/eket-cabinet/recipe.json");
  assert.equal(assemblyThumbnailPath("eket-cabinet"), "assembly/eket-cabinet/thumb.png");
});

test("assembly thumbs are per-group and per-cluster PNGs (transparent renders)", () => {
  assert.equal(assemblyThumbPath("eket-cabinet", "cam139434"), "assembly/eket-cabinet/thumbs/cam139434.png");
  assert.equal(assemblyClusterThumbPath("eket-cabinet", "drawerA"), "assembly/eket-cabinet/clusters/drawerA.png");
});

test("workshop assembly drafts stage under the workshop prefix, published assets under assembly/", () => {
  assert.equal(workshopAssemblyDir("draft-1"), "room/workshop-assembly/draft-1");
});
