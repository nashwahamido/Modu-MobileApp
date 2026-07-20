// One command to (re)generate furniture thumbnails to a single standard.
//
//   npm run thumbs -- EKET            # one furniture
//   npm run thumbs -- DALFRED LACK    # several
//   npm run thumbs -- --all           # every pipeline furniture
//
// The standard (identical for every furniture):
//   * assets/thumbnails/furnitures/<ID>/light/ only — NO dark
//       <ID>.png                      furniture preview
//       parts/<cluster>_<group>.png   ONE image per group (representative)
//       clusters/<cluster>.png        only when the model has >1 cluster
//   * 256x256, transparent, orthographic ISO, EEVEE, neutral matte-gray override
//     (look never depends on the GLB's own material/texture)
//
// It computes the representative object per group from parts.gen.ts (matching
// gen-thumbs.mjs), renders via Blender (render_thumbs.py), then rewrites every
// thumbs.gen.ts (gen-thumbs.mjs). Blender resolves the same way as
// render-thumbs-blender.mjs; override with BLENDER=/path/to/blender.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..", "..");
const FURN_DATA = path.join(SCRIPT_DIR, "..", "data", "furnitures");
const MODEL_ROOT = path.join(REPO_ROOT, "src", "assets", "models", "furnitures");
const THUMB_ROOT = path.join(REPO_ROOT, "src", "assets", "thumbnails", "furnitures");
const RENDER_PY = path.join(SCRIPT_DIR, "render_thumbs.py");
const GEN_THUMBS = path.join(SCRIPT_DIR, "gen-thumbs.mjs");

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

// --- furniture selection -------------------------------------------------- //

// A furniture is "in the pipeline" when its index.ts pulls from ./thumbs.gen
// (EKET/DALFRED/LACK). MALM has a GLB but reuses LACK's image, so it's excluded.
function isPipelineFurniture(id) {
  const glb = path.join(MODEL_ROOT, id, `${id}.glb`);
  const parts = path.join(FURN_DATA, id, "parts.gen.ts");
  const index = path.join(FURN_DATA, id, "index.ts");
  if (!fs.existsSync(glb) || !fs.existsSync(parts) || !fs.existsSync(index)) return false;
  return /["']\.\/thumbs\.gen["']/.test(fs.readFileSync(index, "utf8"));
}

function allFurnitures() {
  return fs
    .readdirSync(MODEL_ROOT)
    .filter((id) => fs.statSync(path.join(MODEL_ROOT, id)).isDirectory())
    .filter(isPipelineFurniture)
    .sort((a, b) => collator.compare(a, b));
}

// --- representatives (same rule as gen-thumbs.mjs: first part per group) --- //

function representativeMeshNames(id) {
  const file = path.join(FURN_DATA, id, "parts.gen.ts");
  const m = fs.readFileSync(file, "utf8").match(/const PARTS_RAW\s*=\s*(\{[\s\S]*?\})\s*satisfies/);
  if (!m) throw new Error(`${id}: could not parse parts.gen.ts`);
  const parts = Object.values(new Function(`return (${m[1]})`)());
  const seen = new Set();
  const reps = [];
  for (const p of parts) {
    if (seen.has(p.group)) continue;
    seen.add(p.group);
    reps.push(p.meshName);
  }
  return reps;
}

// --- blender resolution (mirrors render-thumbs-blender.mjs) ---------------- //

function blenderCandidates() {
  if (process.env.BLENDER) return [process.env.BLENDER];
  if (process.platform === "darwin") {
    return ["/Applications/Blender.app/Contents/MacOS/Blender", "blender"];
  }
  if (process.platform === "win32") {
    const found = [];
    const bases = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(Boolean);
    for (const base of bases) {
      const dir = path.join(base, "Blender Foundation");
      if (!fs.existsSync(dir)) continue;
      // Prefer a 4.x LTS (known-good headless EEVEE) before newer builds.
      const subs = fs.readdirSync(dir).sort((a, b) => collator.compare(a, b));
      const ordered = [...subs.filter((s) => s.includes("4.2")), ...subs.filter((s) => !s.includes("4.2"))];
      for (const sub of ordered) {
        const exe = path.join(dir, sub, "blender.exe");
        if (fs.existsSync(exe)) found.push(exe);
      }
    }
    return [...found, "blender.exe", "blender"];
  }
  return ["blender"];
}

function cleanDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith(".png")) fs.rmSync(path.join(dir, f));
  }
}

function renderFurniture(id, reps) {
  const light = path.join(THUMB_ROOT, id, "light");
  cleanDir(path.join(light, "parts")); // drop stale (old-named) part images
  cleanDir(path.join(light, "clusters"));

  const repsFile = path.join(os.tmpdir(), `thumb-reps-${id}.txt`);
  fs.writeFileSync(repsFile, reps.join("\n") + "\n");

  const env = {
    ...process.env,
    REPO_ROOT,
    FURNITURE: id,
    THUMB_ONLY_FILE: repsFile,
    THUMB_NEUTRAL: "1",
    THUMB_STAGES: "furniture,clusters,parts",
  };

  for (const bin of blenderCandidates()) {
    const r = spawnSync(bin, ["-b", "-P", RENDER_PY], { stdio: "inherit", env });
    if (r.error?.code === "ENOENT") continue; // wrong path, try next
    if (r.status === 0) {
      fs.rmSync(repsFile, { force: true });
      return true;
    }
    console.error(`  Blender at ${bin} exited ${r.status}; trying next candidate...`);
  }
  fs.rmSync(repsFile, { force: true });
  console.error(
    `Blender not found/failed for ${id}. Set BLENDER=/path/to/blender and retry.`,
  );
  return false;
}

// --- main ----------------------------------------------------------------- //

const argv = process.argv.slice(2);
const wantAll = argv.includes("--all");
const ids = wantAll ? allFurnitures() : argv.filter((a) => !a.startsWith("--"));

if (!ids.length) {
  console.error("Usage: npm run thumbs -- <ID...> | --all");
  console.error(`Pipeline furnitures: ${allFurnitures().join(", ")}`);
  process.exit(1);
}

let ok = true;
for (const id of ids) {
  if (!isPipelineFurniture(id)) {
    console.error(`skip ${id}: not a pipeline furniture (needs ${id}.glb, parts.gen.ts, thumbs.gen wiring)`);
    ok = false;
    continue;
  }
  console.log(`\n=== ${id} ===`);
  const reps = representativeMeshNames(id);
  console.log(`${id}: ${reps.length} representative groups`);
  if (!renderFurniture(id, reps)) ok = false;
}

console.log("\n=== regenerating thumbs.gen.ts ===");
const gen = spawnSync(process.execPath, [GEN_THUMBS], { stdio: "inherit" });
if (gen.status !== 0) ok = false;

process.exit(ok ? 0 : 1);
