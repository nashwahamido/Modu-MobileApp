import assert from "node:assert/strict";
import test from "node:test";

import { bundledRecipe } from "./bundled/toRecipe";
import { loadCloudFurniture } from "./cloudFurniture";

// catalogUrl (src/data/catalog/urls.ts) needs a live Supabase client to resolve a real URL; under node:test there is neither a session nor a react-native runtime, so it always returns null and loadCloudFurniture falls back to the bare catalog path. That fallback is what these tests exercise — the substring assertions below hold whether or not storage is configured, and the same code path degrades a genuinely unconfigured client to a clean fetch failure rather than a crash.
const ROW = { id: "eket-cabinet", name: "EKET", assemblyModel: "assembly/eket-cabinet/model.glb", xpPerStep: 6, xpBonusOnComplete: 0 };

// The probe stub stands in for probeRemote: under node:test there is no storage to HEAD, and the fail-fast contract below is pinned by its own test.
const confirmProbe = async (url: string) => url;

test("a fetched recipe composes into a Furniture whose assets are uri-based", async () => {
  const fetchJson = async (url: string) => {
    assert.ok(url.includes("assembly/eket-cabinet/recipe.json"), url);
    return JSON.parse(JSON.stringify(bundledRecipe("eket-cabinet")));
  };
  const out = await loadCloudFurniture("eket-cabinet", ROW, fetchJson, confirmProbe);
  assert.ok(out.ok, out.ok ? "" : out.error);
  assert.ok(typeof out.furniture.model === "object" && "uri" in out.furniture.model);
  const anyThumb = Object.values(out.furniture.thumbs)[0];
  assert.ok(typeof anyThumb.light === "object" && "uri" in anyThumb.light, "thumbs are uri-based");
  assert.equal(out.furniture.xpPerStep, 6, "rewards from the row, not the recipe");
});

test("an unreachable model fails fast with the storage path named, never reaching the renderer", async () => {
  const fetchJson = async () => JSON.parse(JSON.stringify(bundledRecipe("eket-cabinet")));
  const out = await loadCloudFurniture("eket-cabinet", ROW, fetchJson, async () => null);
  assert.ok(!out.ok && out.error.includes("assembly/eket-cabinet/model.glb"), out.ok ? "unexpected ok" : out.error);
});

test("malformed recipe JSON returns a Result error naming the field", async () => {
  const out = await loadCloudFurniture("eket-cabinet", ROW, async () => ({ schemaVersion: 99 }));
  assert.ok(!out.ok && out.error.includes("schemaVersion"));
});

test("network failure returns a Result error, never throws", async () => {
  const out = await loadCloudFurniture("eket-cabinet", ROW, async () => { throw new Error("offline"); });
  assert.ok(!out.ok && out.error.includes("offline"));
});
