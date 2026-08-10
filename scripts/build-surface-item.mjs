// Turn a PBR texture set into an uploadable surface item — the floor or wallpaper a player buys and applies to their room.
//
// This is MODU-PORTAL'S JOB, replicated locally. The portal owns asset processing and lives in another repository; until its pipeline exists this script is how real surface items get made, and after it exists this file is the executable statement of what the app actually requires. Every encoding decision below is a contract the app depends on, so change them here and in the portal together.
//
//   node scripts/build-surface-item.mjs <source-dir> <item-id> <floor|wall> [out-dir]
//
// Source layout is Poly Haven's: <name>_diff_<res>.jpg, <name>_nor_gl_<res>.exr, <name>_rough_<res>.exr, <name>_disp_<res>.png. Matching is by the _diff/_nor_gl/_rough infix, not by the name, so any pack using that convention works.
//
// Output mirrors the storage path exactly, so uploading is a straight copy of the tree into the `models` bucket:
//   <out>/room/bought/<id>/texture.ktx2   base colour
//   <out>/room/bought/<id>/normal.ktx2    omitted when the source carries no relief
//   <out>/room/bought/<id>/rough.ktx2     omitted when the source is near-uniform
//   <out>/room/bought/<id>/surface.json   the item_buy.surface row to paste alongside them
//
// FOUR DECISIONS THAT ARE NOT TASTE:
//   1. KTX2/Basis, never WebP and never plain JPEG. Filament ships no WebP decoder (those render flat black), and an uncompressed 1024 RGBA8 map with mips costs ~5.6 MB of VRAM against ~1.4 MB supercompressed — a full re-skin is nine maps, so it is the difference between ~38 MB and ~7 MB.
//   2. Base colour is sRGB; normal and roughness are LINEAR. Getting this wrong never throws. It makes the lighting subtly incorrect in a way that reads as "this material looks cheap", which is exactly the kind of mistake that ships.
//   3. UASTC for the normal map, ETC1S for the other two. ETC1S blocks visibly on normals and the artifact reads as warped lighting rather than as compression.
//   4. Displacement is DISCARDED. glTF has no height channel and gltfio's ubershader exposes no parallax parameter, so there is nowhere for it to go.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";

// Per-role budgets, mirroring the ROLES table in scripts/compress-room-glb.mjs rather than inventing new ones, so a surface item stays visually continuous with the shell's own authored maps.
const SIZES = { base: 1024, normal: 1024, rough: 512 };
// Below this standard deviation (0..255) a map carries no detail worth a download and 1.4 MB of VRAM, so it is not published at all and the material falls back to the flat placeholder the GLB already ships. Most wall items come out base-colour-only.
const FLAT_STDDEV = 3.0;
// What a near-uniform map is shrunk to instead of being dropped. Big enough for a sane mip chain, small enough to be free.
const FLAT_SIZE = 16;
// How far the mip chain may shrink. Past a few pixels the encoder emits levels whose byte lengths stop strictly descending, which the KTX2 spec forbids and `ktx validate` rejects — data-dependent, and seen from both toktx and ktx create. Stopping here keeps every level a surface at room distance can sample and never generates the degenerate tail.
const levelsDownTo = (px) => Math.max(1, Math.log2(px) - Math.log2(FLAT_SIZE) + 1);

const BLENDER = ["5.1", "5.0", "4.5", "4.2"]
  .map((v) => `C:/Program Files/Blender Foundation/Blender ${v}/blender.exe`)
  .find((p) => existsSync(p));
const KTX = "C:/Program Files/KTX-Software/bin/ktx.exe";

const [sourceDir, itemId, slot, outDir = "build/surfaces"] = process.argv.slice(2);
if (!sourceDir || !itemId || !slot) {
  console.error("usage: node scripts/build-surface-item.mjs <source-dir> <item-id> <floor|wall> [out-dir]");
  process.exit(1);
}
if (slot !== "floor" && slot !== "wall") {
  console.error(`! slot must be "floor" or "wall", got "${slot}"`);
  process.exit(1);
}
for (const [what, path] of [["Blender", BLENDER], ["ktx", KTX]]) {
  if (!path || !existsSync(path)) {
    console.error(`! ${what} not found. Blender decodes the EXR maps; ktx (KTX-Software) encodes and validates the KTX2.`);
    process.exit(1);
  }
}

const files = readdirSync(sourceDir);
const find = (infix) => {
  const hit = files.find((f) => f.includes(infix));
  return hit ? join(sourceDir, hit) : null;
};
const sources = { base: find("_diff"), normal: find("_nor_gl"), rough: find("_rough") };
if (!sources.base) {
  console.error(`! no *_diff* file in ${sourceDir} — a surface item without a base colour is not an item`);
  process.exit(1);
}

