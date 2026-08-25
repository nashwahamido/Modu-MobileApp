// Shrink the room avatars' textures for the app bundle.
//
// THE METRIC HERE IS VRAM, NOT FILE SIZE, and that is the whole reason this script exists separately
// from its two siblings. The avatars already ship JPEG — roughly 350 KB of texture inside a 1.1 MB
// file — so re-encoding harder saves almost nothing on disk. What costs is RESOLUTION: every avatar
// carried three 2048x2048 maps, and the GPU stores decoded pixels, so that is 3 x 16 MB of RGBA8
// (64 MB once the mip chain is counted) for ONE character. The room shell — the entire 4.5 m room,
// filling the screen — runs every map at 1024 and its roughness at 512, so the avatar was holding
// about three times the texture memory of the room it walks around in.
//
// It cannot be seen. At the home orbit (radius 9.87, 20 degree vertical FOV) a 0.98 m avatar in a
// shell normalised to 2 scene units stands 10.6% of the viewport high — about 115 px on a landscape
// phone — reaching roughly 32% at maximum zoom. That is the WHOLE character, and the map is a UV
// atlas spreading head, body and limbs, so no screen-facing patch ever samples near 2048 texels.
//
// GEOMETRY, SKINS AND ANIMATION ARE NOT TOUCHED, deliberately and unlike scripts/compress-furniture-glb.mjs.
// These are skinned meshes carrying five clips each, indexed BY ORDER from AVATAR_CONFIG in
// src/room/scene/RoomAvatar.tsx — `animation: { walk: 3, idle: 0 }` names NlaTrack.003 by its
// position in the file, so anything that reorders or drops a clip silently repoints the walk cycle at
// another animation. weld/simplify also risk skin weights, for a saving that is not there anyway:
// 7 k verts and 11 k triangles is already cheap.
//
// IN PLACE, over any number of files, and idempotent — a texture already at or under its budget and
// already JPEG is skipped rather than re-encoded, so a second run is a no-op instead of another
// generation of JPEG loss. That in-place default is the other difference from the two sibling
// scripts: their authored sources are multi-MB files kept OUT of the repo, so they read one and write
// another. These four GLBs are the source; git is the backup, and `git checkout` puts them back.
//
//   node scripts/compress-avatar-glb.mjs src/assets/models/avatars/*.glb
import { Buffer } from "node:buffer";
import { renameSync, statSync, writeFileSync } from "node:fs";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";

// Per-role budgets, matching scripts/compress-furniture-glb.mjs rather than the room's own — one notch
// richer, because a character is the thing a player looks AT while the room is what it stands in. The
// reasoning behind each is the room script's and unchanged: roughness/metal is low-frequency data and
// survives a hard downscale, normals need the most resolution and the gentlest quantization, base
// colour sits between. WebP is not an option at any size — Filament ships no WebP decoder and those
// textures render flat black.
const NORMAL = { name: "normal", size: 1024, quality: 92 };
const RM = { name: "roughness/metal", size: 512, quality: 85 };
const COLOUR = { name: "colour/emissive", size: 1024, quality: 88 };
// Occlusion keeps the colour budget and never shrinks to the roughness one — see the room script for
// what a hard downscale does to a baked AO atlas. None of the current avatars ships one.
const OCCLUSION = { name: "occlusion", size: 1024, quality: 92 };

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
// Decoded RGBA8 plus the full mip chain, which is 4/3 of the base level. The honest figure for what a
// texture actually costs the GPU, and the only number this script is really trying to move.
const vramOf = (width, height) => (width * height * 4 * 4) / 3;

