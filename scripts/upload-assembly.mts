// Bridge for on-device testing of the recipe runtime before the portal assembly lane exists: serialize a bundled furniture to RecipeV1, validate it through the REAL composition pipeline locally, then upload recipe.json + model.glb + the bundled thumbs to assembly/<cloud-id>/ and upsert an item_build row pointing at them. The cloud id must NOT be a bundled id — the app's loader is bundled-first, so only a fresh id can prove the recipe path end-to-end (watch for "[loadFurniture] <id> loaded from recipe" in the dev build's logs).
//
//   DRY RUN (default, no network):  npx tsx scripts/upload-assembly.mts eket-cabinet eket-cabinet-cloud
//   APPLY:  SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/upload-assembly.mts eket-cabinet eket-cabinet-cloud --apply
//
// Reads EXPO_PUBLIC_SUPABASE_URL from .env (same convention as Modu-Portal's catalog sweep scripts); the service-role key comes from the environment only, never a file.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { assemblyClusterThumbPath, assemblyModelPath, assemblyRecipePath, assemblyThumbPath, assemblyThumbnailPath } from "@/src/data/catalog/assets";
import { bundledRecipe, type BundledId } from "@/src/game/recipe/bundled/toRecipe";
import { composeRecipe } from "@/src/game/recipe/loadRecipe";
import { parseRecipe } from "@/src/game/recipe/schema";

const DIRS: Record<BundledId, string> = { "eket-cabinet": "EKET", "bekvam-stool": "BEKVAM", "dalfred-stool": "DALFRED", "lack-table": "LACK" };

const [bundledId, cloudId, ...flags] = process.argv.slice(2);
const apply = flags.includes("--apply");
if (!bundledId || !cloudId || !(bundledId in DIRS)) {
  console.error(`usage: npx tsx scripts/upload-assembly.mts <${Object.keys(DIRS).join("|")}> <new-cloud-id> [--apply]`);
  process.exit(1);
}
if (cloudId in DIRS) {
  console.error(`cloud id "${cloudId}" is a bundled id — the loader is bundled-first, so it would never take the recipe path; pick a fresh id (e.g. ${bundledId}-cloud)`);
  process.exit(1);
}

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const dir = DIRS[bundledId as BundledId];
const modelFile = path.join(REPO, "src", "assets", "models", "furnitures", dir, `${dir}.glb`);
const thumbRoot = path.join(REPO, "src", "assets", "thumbnails", "furnitures", dir, "light");

// Serialize, then re-parse and COMPOSE locally: this runs assertValidFurniture on exactly the bytes we are about to ship, and yields the real meta counts for the DB row (step_count drives the server-side reward grant, so a zero would make the cloud build pay nothing).
const recipe = { ...bundledRecipe(bundledId as BundledId), id: cloudId };
const parsed = parseRecipe(JSON.parse(JSON.stringify(recipe)));
if (!parsed.ok) { console.error(`recipe does not parse:\n  ${parsed.errors.join("\n  ")}`); process.exit(1); }
const composed = composeRecipe(parsed.recipe, { model: 0, thumbs: {}, thumbnail: { light: 0 } }, { xpPerStep: 6, xpBonusOnComplete: 0 });
if (!composed.ok) { console.error(`recipe does not compose/validate: ${composed.error}`); process.exit(1); }
const { partCount, stepCount, stageCount, clusterCount } = composed.furniture.meta;
console.log(`recipe OK: ${partCount} parts, ${stepCount} steps, ${stageCount} stages, ${clusterCount} clusters (validated through assertValidFurniture)`);

