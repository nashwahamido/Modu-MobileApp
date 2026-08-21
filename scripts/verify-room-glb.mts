// Check a built room shell GLB against everything the renderer silently assumes about it.
//
// Every failure this catches is one that produces NO error at runtime — the room just looks wrong, usually in a way that reads as a lighting or art problem rather than a broken asset. A wall whose material came out OPAQUE simply never fades; a material that exported as Wall_xmin.001 matches no regex and culls nothing; a missing occlusion texture reads as "the AO bake looks flat"; a WebP texture renders flat black because Filament ships no WebP decoder. All four have actually shipped at least once.
//
// Run as the last step of the export pipeline, on the file that is about to be committed:
//   npx tsx scripts/verify-room-glb.ts [path]
//
// Exits non-zero on any failure, so it can gate a commit.
import { statSync } from "node:fs";

import { NodeIO, Node } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

import { ROOM_SHELL } from "../src/room/core/roomShell";

const SHIPPED = "src/assets/models/room/virtualroom_empty.glb";
const WALLS = ["xmin", "xmax", "zmin", "zmax"];

// The authored export contract: one per wall, one per cornice run, one per cornice CORNER (a corner shows while EITHER of its walls does, so it cannot share either one's material), plus the ceiling, the floor slab and the plinth. The build pipeline adds Grid as a sixteenth, generated material.
const CULLABLE = [
  ...WALLS.map((w) => `Wall_${w}`),
  ...WALLS.map((w) => `Trim_${w}`),
  "Trim_xmin_zmin",
  "Trim_xmin_zmax",
  "Trim_xmax_zmin",
  "Trim_xmax_zmax",
  "Ceiling",
];
// Never culled, and deliberately left OPAQUE — putting the floor in the transparent pass costs real overdraw for nothing.
const OPAQUE = ["Floor", "FloorEdge", "Grid"];
// The ceiling is pinned invisible forever and exists only to cast shadow. Grid
// is generated unlit line art. Neither needs baked occlusion.
const NO_AO = ["Ceiling", "Grid"];

// The materials a surface item may retexture, and therefore the ones that MUST declare every map slot it writes — gltfio picks a shader variant from a material's declared features, and MaterialInstance::setParameter THROWS on a parameter the variant lacks. A material with no normalTexture has no normalMap to write. scripts/declare-shell-map-slots.mjs is what puts them there.
const TEXTUREABLE = [
  "Floor",
  ...WALLS.map((w) => `Wall_${w}`),
  ...WALLS.map((w) => `Trim_${w}`),
  "Trim_xmin_zmin",
  "Trim_xmin_zmax",
  "Trim_xmax_zmin",
  "Trim_xmax_zmax",
];
// Deliberately NOT textureable: the plinth takes a baseColorFactor tint (it never fades, so nothing else owns its factor) and the ceiling is never drawn at all. Declaring map slots on them would ship placeholder textures nothing can ever use.
const FACTOR_ONLY = ["FloorEdge", "Ceiling", "Grid"];

const path = process.argv[2] ?? SHIPPED;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const root = (await io.read(path)).getRoot();

