// Extract the room shell's OWN authored textures into two ordinary surface items that every player owns.
//
// WHY THIS HAS TO EXIST. The native patch adds setTextureParameter but no getter, and gltfio's material instances are asset-owned — so once a surface item writes its maps onto the shell, nothing in JS holds the textures that were there before and the authored look cannot be put back. That makes "Default" a button that does nothing, and it makes a wall item shipping no cornice maps inherit the PREVIOUS wall's cornice: a room that is two wallpapers at once.
// Handing the app its own copy of the authored maps turns the authored look into something it can WRITE rather than merely inherit, which is what makes every slot recoverable and every item fully define the room.
//
//   node scripts/extract-shell-defaults.mjs [shipped.glb] [out-dir]
//
// Runs as part of `npm run build:room`, AFTER declare-shell-map-slots, so the extracted maps are always the ones the shipped shell actually carries. Upload them beside the bought items; migration 018 creates the two rows and grants them to everyone.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";

const KTX = "C:/Program Files/KTX-Software/bin/ktx.exe";

// Which glTF image backs which material group, by the name the exporter gives it. These are the shell's authored art; a re-export that renames them fails loudly here rather than shipping a default set that is silently the wrong picture.
const BASE_IMAGES = {
  floor: "wooden-floor",
  wall: "wall",
  // The cornice's map, named by whatever produced it rather than by what it is — left as the exporter wrote it so this matches the GLB rather than an aspiration.
  trim: "Generated image 1 (4)",
};
// The flat placeholders declare-shell-map-slots.mjs put on every material. A Default that restored only base colour would leave the previous item's RELIEF and GLOSS on the shell, so these are part of the set.
const NORMAL_IMAGE = "shell_flat_normal";
const ROUGH_IMAGES = { floor: "shell_rough_0.4200", wall: "shell_rough_0.7500", trim: "shell_rough_0.8000" };

const [input = "src/assets/models/room/virtualroom_empty.glb", outDir = "build/surfaces"] =
  process.argv.slice(2);

if (!existsSync(KTX)) {
  console.error("! ktx (KTX-Software) not found — it encodes and validates the KTX2 output");
  process.exit(1);
}

const glb = readFileSync(input);
const jsonLength = glb.readUInt32LE(12);
const gltf = JSON.parse(glb.slice(20, 20 + jsonLength).toString("utf8"));
const binStart = 20 + jsonLength + 8;

mkdirSync(outDir, { recursive: true });
const tmp = join(outDir, ".tmp");
mkdirSync(tmp, { recursive: true });

function imageBytes(name) {
  const image = gltf.images.find((i) => i.name === name);
  if (!image) {
    console.error(`! the shell carries no image named "${name}" — a re-export renamed it, and the default set would otherwise ship the wrong picture`);
    process.exit(1);
  }
  const view = gltf.bufferViews[image.bufferView];
  const start = binStart + (view.byteOffset ?? 0);
  return { bytes: glb.slice(start, start + view.byteLength), ext: image.mimeType === "image/png" ? "png" : "jpg" };
}

// The placeholders declare-shell-map-slots.mjs writes are 4x4, which is all they need to be as glTF — but a 4x4 KTX2's mip chain degenerates to 4-2-1 and the smallest levels come out byte-sized in an order the KTX2 spec forbids, which `ktx validate` rejects as error-4001. Upscaling a FLAT image invents nothing, so the floor is raised to a size whose chain is well-behaved.
const MIN_SIZE = 16;
// How far the mip chain is allowed to shrink. The encoder emits levels whose byte lengths collapse and stop being strictly descending once they get down to a few pixels, which the KTX2 spec forbids and `ktx validate` rejects — data-dependent, and observed from BOTH toktx and ktx create. Stopping at MIN_SIZE keeps every level that a surface at room distance can actually sample (a 1024 map still gets seven) and never generates the degenerate tail.
const levelsDownTo = (px) => Math.max(1, Math.log2(px) - Math.log2(MIN_SIZE) + 1);

