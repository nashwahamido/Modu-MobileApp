// Fetch + parse + compose a cloud recipe. Assets are NEVER taken from the recipe body — every URL derives from the furniture id through the assembly path family, so a recipe cannot point the app at foreign storage. Thumb/cluster maps are built from the recipe's own group/cluster sets with {uri} sources; the model URI goes through probeRemote because filament's loader cannot report failure. Validation runs inside composeRecipe regardless of build type.
import { assemblyClusterThumbPath, assemblyModelPath, assemblyRecipePath, assemblyThumbPath, assemblyThumbnailPath } from "@/src/data/catalog/assets";
import { catalogUrl } from "@/src/data/catalog/urls";
import { probeRemote } from "@/src/data/remoteAsset";
import type { ClusterThumbMap, ThumbMap, ThumbSet } from "@/src/game/core/type";
import { toolsUsed } from "@/src/game/content/tools";
import { composeRecipe, type RecipeResult } from "./loadRecipe";
import { parseRecipe } from "./schema";

export interface BuiltItemRow {
  id: string;
  name: string;
  assemblyModel: string | null;
  xpPerStep: number;
  xpBonusOnComplete: number;
}

// catalogUrl resolves against a lazily-built Supabase client and returns null whenever that client is unavailable (no signed-in session, no configured project — see urls.ts). Falling back to the bare catalog path rather than failing the whole call keeps that a plain fetch failure (caught below, reported as a Result) instead of an unconditional crash before any request is even attempted.
function resolveUrl(path: string): string {
  return catalogUrl(path) ?? path;
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`recipe fetch failed: HTTP ${res.status}`);
  return res.json();
}

export async function loadCloudFurniture(id: string, row: BuiltItemRow, fetchJson: (url: string) => Promise<unknown> = defaultFetchJson, probe: (url: string) => Promise<string | null> = probeRemote): Promise<RecipeResult> {
  try {
    const parsed = parseRecipe(await fetchJson(resolveUrl(assemblyRecipePath(id))));
    if (!parsed.ok) return { ok: false, error: parsed.errors.join("; ") };
    const recipe = parsed.recipe;
    // Fail FAST when the model is unreachable (user decision 2026-08-10): filament's useModel has no error state, so an unverified URL would hang the play screen until the generic watchdog; a null probe right after a successful recipe fetch overwhelmingly means the model was never uploaded, and the error should say exactly which storage path is missing.
    const modelUri = await probe(resolveUrl(assemblyModelPath(id)));
    if (!modelUri) return { ok: false, error: `assembly model not reachable: ${assemblyModelPath(id)}` };
    const groups = [...new Set(Object.values(recipe.parts).map((p) => p.group))];
    const thumbs = Object.fromEntries(groups.map((g) => [g, { light: { uri: resolveUrl(assemblyThumbPath(id, g)) } } satisfies ThumbSet])) as ThumbMap;
    const clusterIds = Object.keys(recipe.clusters ?? {});
    const clusterThumbs = clusterIds.length > 1 ? (Object.fromEntries(clusterIds.map((c) => [c, { light: { uri: resolveUrl(assemblyClusterThumbPath(id, c)) } }])) as ClusterThumbMap) : undefined;
    // A stale cached row (pre-reward-columns, or corrupt) can carry non-finite rewards; fall back to the DB seed defaults (6 XP/step, 0 completion bonus) rather than let NaN reach the store.
    const xpPerStep = Number.isFinite(row.xpPerStep) ? row.xpPerStep : 6;
    const xpBonusOnComplete = Number.isFinite(row.xpBonusOnComplete) ? row.xpBonusOnComplete : 0;
    const out = composeRecipe(recipe, { model: { uri: modelUri }, thumbs, clusterThumbs, thumbnail: { light: { uri: resolveUrl(assemblyThumbnailPath(id)) } } }, { xpPerStep, xpBonusOnComplete });
    // `tools` is derived-at-bundle for bundled furniture (index.ts: toolsUsed(ACTIONS)); a cloud build must not silently lose the toolbox bar. Attached HERE, not in composeRecipe: the tool catalogue carries icon/model asset requires, and loadRecipe stays portal-packageable (purity.test's contract).
    if (out.ok) out.furniture.tools = toolsUsed(out.furniture.actions);
    return out;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