const failures: string[] = [];
const check = (ok: boolean, label: string, detail: string) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label.padEnd(30)} ${detail}`);
  if (!ok) failures.push(label);
};

console.log(`\n${path}  ${(statSync(path).size / 1048576).toFixed(2)} MB\n`);

const materials = root.listMaterials();
const byName = new Map(materials.map((m) => [m.getName(), m]));
const expected = [...CULLABLE, ...OPAQUE];
const missing = expected.filter((n) => !byName.has(n));
const extra = [...byName.keys()].filter((n) => !expected.includes(n));

// A .001 suffix survives the glTF export and is fatal three ways at once — wallCulling.ts's ANCHORED /^(?:Wall|Trim)_(xmin|...)$/ matches nothing, the corner regex likewise, and CEILING_MATERIAL is compared with === so the ceiling renders as a solid opaque lid. Fix it in Blender with scripts/normalise_shell_materials.py, not here.
check(
  missing.length === 0 && extra.length === 0,
  "16 material names",
  missing.length || extra.length ? `missing [${missing}] unexpected [${extra}]` : `all present`,
);

const wrongBlend = CULLABLE.filter((n) => byName.get(n)?.getAlphaMode() !== "BLEND");
// Blender cannot express this: since 4.2 its exporter derives alphaMode from the Principled Alpha socket rather than blend_method, so an opaque-looking material always exports OPAQUE no matter what the viewport says. Filament then discards the alpha channel and the wall never fades.
check(wrongBlend.length === 0, "cullable are BLEND", wrongBlend.length ? `not BLEND: ${wrongBlend}` : `${CULLABLE.length} materials`);

const wrongOpaque = OPAQUE.filter((n) => byName.get(n)?.getAlphaMode() !== "OPAQUE");
check(wrongOpaque.length === 0, "opaque stay OPAQUE", wrongOpaque.length ? `not OPAQUE: ${wrongOpaque}` : OPAQUE.join(", "));

const wantAO = expected.filter((n) => !NO_AO.includes(n));
const noAO = wantAO.filter((n) => !byName.get(n)?.getOcclusionTexture());
const strengths = [...new Set(wantAO.map((n) => byName.get(n)?.getOcclusionStrength()))];
// SSAO cannot reach these walls at all — Filament builds its AO buffer from the OPAQUE depth pass, and every cullable surface here is BLEND so wall culling has an alpha to write. A baked occlusionTexture is a MATERIAL feature and is the only route.
check(noAO.length === 0, "baked AO present", noAO.length ? `no occlusionTexture: ${noAO}` : `${wantAO.length} materials`);
check(strengths.length === 1, "AO strength uniform", `strength ${strengths.join(" / ")} (tune with set-ao-strength.mjs, never by re-baking)`);

// The AO atlas needs its OWN UV set — it is unique-UV, unlike every other map here, which is tiled — so it is authored as TEXCOORD_1. Do NOT assert that it is still set 1 in a built file: FloorEdge carries no baseColorTexture, so compress-room-glb.mjs's prune() drops its now-unused TEXCOORD_0 and promotes the AO UVs to slot 0, rewriting texCoord to match. That is correct and the UV data is preserved byte-for-byte. The invariant that actually matters is that the slot a material points at EXISTS on the primitives wearing it — a dangling texCoord silently samples nothing.
const danglingUV = new Set<string>();
for (const mesh of root.listMeshes())
  for (const prim of mesh.listPrimitives()) {
    const material = prim.getMaterial();
    const name = material?.getName();
    if (!name || !wantAO.includes(name)) continue;
    const slot = material!.getOcclusionTextureInfo()?.getTexCoord() ?? 0;
    if (!prim.getAttribute(`TEXCOORD_${slot}`)) danglingUV.add(`${name}->TEXCOORD_${slot}`);
  }
check(danglingUV.size === 0, "AO UV set resolves", danglingUV.size ? `dangling: ${[...danglingUV]}` : "every AO texCoord exists on its primitives");

const webp = root.listTextures().filter((t) => t.getMimeType() === "image/webp");
check(webp.length === 0, "no WebP textures", webp.length ? `${webp.length} would render FLAT BLACK` : `${root.listTextures().length} textures`);

// Geometry must survive the pipeline untouched: SCENE_SCALE and SCENE_CENTER derive from this AABB while roomToScene normalises FURNITURE by the constants in roomShell.ts, so any drift here makes every placed piece float by exactly half of it.
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const m = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const position = prim.getAttribute("POSITION");
    if (!position) continue;
    const lo = position.getMin([]) as number[];
    const hi = position.getMax([]) as number[];
    // Every corner, not just min/max — a rotated node's AABB is not its transformed min/max.
    for (let corner = 0; corner < 8; corner++) {
      const p = [corner & 1 ? hi[0] : lo[0], corner & 2 ? hi[1] : lo[1], corner & 4 ? hi[2] : lo[2]];
      for (let i = 0; i < 3; i++) {
        const v = m[i] * p[0] + m[4 + i] * p[1] + m[8 + i] * p[2] + m[12 + i];
        min[i] = Math.min(min[i], v);
        max[i] = Math.max(max[i], v);
      }
    }
  }
}
const want = [ROOM_SHELL.bounds.min, ROOM_SHELL.bounds.max].flatMap((v) => [v.x, v.y, v.z]);
const got = [...min, ...max];
const drift = Math.max(...got.map((v, i) => Math.abs(v - want[i])));
const fmt = (v: number[]) => `[${v.map((n) => n.toFixed(4)).join(", ")}]`;
check(
  drift < 5e-4,
  "AABB matches roomShell.ts",
  drift < 5e-4 ? `${fmt(min)} ${fmt(max)}` : `drift ${drift.toFixed(4)} — got ${fmt(min)} ${fmt(max)}, want ${fmt(want.slice(0, 3))} ${fmt(want.slice(3))}`,
);

let verts = 0;
let tris = 0;
for (const mesh of root.listMeshes())
  for (const prim of mesh.listPrimitives()) {
    verts += prim.getAttribute("POSITION")?.getCount() ?? 0;
    tris += (prim.getIndices()?.getCount() ?? 0) / 3;
  }
console.log(`\n  meshes ${root.listMeshes().length}  verts ${verts.toLocaleString()}  tris ${tris.toLocaleString()}`);

console.log("\nsurface-item map slots");
for (const name of TEXTUREABLE) {
  const material = byName.get(name);
  if (!material) continue; // already reported as missing above
  const base = material.getBaseColorTexture();
  const normal = material.getNormalTexture();
  const rough = material.getMetallicRoughnessTexture();
  // Every slot needs its OWN transform: gltfio exposes one uv matrix per slot, and a surface item that can retile its albedo but not its normal map renders the grain and the bump detail at different scales. setMat3fParameter throws on an undeclared parameter, so a missing transform here is not a degraded look but a thrown apply.
  const transforms = [
    ["baseColor", material.getBaseColorTextureInfo()],
    ["normal", material.getNormalTextureInfo()],
    ["metallicRoughness", material.getMetallicRoughnessTextureInfo()],
  ] as const;
  const missingTransforms = transforms
    .filter(([, info]) => info?.getExtension("KHR_texture_transform") == null)
    .map(([slot]) => slot);
  const hasTransform = missingTransforms.length === 0;
  const roughFactor = material.getRoughnessFactor();
  const metalFactor = material.getMetallicFactor();

  check(base != null, `${name} baseColorTexture`, base ? "present" : "MISSING");
  // Without a texture transform there is no baseColorUvMatrix parameter, so a surface item could set its texture but never its tiling — and every finish would be locked to the shell's authored tiling density.
  check(hasTransform, `${name} uv transforms`, hasTransform ? "all 3 slots" : `MISSING on ${missingTransforms.join(", ")}`);
  check(normal != null, `${name} normalTexture`, normal ? "present" : "MISSING");
  check(rough != null, `${name} metallicRoughnessTexture`, rough ? "present" : "MISSING");
  // glTF factors MULTIPLY textures. A roughnessFactor below 1 silently darkens every roughness map a surface item ever supplies, so the authored value moves into the placeholder map's G channel and the factor goes to 1.
  check(roughFactor === 1, `${name} roughnessFactor`, `${roughFactor} (want 1)`);
  check(metalFactor === 0, `${name} metallicFactor`, `${metalFactor} (want 0)`);
}

for (const name of FACTOR_ONLY) {
  const material = byName.get(name);
  if (!material) continue;
  const clean = material.getBaseColorTexture() == null && material.getNormalTexture() == null && material.getMetallicRoughnessTexture() == null;
  check(clean, `${name} carries no maps`, clean ? "factor-only" : "HAS TEXTURES");
}

// Cells are a dice of the wall's own UV layout so they must tile their band panel edge to edge, and adjacency is checked on either edge because the x-walls parameterise in the opposite direction to the cell index.
console.log("\nWCell UV0 continuity");
const uRange = (node: Node) => {
  const prim = node.getMesh()?.listPrimitives()[0];
  const uv = prim?.getAttribute("TEXCOORD_0");
  if (!uv) return null;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < uv.getCount(); i += 1) {
    const u = uv.getElement(i, [0, 0])[0];
    if (u < min) min = u;
    if (u > max) max = u;
  }
  return { min, max };
};

for (const wall of WALLS) {
  const cells = root
    .listNodes()
    .filter((n) => n.getName().startsWith(`WCell_${wall}_`) && n.getName().endsWith("_r0"))
    .sort((a, b) => a.getName().localeCompare(b.getName()));
  if (cells.length === 0) {
    check(false, `WCell_${wall} row 0`, "no cells found");
    continue;
  }
  let contiguous = true;
  let detail = `${cells.length} cells`;
  for (let i = 1; i < cells.length; i += 1) {
    const prev = uRange(cells[i - 1]);
    const here = uRange(cells[i]);
    if (!prev || !here) {
      contiguous = false;
      detail = `${cells[i].getName()} has no TEXCOORD_0`;
      break;
    }
    // Adjacent to within a float-precision epsilon: either here.min == prev.max (ascending) or here.max == prev.min (descending).
    const gap = Math.min(Math.abs(here.min - prev.max), Math.abs(here.max - prev.min));
    if (gap > 1e-4) {
      contiguous = false;
      detail = `gap of ${gap.toFixed(5)} before ${cells[i].getName()}`;
      break;
    }
  }
  check(contiguous, `WCell_${wall} UV0 contiguous`, detail);
}

// The window band is the one place the AO bake can go flat with every check above still passing: the cells and the panel share their wall's material, so the material has its occlusionTexture, the texCoord resolves, and the file is the right size — while all 2,688 band vertices point at ONE texel. That shipped on 2026-08-10 after a re-export out of a .blend that never held the 2026-08-04 band bake. Measured off it: the band read a flat 255 from sill to head where the wall above ramped 205 down to 133, and the step at the band's top edge drew a hard line across the wall with a lighter plate under it — the exact "lighter rectangle floating in the middle of the wall" that bake_room_ao.py's header describes and was rewritten to cure. The invariant asserted here is the one step 5 of that script establishes: a wall's band panel owns a real island, and that wall's 84 cells sample INSIDE it, because a cell is a 0.25 m tile of the panel it stands in for and the diced/undiced swap has to be invisible.
console.log("\nband AO mapping");
const aoUV = (node: Node) => {
  const out: number[][] = [];
  const mesh = node.getMesh();
  if (!mesh) return out;
  for (const prim of mesh.listPrimitives()) {
    const slot = prim.getMaterial()?.getOcclusionTextureInfo()?.getTexCoord() ?? 0;
    const uv = prim.getAttribute(`TEXCOORD_${slot}`);
    if (!uv) continue;
    for (let i = 0; i < uv.getCount(); i += 1) out.push(uv.getElement(i, [0, 0]));
  }
  return out;
};

for (const wall of WALLS) {
  const panel = root.listNodes().find((n) => n.getName() === `Shell_Band_${wall}`);
  const cells = root.listNodes().filter((n) => n.getName().startsWith(`WCell_${wall}_`));
  if (!panel || cells.length === 0) {
    check(false, `band_${wall} both forms`, `panel ${panel ? "present" : "MISSING"}, ${cells.length} cells`);
    continue;
  }
  const island = aoUV(panel);
  const lo = [0, 1].map((k) => Math.min(...island.map((t) => t[k])));
  const hi = [0, 1].map((k) => Math.max(...island.map((t) => t[k])));
  const size = [0, 1].map((k) => hi[k] - lo[k]);
  // A pinned band is exactly a zero-area island. Anything the bake actually reached spans many texels.
  const baked = size[0] * size[1] > 1e-6;
  check(baked, `band_${wall} AO island`, baked ? `${size[0].toFixed(4)} x ${size[1].toFixed(4)} uv` : `PINNED to one texel at (${lo.map((v) => v.toFixed(4)).join(", ")}) — re-run scripts/export_room.py, which bakes and SAVES before exporting`);

  const strays = cells.filter((c) => aoUV(c).some((t) => [0, 1].some((k) => t[k] < lo[k] - 1e-3 || t[k] > hi[k] + 1e-3)));
  check(strays.length === 0, `band_${wall} cells on island`, strays.length ? `${strays.length} cells sample outside the panel, first ${strays[0].getName()}` : `${cells.length} cells inside`);
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed: ${failures.join(", ")}\n`);
  process.exit(1);
}
console.log(`\nall checks passed\n`);