const inputs = process.argv.slice(2);
if (inputs.length === 0) {
  console.error("usage: node scripts/compress-avatar-glb.mjs <glb...>   (rewritten in place)");
  process.exit(1);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const total = { fileBefore: 0, fileAfter: 0, vramBefore: 0, vramAfter: 0 };

for (const path of inputs) {
  const document = await io.read(path);
  const root = document.getRoot();

  // Which budget each texture answers to, resolved from the MATERIAL SLOT it is bound to rather than
  // from its name — a name is authoring convention and an exporter is free to change it, while the
  // slot is what the renderer samples it as. A texture bound to two slots (a packed ORM map is the
  // usual case) keeps the LARGER budget, so sharing an image with occlusion can never quietly drag a
  // base colour map down to the roughness size.
  const roleOf = new Map();
  const claim = (texture, role) => {
    if (!texture) return;
    const held = roleOf.get(texture);
    if (!held || role.size > held.size) roleOf.set(texture, role);
  };
  for (const material of root.listMaterials()) {
    claim(material.getNormalTexture(), NORMAL);
    claim(material.getMetallicRoughnessTexture(), RM);
    claim(material.getOcclusionTexture(), OCCLUSION);
    claim(material.getBaseColorTexture(), COLOUR);
    claim(material.getEmissiveTexture(), COLOUR);
  }

  const fileBefore = statSync(path).size;
  let vramBefore = 0;
  let vramAfter = 0;
  const notes = [];

  for (const texture of root.listTextures()) {
    const image = texture.getImage();
    const size = texture.getSize();
    if (!image || !size) continue;
    const [width, height] = size;
    vramBefore += vramOf(width, height);

    const label = texture.getName() || "(unnamed)";
    const role = roleOf.get(texture);
    // A texture bound to no material slot at all is not something this script can reason about, so it
    // is left exactly as authored rather than given a guessed budget.
    if (!role) {
      notes.push(`    ${label.padEnd(20)} no material slot — left as authored`);
      vramAfter += vramOf(width, height);
      continue;
    }

    // Real transparency must never become JPEG. A FULLY OPAQUE alpha channel is padding rather than
    // transparency and is safe to drop, which is the same test the room script applies.
    const { hasAlpha } = await sharp(Buffer.from(image)).metadata();
    const opaque = hasAlpha ? (await sharp(Buffer.from(image)).stats()).isOpaque : true;
    if (!opaque) {
      notes.push(`    ${label.padEnd(20)} carries real alpha — left as authored`);
      vramAfter += vramOf(width, height);
      continue;
    }

    // Never upscale: a map authored below its budget is already cheaper than the budget allows.
    const target = Math.min(role.size, Math.max(width, height));
    // THE IDEMPOTENCE GUARD. Already within budget and already JPEG means there is nothing to win and
    // a generation of quantization to lose, so the second run of this script over the same files does
    // nothing at all. Without it, re-running would visibly degrade the art each time.
    if (target === Math.max(width, height) && texture.getMimeType() === "image/jpeg") {
      notes.push(`    ${label.padEnd(20)} ${width}x${height} already within ${role.name} budget — skipped`);
      vramAfter += vramOf(width, height);
      continue;
    }

    const encoded = await sharp(Buffer.from(image))
      // `inside` and withoutEnlargement together preserve a non-square map's aspect ratio instead of
      // squashing it to the budget's square.
      .resize(target, target, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: role.quality })
      .toBuffer();

    texture.setImage(new Uint8Array(encoded));
    texture.setMimeType("image/jpeg");
    const [nextWidth, nextHeight] = texture.getSize() ?? [target, target];
    vramAfter += vramOf(nextWidth, nextHeight);
    notes.push(
      `    ${label.padEnd(20)} ${width}x${height} -> ${nextWidth}x${nextHeight} ${role.name} q${role.quality}`,
    );
  }

  // writeBinary, NEVER write(). NodeIO.write() picks its container from the FILE EXTENSION, so any
  // staging path not ending in .glb makes it emit glTF-JSON with the buffer and every texture as
  // sidecar files — which, renamed over the target, is a .glb that is really JSON and whose binary
  // payload is three loose files in whatever directory the script ran from. It looks like a 79%
  // saving and is a broken asset. writeBinary returns GLB bytes regardless of what it is called.
  const glb = await io.writeBinary(document);
  // The container is then CHECKED rather than trusted, because the failure above was silent: a GLB
  // starts with the ASCII magic "glTF", and JSON starts with "{".
  if (glb[0] !== 0x67 || glb[1] !== 0x6c || glb[2] !== 0x54 || glb[3] !== 0x46) {
    throw new Error(`${path}: writeBinary did not produce a GLB — refusing to overwrite`);
  }
  // Written beside the target and renamed over it, so an encode that throws part way through leaves
  // the committed GLB untouched rather than truncated.
  const staging = `${path}.compressing`;
  writeFileSync(staging, glb);
  renameSync(staging, path);

  const fileAfter = statSync(path).size;
  total.fileBefore += fileBefore;
  total.fileAfter += fileAfter;
  total.vramBefore += vramBefore;
  total.vramAfter += vramAfter;

  console.log(`\n${path}`);
  notes.forEach((line) => console.log(line));
  console.log(`    file ${mb(fileBefore)} -> ${mb(fileAfter)}    vram ${mb(vramBefore)} -> ${mb(vramAfter)}`);
}

console.log(
  `\nfile   ${mb(total.fileBefore)}  ->  ${mb(total.fileAfter)}   (${((1 - total.fileAfter / total.fileBefore) * 100).toFixed(1)}% smaller)`,
);
console.log(
  `vram   ${mb(total.vramBefore)}  ->  ${mb(total.vramAfter)}   (${((1 - total.vramAfter / total.vramBefore) * 100).toFixed(1)}% smaller, and this is the number that mattered)`,
);
console.log(`\nOnly ONE avatar is resident at a time — AVATAR_CONFIG's require()s are asset ids, and useModel loads the chosen kind alone — so divide the vram figure by ${inputs.length} for what a session actually holds.`);
