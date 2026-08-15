// Set occlusionTexture.strength on a room shell GLB, in place of a re-bake.
//
// glTF applies occlusion as `1 + strength * (sampled - 1)`, so strength is a pure dial on how hard the baked map bites: 1.0 is the bake as authored, 0 disables it entirely. That makes it the right place to tune, because the map itself is geometrically correct and only its INTENSITY is a taste question — and a taste question should not cost a Blender round trip.
//
// Why it needs tuning at all. Ambient occlusion in a sealed room is honest but uneven: a flat wall reads around 0.65 (a gentle gradient into its corners, which is exactly the flatness fix) while a cornice recess reads near 0.10, because a cornice genuinely is a deep occluder. One strength covers both, so the number is a compromise:
//
//     strength   wall (0.65)   cornice (0.10)
//     1.0        0.65          0.10   walls right, cornices crushed to near-black
//     0.6        0.79          0.46   the shipped default
//     0.4        0.86          0.64   cornices safe, walls close to flat again
//
// The floor bakes at 1.0 (unoccluded) and is unaffected at any strength.
//
//   node scripts/set-ao-strength.mjs <input.glb> <output.glb> <strength 0..1>
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const [input, output, raw] = process.argv.slice(2);
if (!input || !output || raw === undefined) {
  console.error("usage: node scripts/set-ao-strength.mjs <input.glb> <output.glb> <strength 0..1>");
  process.exit(1);
}
const strength = Number(raw);
if (!Number.isFinite(strength) || strength < 0 || strength > 1) {
  console.error(`! strength must be a number in 0..1, got "${raw}"`);
  process.exit(1);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(input);
const materials = document.getRoot().listMaterials();

const changed = [];
for (const material of materials) {
  if (!material.getOcclusionTexture()) continue;
  material.setOcclusionStrength(strength);
  changed.push(material.getName());
}

// A shell with no occlusion at all means the bake never made it through the export - louder to fail here than to ship a room that silently lost its AO. Ceiling is the one legitimate exception: it is pinned to alpha 0 and never drawn, so scripts/bake_room_ao.py does not give it a map.
if (changed.length === 0) {
  console.error("! no material carries an occlusionTexture — did the export lose the AO map?");
  process.exit(1);
}

await io.write(output, document);
console.log(`occlusionTexture.strength = ${strength} -> ${changed.length} materials: ${changed.join(", ")}`);
console.log(
  `no occlusion (expected: Ceiling only)  ${materials
    .filter((m) => !m.getOcclusionTexture())
    .map((m) => m.getName())
    .join(", ")}`,
);