// Thumb files ship from the bundled tree so the tray looks right before the phase-3 thumb worker exists. On-disk part files are <cluster>_<group>.png while the thumb map keys by bare group (cluster ids never contain "_"), hence the slice below.
type Upload = { storagePath: string; file: string; contentType: string };
const uploads: Upload[] = [{ storagePath: assemblyModelPath(cloudId), file: modelFile, contentType: "model/gltf-binary" }];
const png = (storagePath: string, file: string): Upload => ({ storagePath, file, contentType: "image/png" });
const furnThumb = path.join(thumbRoot, `${dir}.png`);
if (fs.existsSync(furnThumb)) uploads.push(png(assemblyThumbnailPath(cloudId), furnThumb));
const partsDir = path.join(thumbRoot, "parts");
if (fs.existsSync(partsDir)) for (const f of fs.readdirSync(partsDir)) uploads.push(png(assemblyThumbPath(cloudId, f.replace(/\.png$/, "").slice(f.indexOf("_") + 1)), path.join(partsDir, f)));
const clustersDir = path.join(thumbRoot, "clusters");
if (fs.existsSync(clustersDir)) for (const f of fs.readdirSync(clustersDir)) uploads.push(png(assemblyClusterThumbPath(cloudId, f.replace(/\.png$/, "")), path.join(clustersDir, f)));
for (const u of uploads) if (!fs.existsSync(u.file)) { console.error(`missing local file: ${u.file}`); process.exit(1); }

const staging = path.join(os.tmpdir(), "assembly-upload", cloudId);
fs.mkdirSync(staging, { recursive: true });
const recipeJson = JSON.stringify(recipe, null, 2);
fs.writeFileSync(path.join(staging, "recipe.json"), recipeJson);
console.log(`staged recipe.json (${(recipeJson.length / 1024).toFixed(1)} KB) -> ${path.join(staging, "recipe.json")}`);
console.log(`planned uploads to bucket "models":`);
console.log(`  ${assemblyRecipePath(cloudId)}  (recipe.json above)`);
for (const u of uploads) console.log(`  ${u.storagePath}  <-  ${path.relative(REPO, u.file)}`);
console.log(`planned item_build upsert: id=${cloudId}, assembly_model=${assemblyModelPath(cloudId)}, counts ${stepCount}/${stageCount}/${clusterCount}, remaining columns copied from "${bundledId}" (generated columns excluded)`);

if (!apply) { console.log(`\nDRY RUN — nothing uploaded. Re-run with --apply and SUPABASE_SERVICE_ROLE_KEY set to execute.`); process.exit(0); }

const env = fs.existsSync(path.join(REPO, ".env")) ? Object.fromEntries(fs.readFileSync(path.join(REPO, ".env"), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])) : {};
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) { console.error("need EXPO_PUBLIC_SUPABASE_URL (.env or env) and SUPABASE_SERVICE_ROLE_KEY (env)"); process.exit(1); }
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const put = async (storagePath: string, body: Buffer | string, contentType: string): Promise<void> => {
  const { error } = await supabase.storage.from("models").upload(storagePath, body, { contentType, upsert: true });
  if (error) throw new Error(`upload ${storagePath}: ${error.message}`);
  console.log(`uploaded ${storagePath}`);
};

await put(assemblyRecipePath(cloudId), recipeJson, "application/json");
for (const u of uploads) await put(u.storagePath, fs.readFileSync(u.file), u.contentType);

const { data: srcRow, error: rowErr } = await supabase.from("item_build").select("*").eq("id", bundledId).single();
if (rowErr || !srcRow) throw new Error(`could not read item_build row for ${bundledId}: ${rowErr?.message}`);
const { xp_reward: _xr, coin_reward: _cr, ...copyable } = srcRow as Record<string, unknown>;
const newRow = { ...copyable, id: cloudId, name: `${String(srcRow.name)} (cloud)`, assembly_model: assemblyModelPath(cloudId), step_count: stepCount, stage_count: stageCount, cluster_count: clusterCount };
const { error: upsertErr } = await supabase.from("item_build").upsert(newRow);
if (upsertErr) throw new Error(`item_build upsert: ${upsertErr.message}`);
console.log(`item_build row "${cloudId}" upserted. Open a dev build and play "${cloudId}" — expect "[loadFurniture] ${cloudId} loaded from recipe" in the logs. Note: no item_variants row is created, so the piece is buildable but has no room-placement variant yet.`);
