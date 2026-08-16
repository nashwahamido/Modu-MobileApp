// Declare the map slots a surface item needs to write, on a room shell GLB.
//
// WHY THIS EXISTS. gltfio picks a shader variant from a material's DECLARED features, and MaterialInstance::setParameter throws on a parameter the variant does not have. A material exported with only a baseColorTexture therefore has no normalMap, no metallicRoughnessMap and — without KHR_texture_transform — no baseColorUvMatrix. Runtime retexturing would throw on the first wallpaper a player applied, on device, long after this pipeline reported success. So the slots are declared here with placeholder content that reproduces the authored look exactly.
//
// THE ROUGHNESS FACTOR MOVES. glTF multiplies factors INTO textures, so leaving roughnessFactor at its authored 0.42 would darken every roughness map a surface item ever supplies. The authored value is baked into the placeholder's G channel and the factor goes to 1. metallicFactor stays 0, which pins metallic off no matter what a map says — correct for tile, wood and plaster, and a guard against a bad upload.
//
// Placeholders are 4x4 PNGs, a few hundred bytes each. The flat normal is shared by all thirteen materials because a flat normal is the same image whatever the surface; the roughness placeholders are NOT shared, because the authored values differ per group.
//
//   node scripts/declare-shell-map-slots.mjs <input.glb> <output.glb>
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRTextureTransform } from "@gltf-transform/extensions";
import sharp from "sharp";

const WALLS = ["xmin", "xmax", "zmin", "zmax"];
const TEXTUREABLE = [
  "Floor",
  ...WALLS.map((w) => `Wall_${w}`),
  ...WALLS.map((w) => `Trim_${w}`),
  "Trim_xmin_zmin",
  "Trim_xmin_zmax",
  "Trim_xmax_zmin",
  "Trim_xmax_zmax",
];

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: node scripts/declare-shell-map-slots.mjs <input.glb> <output.glb>");
  process.exit(1);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(input);
const root = document.getRoot();
const transformExt = document.createExtension(KHRTextureTransform);

// channels: 3 makes sharp emit a genuine 3-channel RGB PNG (no alpha) — verified against the installed sharp build, so R/G/B land exactly where glTF expects them with no 4th channel to account for.
const flat = (r, g, b) =>
  sharp({ create: { width: 4, height: 4, channels: 3, background: { r, g, b } } }).png().toBuffer();

// A tangent-space normal pointing straight out of the surface. Shipping this is also what makes gltfio generate a UV-ALIGNED tangent frame at load: the shell's primitives carry no TANGENT attribute, and without a normal map declared there is nothing tying the generated frame's orientation to UV, so a real normal map's X/Y would come out arbitrary.
const normalPixels = await flat(128, 128, 255);
const normalTexture = document.createTexture("shell_flat_normal").setMimeType("image/png").setImage(normalPixels);

// One roughness placeholder per distinct authored value, cached so materials sharing a value share a texture.
const roughByValue = new Map();
async function roughnessTexture(value) {
  const key = value.toFixed(4);
  if (!roughByValue.has(key)) {
    // glTF reads roughness from G and metallic from B. R is unused by the spec; it is left at the same value so the map is legible in an image viewer.
    const level = Math.round(Math.max(0, Math.min(1, value)) * 255);
    const pixels = await flat(level, level, 0);
    roughByValue.set(key, document.createTexture(`shell_rough_${key}`).setMimeType("image/png").setImage(pixels));
  }
  return roughByValue.get(key);
}

const byName = new Map(root.listMaterials().map((m) => [m.getName(), m]));
const missing = TEXTUREABLE.filter((n) => !byName.has(n));
if (missing.length > 0) {
  console.error(`! shell is missing ${missing.length} textureable material(s): ${missing.join(", ")}`);
  process.exit(1);
}

// Identity transform only where one is absent. Floor already carries a real one (scale 5.1 x 5, offset 0 -4) and MUST keep it — overwriting it would reset the floor's tiling to one tile across the whole slab.
const declareTransform = (info) => {
  if (info && info.getExtension("KHR_texture_transform") == null) {
    info.setExtension("KHR_texture_transform", transformExt.createTransform().setScale([1, 1]).setOffset([0, 0]));
  }
};

for (const name of TEXTUREABLE) {
  const material = byName.get(name);

  // The textures must exist BEFORE their transforms are declared: getNormalTextureInfo() returns null until a normal texture is set, so declaring in the other order silently skips two of the three slots and the bug only surfaces on device.
  if (material.getNormalTexture() == null) material.setNormalTexture(normalTexture);
  if (material.getMetallicRoughnessTexture() == null) {
    material.setMetallicRoughnessTexture(await roughnessTexture(material.getRoughnessFactor()));
  }

  // ALL THREE SLOTS, not just base colour. gltfio keeps a SEPARATE uv matrix per texture slot — baseColorUvMatrix, normalUvMatrix, metallicRoughnessUvMatrix — and each one exists only if its own textureInfo declares a transform. Declaring base colour alone means a surface item can retile its albedo while its normal and roughness stay pinned at raw UV0: at a tiling scale of 3 the plank grain repeats three times across the floor and its bump detail stretches once across the whole 6 m, which reads as a broken material rather than as a tiling choice. Worse, setMat3fParameter THROWS on a parameter the material never declared, so the app cannot simply try.
  declareTransform(material.getBaseColorTextureInfo());
  declareTransform(material.getNormalTextureInfo());
  declareTransform(material.getMetallicRoughnessTextureInfo());

  material.setRoughnessFactor(1);
  material.setMetallicFactor(0);

  console.log(`  ${name.padEnd(16)} normal + metallicRoughness + 3 uv transforms declared`);
}

await io.write(output, document);
console.log(`\n-- ${TEXTUREABLE.length} materials declared -> ${output}`);
