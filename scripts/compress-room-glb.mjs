// Shrink a room shell GLB for the app bundle.
//
// The authored shell is ~32 MB, of which 98% is texture payload — 4K PBR maps, with the roughness
// channels exported as full PNGs. At the room camera's distance none of that resolution is visible,
// so this resizes and re-encodes per texture ROLE and leaves geometry untouched.
//
// Kept as a script rather than a one-off so a re-export can be put through the same pass and land at
// the same size. The raw authored GLB is NOT committed; only the output of this script is.
//
//   node scripts/compress-room-glb.mjs <input.glb> <output.glb>
import { Buffer } from "node:buffer";
import { statSync } from "node:fs";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, textureCompress } from "@gltf-transform/functions";
import sharp from "sharp";

// Per-role budgets. Roughness and occlusion are low-frequency grayscale data and survive a hard
// downscale; normals need the most resolution and the gentlest quantization; base colour sits between.
const ROLES = [
  { name: "normal", slots: /normalTexture/, size: 1024, quality: 90 },
  { name: "roughness/metal/ao", slots: /(metallicRoughness|occlusion)Texture/, size: 512, quality: 80 },
  { name: "colour/emissive", slots: /(baseColor|emissive)Texture/, size: 1024, quality: 82 },
];

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: node scripts/compress-room-glb.mjs <input.glb> <output.glb>");
  process.exit(1);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(input);
const root = document.getRoot();

const textureBytes = () =>
  root.listTextures().reduce((sum, texture) => sum + (texture.getImage()?.byteLength ?? 0), 0);

const before = { file: statSync(input).size, textures: textureBytes(), count: root.listTextures().length };

// Duplicate images are common when a source scene reuses the same map under different names — the
// authored shell ships two byte-identical gold roughness maps. Drop those before paying to re-encode.
await document.transform(dedup(), prune());

// A texture carrying real alpha must not become JPEG. In practice the shell has none, but a silent
// alpha loss is the kind of thing that only shows up on device, so it is checked rather than assumed.
const alphaTextures = new Set();
for (const texture of root.listTextures()) {
  const image = texture.getImage();
  if (!image) continue;
  const { hasAlpha } = await sharp(Buffer.from(image)).metadata();
  if (hasAlpha) {
    // Fully opaque alpha channels are padding, not transparency, and are safe to drop.
    const { isOpaque } = await sharp(Buffer.from(image)).stats();
    if (!isOpaque) alphaTextures.add(texture);
  }
}
if (alphaTextures.size > 0) {
  console.log(`! ${alphaTextures.size} texture(s) carry real alpha and are left as-is`);
}

for (const role of ROLES) {
  await document.transform(
    textureCompress({
      encoder: sharp,
      targetFormat: "jpeg",
      slots: role.slots,
      resize: [role.size, role.size],
      quality: role.quality,
      // Skip anything that genuinely needs its alpha channel.
      pattern: alphaTextures.size > 0 ? /^(?!.*__keep-alpha).*$/ : undefined,
    }),
  );
  console.log(`  ${role.name.padEnd(20)} -> ${role.size}px jpeg q${role.quality}`);
}

await io.write(output, document);

const after = { file: statSync(output).size, textures: textureBytes(), count: root.listTextures().length };
console.log(
  `\ntextures  ${before.count} (${mb(before.textures)})  ->  ${after.count} (${mb(after.textures)})`,
);
console.log(
  `file      ${mb(before.file)}  ->  ${mb(after.file)}   (${(
    (1 - after.file / before.file) * 100
  ).toFixed(1)}% smaller)`,
);

// Geometry must come through untouched: the grid in src/room/roomShell.ts is measured against these
// bounds, and a shifted wall would silently invalidate every placement in every saved room.
let vertices = 0;
for (const mesh of root.listMeshes())
  for (const prim of mesh.listPrimitives()) vertices += prim.getAttribute("POSITION")?.getCount() ?? 0;
console.log(`vertices  ${vertices.toLocaleString()} (geometry is not touched)`);
