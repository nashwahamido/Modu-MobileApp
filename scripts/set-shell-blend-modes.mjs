// Force alphaMode BLEND on the room shell's cullable surfaces.
//
// Camera-facing wall culling fades a blocking wall out by writing alpha on its material instance. Filament's gltfio only honours that alpha when the glTF material declares alphaMode BLEND — on an OPAQUE material the alpha channel is discarded and the wall never fades.
//
// Blender cannot express this for us: since 4.2 the glTF exporter derives alphaMode from the Principled BSDF's Alpha socket rather than from blend_method, so a material with Alpha 1.0 always exports OPAQUE no matter how the viewport blend mode is set. Detuning the authored Alpha to 0.999 would work but leaves the source lying about the material, so the fix is applied here instead, on the exported file.
//
// BLEND also carries the property this whole feature rests on: Filament's shadow maps treat blended geometry as OPAQUE, so a wall faded to alpha 0 keeps occluding light. That is what stops the room's lighting from popping every time the camera crosses a quadrant boundary — the walls never actually leave the scene, they only stop being drawn.
//
//   node scripts/set-shell-blend-modes.mjs <input.glb> <output.glb>
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

// Everything the renderer may fade: one material per wall, per cornice run, per cornice CORNER (a corner is shown when EITHER of its two walls is, so it cannot share either one's material), and the ceiling, which is pinned invisible forever and exists only to cast shadow. Floor and FloorEdge are never culled and must stay OPAQUE — putting the floor in the transparent pass would cost real overdraw for nothing.
const CULLABLE = /^(?:(?:Wall|Trim)_(?:xmin|xmax|zmin|zmax)(?:_(?:zmin|zmax))?|Ceiling)$/;

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: node scripts/set-shell-blend-modes.mjs <input.glb> <output.glb>");
  process.exit(1);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(input);
const materials = document.getRoot().listMaterials();

const changed = [];
for (const material of materials) {
  if (!CULLABLE.test(material.getName())) continue;
  material.setAlphaMode("BLEND");
  // Alpha stays 1: a wall's resting state is fully opaque, and the renderer writes the fade at run time.
  const [r, g, b] = material.getBaseColorFactor();
  material.setBaseColorFactor([r, g, b, 1]);
  changed.push(material.getName());
}

// A missing group means the shell was re-exported with the old single 'Wall' material and culling would silently have nothing to fade — louder to fail here than to ship a room whose walls never get out of the way.
const expected = [
  ...["xmin", "xmax", "zmin", "zmax"].flatMap((w) => [`Wall_${w}`, `Trim_${w}`]),
  ...["xmin", "xmax"].flatMap((x) => ["zmin", "zmax"].map((z) => `Trim_${x}_${z}`)),
  "Ceiling",
];
const missing = expected.filter((name) => !changed.includes(name));
if (missing.length > 0) {
  console.error(`! shell is missing cullable materials: ${missing.join(", ")}`);
  process.exit(1);
}

await io.write(output, document);
console.log(`alphaMode BLEND -> ${changed.length} materials: ${changed.join(", ")}`);
console.log(
  `opaque (unchanged)  ${materials
    .filter((m) => !CULLABLE.test(m.getName()))
    .map((m) => m.getName())
    .join(", ")}`,
);
