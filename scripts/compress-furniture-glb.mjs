// Shrink an assembly furniture GLB for the app bundle.
//
// The authored furniture models come out of CAD tessellation (the mesh names carry IKEA part numbers),
// which means they are dense UNIFORMLY rather than in a few fixable hot spots: EKET ships six identical
// M4 screws at 48,614 triangles EACH and eight dowels at 29,908 each, and every flat panel is ~43,000
// triangles of mostly coplanar surface. 1.1 M triangles and 30 MB of 16-bit PNG add up to a 70 MB asset
// that trips the 45 s load watchdog in src/app/(game)/play.tsx.
//
// This is the furniture sibling of scripts/compress-room-glb.mjs and differs from it in two ways: it
// touches GEOMETRY (the room shell must not be decimated because the placement grid is measured against
// its bounds; furniture parts have no such contract), and its texture budgets are one notch richer
// because the assembly camera sits centimetres from a part rather than across a room.
//
// Run scripts/glb-snapshot.mjs before and after and diff: node NAMES and local TRS are the engine's
// actual API (parts.gen.ts keys parts by name, fastener engageDir is derived from node rotation) and
// must come through untouched. Mesh SHARING may change — that is dedup doing its job.
//
//   node scripts/compress-furniture-glb.mjs <input.glb> <output.glb> [--no-geometry] [--ratio 0.05] [--error 0.003]
import { Buffer } from "node:buffer";
import { statSync } from "node:fs";

import { Logger, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, simplify, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

// Per-role budgets, one notch above the room shell's because furniture is inspected close up during assembly. Every map in these files is 16-bit RGBA PNG on a fully OPAQUE material — 8 bytes per pixel to carry 3 channels of colour, which is where most of the texture payload goes before resolution is even considered. WebP is not an option at any size: Filament ships no WebP decoder and those textures render flat black.
const ROLES = [
  { name: "normal", slots: /normalTexture/, size: 1024, quality: 92, format: "jpeg" },
  { name: "roughness/metal", slots: /metallicRoughnessTexture/, size: 512, quality: 85, format: "jpeg" },
  { name: "occlusion", slots: /occlusionTexture/, size: 1024, quality: 100, format: "png" },
  { name: "colour/emissive", slots: /(baseColor|emissive)Texture/, size: 1024, quality: 88, format: "jpeg" },
];

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(args[i + 1]);
};
const [input, output] = args.filter((a) => !a.startsWith("--") && !Number.isFinite(Number(a)));
if (!input || !output) {
  console.error("usage: node scripts/compress-furniture-glb.mjs <input.glb> <output.glb> [--no-geometry] [--ratio N] [--error N]");
  process.exit(1);
}
// Ratio is a floor, not a target: meshoptimizer stops as soon as the error bound is reached, so the bound is the real control and the ratio only caps how far it may go when error stays free. Collapsing coplanar triangles costs ZERO error, which is why a flat 43,000-triangle panel can lose 98% of itself without moving a single silhouette.
const RATIO = flag("ratio", 0.05);
const ERROR = flag("error", 0.003);
const GEOMETRY = !args.includes("--no-geometry");

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(input);
// weld() logs a line per primitive and these models carry 141 of them, which buries the numbers that matter.
document.setLogger(new Logger(Logger.Verbosity.WARN));
const root = document.getRoot();

const textureBytes = () => root.listTextures().reduce((sum, t) => sum + (t.getImage()?.byteLength ?? 0), 0);
const triangles = () => {
  let n = 0;
  for (const mesh of root.listMeshes())
    for (const prim of mesh.listPrimitives()) n += (prim.getIndices()?.getCount() ?? 0) / 3;
  return Math.round(n);
};
// Triangles as the GPU actually sees them: a mesh shared by six nodes is drawn six times, so this is the number that governs frame cost, while triangles() governs file size. Dedup moves them apart and both are worth reporting.
const drawnTriangles = () => {
  let n = 0;
  for (const node of root.listNodes())
    for (const prim of node.getMesh()?.listPrimitives() ?? []) n += (prim.getIndices()?.getCount() ?? 0) / 3;
  return Math.round(n);
};

const vertices = () => {
  let n = 0;
  for (const mesh of root.listMeshes())
    for (const prim of mesh.listPrimitives()) n += prim.getAttribute("POSITION")?.getCount() ?? 0;
  return n;
};

const before = { file: statSync(input).size, textures: textureBytes(), tex: root.listTextures().length, tris: triangles(), drawn: drawnTriangles(), verts: vertices(), meshes: root.listMeshes().length };