// sRGB for base colour, linear for the non-colour maps — the same split scripts/build-surface-item.mjs makes, and wrong in the same silent way if crossed.
async function encode(name, itemId, mapName, srgb) {
  const { bytes, ext } = imageBytes(name);
  // One flat source image backs several maps across both items, so the scratch file is keyed by DESTINATION rather than by source name — otherwise the three copies of the flat normal would collide on one path.
  const stem = `${itemId}_${mapName}`;
  let src = join(tmp, `${stem}.${ext}`);
  writeFileSync(src, bytes);
  const { width = 0, height = 0 } = await sharp(src).metadata();
  if (width < MIN_SIZE || height < MIN_SIZE) {
    const grown = join(tmp, `${stem}.${MIN_SIZE}.png`);
    // Nearest-neighbour: these are constants, and any smoothing kernel would invent a gradient across a map whose whole point is that it has none.
    await sharp(src).resize(MIN_SIZE, MIN_SIZE, { kernel: "nearest" }).png().toFile(grown);
    src = grown;
  }
  const out = join(outDir, "room", "bought", itemId, `${mapName}.ktx2`);
  execFileSync(KTX, [
    "create",
    "--format", srgb ? "R8G8B8_SRGB" : "R8G8B8_UNORM",
    "--encode", "basis-lz",
    "--generate-mipmap",
    "--levels", String(levelsDownTo(Math.max(width, height, MIN_SIZE))),
    "--assign-oetf", srgb ? "srgb" : "linear",
    "--assign-primaries", srgb ? "bt709" : "none",
    src,
    out,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  execFileSync(KTX, ["validate", out], { stdio: ["ignore", "pipe", "pipe"] });
  return out;
}

// Emitted as two ORDINARY surface items in the upload layout, not as bundled assets. Making the authored look a catalogue item that every player owns means it flows through exactly the same path as anything they buy — same storage paths, same loader, same apply — so there is no second code path to keep correct, and "Default" stops being a special case anywhere in the app.
// cream-plaster carries the cornice as its trim set: the cornice sits at the wall/ceiling junction, so it is the WALL's joinery and follows the wallpaper — reverting the wall has to take the moulding back with it. (Before 020_trim_follows_wall.sql this rode on herringbone-parquet instead, on the now-abandoned reasoning that plinth and cornice were "the same joinery"; the plinth alone stays the floor's, since it is the lip around the slab and takes no map at all.)
const ITEMS = {
  "herringbone-parquet": [
    [BASE_IMAGES.floor, "texture", true],
    [NORMAL_IMAGE, "normal", false],
    [ROUGH_IMAGES.floor, "rough", false],
  ],
  "cream-plaster": [
    [BASE_IMAGES.wall, "texture", true],
    [NORMAL_IMAGE, "normal", false],
    [ROUGH_IMAGES.wall, "rough", false],
    [BASE_IMAGES.trim, "trim_texture", true],
    [NORMAL_IMAGE, "trim_normal", false],
    [ROUGH_IMAGES.trim, "trim_rough", false],
  ],
};

console.log(`\nshell defaults  from ${input}\n`);
let total = 0;
const written = [];
for (const [itemId, maps] of Object.entries(ITEMS)) {
  mkdirSync(join(outDir, "room", "bought", itemId), { recursive: true });
  console.log(`  ${itemId}`);
  for (const [image, mapName, srgb] of maps) {
    const file = await encode(image, itemId, mapName, srgb);
    const size = readFileSync(file).length;
    total += size;
    written.push(file);
    console.log(`    ${`${mapName}.ktx2`.padEnd(20)} ${String(Math.round(size / 1024)).padStart(4)} KB`);
  }
}

rmSync(tmp, { recursive: true, force: true });
console.log(`\n-- ${written.length} maps across ${Object.keys(ITEMS).length} items, ${(total / 1024).toFixed(0)} KB -> ${outDir}`);
console.log(`   upload alongside the bought items; every player owns these, so they are the "revert to the room as designed" choice\n`);
