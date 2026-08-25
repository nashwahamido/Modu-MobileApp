import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import type { ActionId, Furniture } from "@/src/game/core/type";
import { parseRecipe } from "./schema";
import { composeRecipe, type RecipeAssets } from "./loadRecipe";
import { bundledRecipe, type BundledId } from "./bundled/toRecipe";

// Furniture index.ts modules `require()` their .glb/.png assets directly (Metro resolves these at bundle time; plain `tsx --test` has no such loader and node's default CJS loader tries to parse the binary as JS, throwing a SyntaxError). Stubbing the two binary extensions to a dummy export lets us import the REAL production index.ts — same wiring the app ships — rather than reconstructing a parallel fixture that could drift from it. Model/thumbnail contents are never asserted below (only `meta.thumbnail` is deep-equal-checked, and it is nulled out on both sides first), so the stub value is inert.
const nodeModule = Module as unknown as { _extensions: Record<string, (mod: { exports: unknown }, filename: string) => void> };
for (const ext of [".glb", ".png", ".m4a"]) nodeModule._extensions[ext] = (mod) => { mod.exports = 0; };

const LOADERS: Record<BundledId, () => Promise<Furniture>> = {
  "eket-cabinet": () => import("@/src/game/content/furnitures/EKET").then((m) => m.EKET),
  "bekvam-stool": () => import("@/src/game/content/furnitures/BEKVAM").then((m) => m.BEKVAM),
  "dalfred-stool": () => import("@/src/game/content/furnitures/DALFRED").then((m) => m.DALFRED),
  "lack-table": () => import("@/src/game/content/furnitures/LACK").then((m) => m.LACK),
};

for (const id of Object.keys(LOADERS) as BundledId[]) {
  test(`round-trip: ${id} serialized and re-composed equals the bundled build`, async () => {
    // dynamic like LOADERS, and for the same reason: the tool catalogue requires .png/.glb assets, and a hoisted static import would evaluate before the extension stubs above are installed
    const { toolsUsed } = await import("@/src/game/content/tools");
    const bundled = await LOADERS[id]();
    const parsed = parseRecipe(JSON.parse(JSON.stringify(bundledRecipe(id))));
    assert.ok(parsed.ok, parsed.ok ? "" : parsed.errors.join("; "));
    const assets: RecipeAssets = { model: bundled.model, thumbs: bundled.thumbs, clusterThumbs: bundled.clusterThumbs, thumbnail: bundled.meta.thumbnail };
    const out = composeRecipe(parsed.recipe, assets, { xpPerStep: bundled.xpPerStep, xpBonusOnComplete: bundled.xpBonusOnComplete });
    assert.ok(out.ok, out.ok ? "" : out.error);
    const f = out.furniture;
    assert.deepEqual(f.parts, bundled.parts, "parts");
    assert.deepEqual(f.actions, bundled.actions, "actions (order included)");
    assert.deepEqual(f.liaisons, bundled.liaisons, "liaisons");
    assert.deepEqual(f.clusters, bundled.clusters, "clusters");
    assert.deepEqual(f.labels, bundled.labels, "labels");
    assert.deepEqual(f.instructions, bundled.instructions, "instructions");
    assert.deepEqual(f.pushOpen, bundled.pushOpen, "pushOpen");
    assert.deepEqual(f.components, bundled.components, "components");
    // derived-at-bundle fields a cloud build must NOT silently lose: sweep rides the recipe itself; tools are attached by the app-side loader (cloudFurniture — asset-bearing, so composeRecipe stays pure), mirrored here by the same derivation
    assert.deepEqual(f.sweep, bundled.sweep, "sweep (order-aware travel data)");
    assert.deepEqual(toolsUsed(f.actions), bundled.tools, "tools (the cloudFurniture attach)");
    // thumbnail and variantThumbnails are both pure catalogue artwork (FurnitureMeta's doc comment on variantThumbnails: "Catalogue art per finish") — neither is derived from the recipe body, and RecipeAssets carries only `thumbnail`, so LACK's variantThumbnails (its three colorway thumbs) is never expected to round-trip; only the recipe-derived counts + id matter here.
    assert.deepEqual({ ...f.meta, thumbnail: null, variantThumbnails: null }, { ...bundled.meta, thumbnail: null, variantThumbnails: null }, "meta counts");
    assert.deepEqual(Object.keys(f.gates ?? {}).sort(), Object.keys(bundled.gates ?? {}).sort(), "gate names");
    // Behavioural equality for gates (functions can't deep-equal): the three structured probes plus a deterministic fuzz of random done-subsets — three probes alone can't distinguish gates that read specific action combinations (EKET's rear-hardware gate watches 21 particular ids).
    {
      const ids = f.actions.map((a) => a.actionId);
      let seed = 0xC0FFEE;
      const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
      const probes: ReadonlySet<ActionId>[] = [new Set<ActionId>(), new Set(ids), new Set(ids.slice(0, ids.length >> 1))];
      for (let k = 0; k < 200; k++) {
        const density = rnd();
        probes.push(new Set(ids.filter(() => rnd() < density)));
      }
      for (const name of Object.keys(bundled.gates ?? {})) {
        for (const probe of probes) {
          assert.equal(f.gates![name](probe), bundled.gates![name](probe), `gate ${name} diverged on a fuzzed done-set of ${probe.size}`);
        }
      }
    }
  });
}