// MATERIALS ARE DELIBERATELY EXCLUDED, for the same reason the room script excludes them: gltfio hands out one MaterialInstance per glTF material, and the assembly view tints parts individually, so collapsing two visually identical materials would make one part's highlight light up another. Meshes are NOT excluded — six byte-identical screws collapsing to one shared mesh is the single largest saving available here and it is exactly lossless, since glTF has always allowed one mesh under many nodes and only the node names carry engine meaning.
await document.transform(dedup({ propertyTypes: ["Accessor", "Mesh", "Texture", "Skin"] }));
console.log(`dedup     ${before.meshes} meshes -> ${root.listMeshes().length}   ${before.tris.toLocaleString()} -> ${triangles().toLocaleString()} stored triangles`);

// A texture carrying real alpha must not become JPEG. These models are all alphaMode OPAQUE today, but a silent alpha loss is the kind of thing that only shows up on device, so it is checked rather than assumed.
const alphaTextures = new Set();
for (const texture of root.listTextures()) {
  const image = texture.getImage();
  if (!image) continue;
  const { hasAlpha } = await sharp(Buffer.from(image)).metadata();
  // A fully opaque alpha channel is padding, not transparency, and is safe to drop.
  if (hasAlpha && !(await sharp(Buffer.from(image)).stats()).isOpaque) alphaTextures.add(texture);
}
if (alphaTextures.size > 0) console.log(`! ${alphaTextures.size} texture(s) carry real alpha and are left as-is`);

for (const role of ROLES) {
  await document.transform(
    textureCompress({
      encoder: sharp,
      targetFormat: role.format,
      slots: role.slots,
      resize: [role.size, role.size],
      quality: role.quality,
      pattern: alphaTextures.size > 0 ? /^(?!.*__keep-alpha).*$/ : undefined,
    }),
  );
  console.log(`  ${role.name.padEnd(18)} -> ${role.size}px ${role.format} q${role.quality}`);
}

if (GEOMETRY) {
  await MeshoptSimplifier.ready;
  // weld() runs inside simplify() anyway; it is called explicitly so its vertex count is visible, because that number explains the ceiling on everything below it. It recovers only ~2% here: the CAD export writes flat-shaded normals, so cabinet_topPanel carries 897 distinct POSITIONS under 3,562 distinct position+normal pairs, and weld may only merge vertices identical in EVERY attribute. The simplifier can only collapse shared edges, so it is TOPOLOGY-bound rather than error-bound — sweeping the error bound from 0.003 to 0.1 moves the result just 26% -> 20%, i.e. a visually destructive tolerance buys nothing. Getting past this floor means discarding the authored normals, welding on position alone and regenerating them, which trades a much smaller file for changed shading on hard edges — a deliberate call, not something this script should do behind your back.
  await document.transform(weld());
  console.log(`weld      ${before.verts.toLocaleString()} -> ${vertices().toLocaleString()} vertices (attribute splits limit this)`);
  await document.transform(simplify({ simplifier: MeshoptSimplifier, ratio: RATIO, error: ERROR }));
  console.log(`simplify  ratio<=${RATIO} error<=${ERROR} -> ${triangles().toLocaleString()} triangles`);
}

await document.transform(prune());
await io.write(output, document);

const after = { file: statSync(output).size, textures: textureBytes(), tex: root.listTextures().length, tris: triangles(), drawn: drawnTriangles() };
console.log(`\ntextures  ${before.tex} (${mb(before.textures)})  ->  ${after.tex} (${mb(after.textures)})`);
console.log(`triangles ${before.tris.toLocaleString()} stored / ${before.drawn.toLocaleString()} drawn  ->  ${after.tris.toLocaleString()} / ${after.drawn.toLocaleString()}`);
console.log(`file      ${mb(before.file)}  ->  ${mb(after.file)}   (${((1 - after.file / before.file) * 100).toFixed(1)}% smaller)`);

// An emptied mesh is the failure mode that matters: prune() drops it, the node loses its renderable, and the part silently vanishes from the build instead of erroring. Checked here rather than left to on-device discovery.
const stripped = root.listNodes().filter((n) => n.getMesh() && n.getMesh().listPrimitives().every((p) => (p.getIndices()?.getCount() ?? 0) === 0));
if (stripped.length > 0) {
  console.error(`\nFAIL: ${stripped.length} node(s) lost all geometry: ${stripped.map((n) => n.getName()).join(", ")}`);
  process.exit(1);
}
