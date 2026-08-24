// The single entry point for "give me a playable Furniture for this id". Bundled ids win (offline, always present); anything else needs a catalog row pointing at an assembly model. Rewards ALWAYS come from the row when one is present — the DB is the single source of truth for the economy; the authored constants inside bundled modules are the offline fallback only.
import type { Furniture } from "@/src/game/core/type";
import { loadCloudFurniture, type BuiltItemRow } from "@/src/game/recipe/cloudFurniture";
import { composeRecipe } from "@/src/game/recipe/loadRecipe";
import { parseRecipe } from "@/src/game/recipe/schema";
import { bundledRecipe, type BundledId } from "@/src/game/recipe/bundled/toRecipe";
import { FURNITURE_LOADERS } from "./furnitures/furnitures";

// Which code path produced the Furniture: "bundled" = the shipped TypeScript module, "recipe" = composed from RecipeV1 JSON (cloud-fetched, or serialized in memory under recipe mode). Surfaced so a dev build can state provenance outright instead of it being inferred from network traffic or blank thumbs.
export type FurnitureSource = "bundled" | "recipe";

export type PlayableResult = { ok: true; furniture: Furniture; source: FurnitureSource } | { ok: false; error: string };

// RECIPE MODE (dev-only, zero network): EXPO_PUBLIC_RECIPE_MODE=1 routes even BUNDLED ids through serialize → JSON → parse → compose, with the bundled module supplying only the asset handles — so playing any furniture answers "does the task still work as before when everything the engine consumes came through the wire format?" on device, no Supabase involved. The round-trip test suite proves the composed object deep-equals the bundled one; this mode lets you FEEL that equality in the running game.
const RECIPE_MODE = typeof __DEV__ !== "undefined" && __DEV__ && process.env.EXPO_PUBLIC_RECIPE_MODE === "1";
const RECIPE_IDS = new Set<string>(["eket-cabinet", "bekvam-stool", "dalfred-stool", "lack-table"]);

const logSource = (id: string, source: FurnitureSource, note = ""): void => {
  if (typeof __DEV__ !== "undefined" && __DEV__) console.log(`[loadFurniture] ${id} loaded from ${source}${note}`);
};

export async function loadPlayableFurniture(id: string, row?: BuiltItemRow): Promise<PlayableResult> {
  const bundled = FURNITURE_LOADERS[id];
  if (bundled) {
    const f: Furniture = await bundled();
    const rowRewardsValid = row && Number.isFinite(row.xpPerStep) && Number.isFinite(row.xpBonusOnComplete);
    const rewards = rowRewardsValid ? { xpPerStep: row.xpPerStep, xpBonusOnComplete: row.xpBonusOnComplete } : { xpPerStep: f.xpPerStep, xpBonusOnComplete: f.xpBonusOnComplete };
    if (RECIPE_MODE && RECIPE_IDS.has(id)) {
      const parsed = parseRecipe(JSON.parse(JSON.stringify(bundledRecipe(id as BundledId))));
      if (!parsed.ok) return { ok: false, error: `recipe mode: ${parsed.errors.join("; ")}` };
      const out = composeRecipe(parsed.recipe, { model: f.model, thumbs: f.thumbs, clusterThumbs: f.clusterThumbs, thumbnail: f.meta.thumbnail }, rewards);
      if (!out.ok) return { ok: false, error: `recipe mode: ${out.error}` };
      logSource(id, "recipe", " (in-memory recipe mode)");
      return { ok: true, furniture: out.furniture, source: "recipe" };
    }
    logSource(id, "bundled");
    return { ok: true, furniture: rowRewardsValid ? { ...f, xpPerStep: rewards.xpPerStep, xpBonusOnComplete: rewards.xpBonusOnComplete } : f, source: "bundled" };
  }
  if (row?.assemblyModel) {
    const out = await loadCloudFurniture(id, row);
    if (!out.ok) return out;
    logSource(id, "recipe");
    return { ok: true, furniture: out.furniture, source: "recipe" };
  }
  return { ok: false, error: `no build payload for "${id}" — not bundled and no assembly_model on the catalog row` };
}