const itemDir = join(outDir, "room", "bought", itemId);
mkdirSync(itemDir, { recursive: true });
const tmp = join(outDir, `.tmp-${itemId}`);
mkdirSync(tmp, { recursive: true });

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });

// EXR goes through Blender; anything else sharp already reads. See scripts/exr-to-png.py for why a plain load-and-save would silently regrade the map.
async function toPng(src, role) {
  const out = join(tmp, `${role}.png`);
  if (src.toLowerCase().endsWith(".exr")) {
    run(BLENDER, ["--background", "--factory-startup", "--python", "scripts/exr-to-png.py", "--", src, out, ...(role === "rough" ? ["grey"] : [])]);
    return out;
  }
  await sharp(src).png().toFile(out);
  return out;
}

// glTF reads roughness from the metallicRoughness texture's G channel and metallic from its B.
// Written as GREYSCALE rather than as (0, rough, 0) on purpose: ETC1S compresses RGB jointly, so a channel-isolated map is strongly chromatic and encodes badly, while a grey one is cheap and clean. B then carries roughness too, which would read as metallic — except scripts/declare-shell-map-slots.mjs pins metallicFactor to 0 on every shell material, and glTF MULTIPLIES the factor into the texture, so the B channel is annihilated whatever it holds. Metal is off by construction, which is correct for tile, wood and plaster.
async function packRoughness(png) {
  const out = join(tmp, "rough-packed.png");
  await sharp(png).resize(SIZES.rough, SIZES.rough, { fit: "fill" }).toColourspace("srgb").png().toFile(out);
  return out;
}

async function detail(png) {
  const { channels } = await sharp(png).stats();
  return Math.max(...channels.map((c) => c.stdev));
}

// `ktx create`, NOT the older `toktx`. Measured 2026-08-08: toktx's ETC1S encoder emitted a KTX2 whose smallest mip levels were out of order (level 8 at 4 bytes before level 9 at 5), which `ktx validate` rejects as error-4001 — the spec requires levels sorted largest to smallest. libktx accepts it with a "non-conformant file accepted" warning, so it might well have loaded, but "might" is not a basis for shipping into a native path that has never been compiled: if Filament's reader is stricter the texture silently fails and the wall keeps its authored look with no error anywhere. `ktx create` produces conformant output at the same size, so there is nothing to trade off.
// It has no --resize, so sharp does that first; that is also what lets the EXR-derived PNGs and the JPEG base colour take the same path.
async function encode(src, dst, { srgb, uastc, size }) {
  const sized = `${src}.${size}.png`;
  await sharp(src).resize(size, size, { fit: "fill" }).png().toFile(sized);
  run(KTX, [
    "create",
    "--format", srgb ? "R8G8B8_SRGB" : "R8G8B8_UNORM",
    "--encode", uastc ? "uastc" : "basis-lz",
    "--generate-mipmap",
    "--levels", String(levelsDownTo(size)),
    "--assign-oetf", srgb ? "srgb" : "linear",
    "--assign-primaries", srgb ? "bt709" : "none",
    // UASTC is a fixed 8 bits per texel, so a 1024 normal map is 1.33 MB on the wire unless it is supercompressed. zstd is LOSSLESS and transport-only — the GPU still receives the same UASTC blocks — and it is rejected for ETC1S, which carries its own entropy coding already.
    ...(uastc ? ["--zstd", "18"] : []),
    sized,
    dst,
  ]);
  run(KTX, ["validate", dst]);
}

console.log(`\n${itemId}  (${slot})  from ${sourceDir}\n`);
const published = [];

// --- base colour, always published ------------------------------------------
{
  const png = await toPng(sources.base, "base");
  const dst = join(itemDir, "texture.ktx2");
  await encode(png, dst, { srgb: true, uastc: false, size: SIZES.base });
  published.push("texture");
  console.log(`  texture.ktx2   ${SIZES.base}px  ETC1S  sRGB`);
}

// --- normal and roughness, published only if they carry detail --------------
for (const [role, file, opts] of [
  ["normal", "normal.ktx2", { srgb: false, uastc: true, size: SIZES.normal }],
  ["rough", "rough.ktx2", { srgb: false, uastc: false, size: SIZES.rough }],
]) {
  if (!sources[role]) {
    console.log(`  ${file.padEnd(14)} - no source, omitted`);
    continue;
  }
  let png = await toPng(sources[role], role);
  if (role === "rough") png = await packRoughness(png);
  const stdev = await detail(png);
  // A near-uniform map is not worthless — it is a CONSTANT, and dropping it loses the LEVEL along with the variation. Both of the first two real packs land here (patio tiles span 141..187, plaster brick 231..255), and omitting them outright would leave each material on the flat placeholder the GLB ships, which carries the SHELL's authored roughness rather than the item's: a tile floor would render at the wooden floor's 0.42 and a plaster wall at 0.75.
  // Carrying it as a scalar in the row does not work either, because glTF MULTIPLIES roughnessFactor into the bound texture and the placeholder is still bound — 0.636 x 0.42 is 0.267, not 0.636. So it is published as a TINY map instead: 16px keeps the exact level, costs about a kilobyte and no meaningful VRAM, and needs no change anywhere in the app.
  const flat = stdev < FLAT_STDDEV;
  // A NORMAL map with no relief is genuinely nothing — the GLB's flat placeholder says exactly the same thing — so it is dropped. A ROUGHNESS map with no variation still carries a LEVEL, and the placeholder holds the shell's authored value rather than the item's, so dropping it would render a tile floor at the wooden floor's 0.42 and a plaster wall at 0.75.
  if (flat && role === "normal") {
    console.log(`  ${file.padEnd(14)} - near-uniform (stdev ${stdev.toFixed(2)}), omitted so it costs no download or VRAM`);
    continue;
  }
  const size = flat ? FLAT_SIZE : opts.size;
  await encode(png, join(itemDir, file), { ...opts, size });
  published.push(role);
  const note = flat ? `near-uniform (stdev ${stdev.toFixed(2)}), shrunk not dropped so the item keeps its own level` : `stdev ${stdev.toFixed(2)}`;
  console.log(`  ${file.padEnd(14)} ${String(size).padStart(4)}px  ${opts.uastc ? "UASTC" : "ETC1S"}  linear  ${note}`);
}

// --- the public.item_surfaces row (migration 017) -----------------------------
// Tiling is the map's PHYSICAL scale and CANNOT be derived from the pixels — it is how many times the texture repeats across the surface, and only a human knows how big a real patio tile is. These are starting points sized against the room's 4.5 m walls: tune them by eye, and note that re-tuning is a one-row UPDATE, never a re-upload.
const [scaleX, scaleY] = slot === "floor" ? [3, 3] : [4, 2];

// The plinth tint, floor items only: the base colour's average, which is what a skirting board cut from the same material would read as. A default worth overriding — it is the one value a player notices when it is wrong.
let edge = null;
if (slot === "floor") {
  const { channels } = await sharp(join(tmp, "base.png")).stats();
  edge = channels.slice(0, 3).map((c) => Number((c.mean / 255).toFixed(3)));
}
rmSync(tmp, { recursive: true, force: true });

// Emitted as SQL rather than as data to paste, because item_surfaces is typed columns with constraints (017) and an upsert is what actually survives re-running this script after a re-tune. The trim columns stay null: a cornice needs its own maps, which this script does not yet produce from a single-material source pack.
const sql = `-- ${itemId} (${slot}) — generated by scripts/build-surface-item.mjs
-- Requires the item_buy row to exist first; item_surfaces.item_id references it.
insert into public.item_surfaces (item_id, scale_x, scale_y, offset_x, offset_y, has_normal, has_rough, edge_r, edge_g, edge_b)
values ('${itemId}', ${scaleX}, ${scaleY}, 0, 0, ${published.includes("normal")}, ${published.includes("rough")}, ${edge ? edge.join(", ") : "null, null, null"})
on conflict (item_id) do update set
  scale_x = excluded.scale_x, scale_y = excluded.scale_y,
  offset_x = excluded.offset_x, offset_y = excluded.offset_y,
  has_normal = excluded.has_normal, has_rough = excluded.has_rough,
  edge_r = excluded.edge_r, edge_g = excluded.edge_g, edge_b = excluded.edge_b;
`;
writeFileSync(join(itemDir, "surface.sql"), sql);

console.log(`\n  surface.sql    item_surfaces: scale ${scaleX}x${scaleY}${edge ? `, edge rgb(${edge.join(", ")})` : ""}`);
console.log(`\n-- ${itemDir}`);
console.log(`   1. upload the .ktx2 files to models/room/bought/${itemId}/`);
console.log(`   2. run surface.sql (after the item_buy row for '${itemId}' exists)`);
console.log(`   3. still needed: a tile.jpg in the same folder for the shop and inventory tile\n`);
