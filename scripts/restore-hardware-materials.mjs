// Give the hardware back its own materials in the repainted style GLBs.
//
// THE PROBLEM IS IN THE ART, NOT THE CODE. `cozy` and `cartoon` are whole separate GLBs (see each
// furniture's `styleModels`), generated from the base by repainting its materials flat. That repaint
// also collapses materials — EKET goes from 19 down to 5 — so every part that used one of the
// dropped materials is remapped onto a surviving one, and then repainted with it. The result is
// olive screws, brown steel runners and cartoon-coloured dowels.
//
// It cannot be fixed by editing a material in the style file, because in the BASE model the hardware
// already SHARES materials with the timber: BEKVAM's dowels are the same birch as its rails,
// DALFRED's screws the same black as its structural black parts. Recolouring the shared material
// would drag the body with it.
//
// So the operation is PER NODE: for every hardware node, clone the material it has in the BASE model
// into the style file as a material of its own, and point that node at the clone. Nothing else in
// the style file changes, and because the clone is used by hardware only, a future repaint pass can
// flatten the body without ever touching it again.
//
// Run:  node scripts/restore-hardware-materials.mjs            (all four models)
//       node scripts/restore-hardware-materials.mjs EKET       (one model)
//       node scripts/restore-hardware-materials.mjs --dry-run  (report, write nothing)
// Buffer imported EXPLICITLY rather than leaned on as a global, matching compress-furniture-glb.mjs
// and compress-room-glb.mjs. It works either way at runtime; the import is what stops eslint's
// no-undef firing ten times in a file that is otherwise clean.
import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MODELS = ["LACK", "BEKVAM", "DALFRED", "EKET"];
const STYLES = ["cozy", "cartoon"];
const MODEL_DIR = "src/assets/models/furnitures";
const PARTS_DIR = "src/game/content/furnitures";

/** Material names that mean "this is metal, whatever the part is called". IKEA's own material names
 *  are consistent enough to key off: the alternative is a hand-list that goes stale the moment a
 *  model is re-exported. */
const METAL_NAME = /steel|alumin|metal|zinc|chrome|brass/i;

/** Structural parts that are metal but whose material name does NOT say so. This mirrors
 *  METAL_GROUPS in scene/shaders.tsx — the same three DALFRED parts that list calls out as
 *  "structural metal, not fasteners". Keep the two in step.
 *
 *  ADD TO THIS LIST when a part comes out repainted that should not be. EKET's `suspBracket`,
 *  `suspKnob` and `suspCover` are the likeliest candidates: the real suspension rail is steel, but
 *  its material is named "IKEA BLACK no 1 Plastic Etching", so neither the fastener test nor the
 *  name test catches it and it is currently treated as body. Left out because it is a judgement
 *  about the artwork, not a fact the model states. */
const METAL_GROUPS = new Set(["ringRail", "supportPin", "seatPlate"]);

/**
 * Parts that LOOK like hardware to the rules above but should take the repaint anyway, per model.
 *
 * This is the deliberate exception list, and it beats every rule — a part named here is treated as
 * body no matter what its type or material says. DALFRED's pole, its cap and its ring rail are all
 * caught for different reasons (the pole by its material name "IKEA BLACK no 7 metal Text", the cap
 * because it is a fastener, the ring rail because it is in METAL_GROUPS above), and all three are
 * big enough visually that keeping them black leaves the cozy and cartoon stools looking half
 * finished. They are furniture, not fittings.
 *
 * Keyed by MODEL because the same group name could mean something different elsewhere.
 */
const REPAINT_ANYWAY = {
  DALFRED: new Set(["pole", "cap107675", "ringRail"]),
};

/**
 * Models whose hardware is named EXPLICITLY rather than inferred.
 *
 * EKET needs this because its hardware does not wear hardware materials: the runner carriages and
 * clips ship with the PANELS' white foil, the cams and dowels with black plastic. Neither a
 * material-name test nor "is it a fastener" finds them, so they stayed on the body material and took
 * the repaint — cream in cartoon, olive in cozy.
 *
 * THE FIX IS THE SELECTION, NOT A FORCED COLOUR. An earlier version pointed every one of these at
 * the model's steel, which turned the black runners and screws light grey; the authored REALISTIC
 * finish already has this exactly right — black powder-coat on the runner assembly, silver on the
 * rods, black plastic on the cams — so each node simply keeps its OWN base material, and every
 * finish then matches realistic.
 *
 * NOT listed: backPanel, sidePanel*, topPanel, bottomPanel, drawerFront, drawerBack, drawerBottom,
 * drawerSide* — the cabinet and the drawer box, which are what the finish is for.
 */
/**
 * Hardware that is authored in the CABINET's colour, and what to give it instead.
 *
 * EKET's runner carriages, clips, suspension cover and a few dowels and screws wear the panels'
 * "IKEA BASIC WHITE Foil" in the base model. On the white realistic cabinet that is invisible — it
 * is why the assembly reads as one consistent black-and-steel mechanism there. On an olive or tan
 * cabinet the same parts are stark white, so one half of a mirrored runner pair looks like a
 * different component from the other, and the whole thing stops reading as one mechanism.
 *
 * They are remapped to the runner system's OWN plastic — Rationell grey, the material the R-side
 * carriage and frame already use — so every finish shows the same hardware, unified across the pair.
 * Matched by NAME so a re-export cannot renumber it out from under this.
 *
 * The REALISTIC model is not touched by this script at all, so nothing changes there.
 */
const RECOLOUR_BODY_HARDWARE = {
  EKET: /rationell grey/i,
};

const HARDWARE_GROUPS = {
  EKET: new Set([
    "screw100349",
    "screw109041",
    "screw110519",
    "cam139434",
    "dowel139435",
    "dowel145572",
    "stabilizerRod",
    "runnerBracketL",
    "runnerBracketR",
    "runnerFrameL",
    "runnerFrameR",
    "runnerMiddleL",
    "runnerMiddleR",
    "runnerCarriageL",
    "runnerCarriageR",
    "runnerClip",
    "suspBracket",
    "suspCover",
    "suspCap",
    "suspKnob",
  ]),
};

// ── GLB container ────────────────────────────────────────────────────────────

function readGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a GLB`);
  let offset = 12;
  let json = null;
  let bin = Buffer.alloc(0);
  while (offset < buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const chunk = buf.slice(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8"));
    else if (type === 0x004e4942) bin = chunk;
    offset += 8 + length + ((4 - (length % 4)) % 4);
  }
  return { json, bin };
}

/** Both chunks are padded to 4 bytes — JSON with spaces, BIN with zeroes. A viewer that trusts the
 *  header will read garbage if this is wrong, and glTF validators reject it outright. */
function writeGlb(file, json, bin) {
  const jsonChunk = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPad = (4 - (jsonChunk.length % 4)) % 4;
  const binPad = (4 - (bin.length % 4)) % 4;
  const parts = [
    Buffer.alloc(12),
    Buffer.alloc(8),
    jsonChunk,
    Buffer.alloc(jsonPad, 0x20),
    Buffer.alloc(8),
    bin,
    Buffer.alloc(binPad, 0x00),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  parts[0].writeUInt32LE(0x46546c67, 0);
  parts[0].writeUInt32LE(2, 4);
  parts[0].writeUInt32LE(total, 8);
  parts[1].writeUInt32LE(jsonChunk.length + jsonPad, 0);
  parts[1].writeUInt32LE(0x4e4f534a, 4);
  parts[4].writeUInt32LE(bin.length + binPad, 0);
  parts[4].writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(file, Buffer.concat(parts, total));
}

// ── which nodes are hardware ─────────────────────────────────────────────────

/** meshName → part type, straight out of the GENERATED parts file. Using it rather than a regex on
 *  node names means the script and the app agree about what a fastener is by construction. */
function partTypes(model) {
  const src = fs.readFileSync(path.join(PARTS_DIR, model, "parts.gen.ts"), "utf8");
  const byMesh = {};
  for (const m of src.matchAll(
    /"group":"([^"]+)","meshName":"([^"]+)","type":"([^"]+)"/g,
  )) {
    byMesh[m[2]] = { group: m[1], type: m[3] };
  }
  return byMesh;
}

function isHardware(model, part, materialName) {
  if (!part) return false;
  // A model with an explicit list is fully described by it — no name or type guessing on top, or the
  // parts deliberately left out of it would creep back in.
  const listed = HARDWARE_GROUPS[model];
  if (listed) return listed.has(part.group);
  // The exception list first, so it beats all three rules below rather than racing them.
  if (REPAINT_ANYWAY[model]?.has(part.group)) return false;
  if (part.type === "fastener") return true;
  if (METAL_GROUPS.has(part.group)) return true;
  return METAL_NAME.test(materialName ?? "");
}

// ── copying a material across files ──────────────────────────────────────────

/** Clone `index` from `from` into `to`, bringing any texture, sampler and image with it. Returns the
 *  new material index in `to`. Memoised per run so twelve screws sharing one base material produce
 *  ONE clone rather than twelve copies of the same texture. */
function cloneMaterial(from, to, index, memo, imageByDigest) {
  if (memo.has(index)) return memo.get(index);

  const source = from.json.materials[index];

  // ALREADY DONE? A previous run leaves its clones behind, tagged with the base index they came
  // from. Without this check a second pass appends another copy of every material AND another copy
  // of every texture, so re-running quietly grows the file each time — which is exactly the sort of
  // thing nobody notices until a model is 40 MB.
  const existing = to.json.materials.findIndex(
    (m) => m.extras?.hardwareFrom === index,
  );
  if (existing >= 0) {
    memo.set(index, existing);
    return existing;
  }

  const copy = JSON.parse(JSON.stringify(source));
  copy.name = `${source.name ?? "material"} (hardware)`;
  copy.extras = { ...(copy.extras ?? {}), hardwareFrom: index };

  const remapTexture = (ref) => {
    if (!ref || ref.index === undefined) return;
    const tex = from.json.textures[ref.index];
    const img = from.json.images[tex.source];

    to.json.samplers ??= [];
    to.json.textures ??= [];
    to.json.images ??= [];

    let sampler;
    if (tex.sampler !== undefined) {
      to.json.samplers.push(JSON.parse(JSON.stringify(from.json.samplers[tex.sampler])));
      sampler = to.json.samplers.length - 1;
    }

    const newImage = JSON.parse(JSON.stringify(img));
    if (img.bufferView !== undefined) {
      // ALREADY COPIED? Several hardware materials share one texture — EKET's runner brackets,
      // frames and middles are three materials over one steel image — and copying it per material
      // put SEVEN byte-identical images in the file, 0.66 MB of duplicate texture that Filament then
      // decodes separately. That is paid at load, every load, which is what made the model slow to
      // appear. Keyed by content, so it holds however the source file numbers its views.
      const view0 = from.json.bufferViews[img.bufferView];
      const start0 = view0.byteOffset ?? 0;
      const digest = crypto
        .createHash("md5")
        .update(from.bin.slice(start0, start0 + view0.byteLength))
        .digest("hex");
      const already = imageByDigest.get(digest);
      if (already !== undefined) {
        to.json.textures.push({ sampler, source: already });
        ref.index = to.json.textures.length - 1;
        return;
      }
      imageByDigest.set(digest, to.json.images.length);
    }
    if (img.bufferView !== undefined) {
      // The bytes live in the source file's BIN chunk, so they have to be appended to the target's
      // and described by a bufferView of its own. Offsets are 4-byte aligned: glTF requires it and
      // some loaders silently misread an unaligned view rather than failing.
      const view = from.json.bufferViews[img.bufferView];
      const start = view.byteOffset ?? 0;
      const bytes = from.bin.slice(start, start + view.byteLength);
      const pad = (4 - (to.bin.length % 4)) % 4;
      const offset = to.bin.length + pad;
      to.bin = Buffer.concat([to.bin, Buffer.alloc(pad), bytes]);
      to.json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length });
      newImage.bufferView = to.json.bufferViews.length - 1;
      to.json.buffers[0].byteLength = to.bin.length;
    }
    to.json.images.push(newImage);
    to.json.textures.push({ sampler, source: to.json.images.length - 1 });
    ref.index = to.json.textures.length - 1;
  };

  const pbr = copy.pbrMetallicRoughness;
  if (pbr) {
    remapTexture(pbr.baseColorTexture);
    remapTexture(pbr.metallicRoughnessTexture);
  }
  remapTexture(copy.normalTexture);
  remapTexture(copy.occlusionTexture);
  remapTexture(copy.emissiveTexture);

  to.json.materials.push(copy);
  const next = to.json.materials.length - 1;
  memo.set(index, next);
  return next;
}

// ── the pass ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const only = args.filter((a) => !a.startsWith("--"));
const targets = only.length ? only : MODELS;

for (const model of targets) {
  const baseFile = path.join(MODEL_DIR, model, `${model}.glb`);
  if (!fs.existsSync(baseFile)) {
    console.log(`skip ${model}: no base model at ${baseFile}`);
    continue;
  }
  const base = readGlb(baseFile);
  const types = partTypes(model);

  /** Material names the CABINET and DRAWER BOX wear — with Blender's `.001` duplicate suffix
   *  stripped, because this export carries the same white foil three times and only one copy is on
   *  the panels. Used below to spot hardware that is authored in the body's colour. */
  const baseName = (n) => (n ?? "").replace(/\.\d{3}$/, "");
  const bodyNames = new Set();
  /** The hardware material that body-coloured hardware is unified onto. */
  let unifyIndex;

  // node name → base material per primitive, and whether it counts as hardware.
  const baseByNode = new Map();
  for (const node of base.json.nodes) {
    if (node.mesh === undefined) continue;
    const mats = (base.json.meshes[node.mesh].primitives ?? []).map((p) => p.material);
    const first = mats[0] === undefined ? null : base.json.materials[mats[0]].name;
    baseByNode.set(node.name, { mats, hardware: isHardware(model, types[node.name], first) });
  }


  // Resolve the two sets now that every node has been classified.
  if (RECOLOUR_BODY_HARDWARE[model]) {
    for (const info of baseByNode.values()) {
      if (info.hardware) continue;
      for (const m of info.mats) {
        if (m !== undefined) bodyNames.add(baseName(base.json.materials[m].name));
      }
    }
    unifyIndex = base.json.materials.findIndex((m) =>
      RECOLOUR_BODY_HARDWARE[model].test(m.name ?? ""),
    );
    if (unifyIndex < 0) {
      console.log(
        `  ! ${model}: no material matching ${RECOLOUR_BODY_HARDWARE[model]} — body-coloured hardware left as authored`,
      );
      unifyIndex = undefined;
    }
  }

  const hardware = [...baseByNode.entries()].filter(([, v]) => v.hardware);
  console.log(
    `\n${model}: ${baseByNode.size} mesh nodes, ${hardware.length} hardware`,
  );

  for (const style of STYLES) {
    const file = path.join(MODEL_DIR, model, `${model}_${style}.glb`);
    if (!fs.existsSync(file)) {
      console.log(`  ${style.padEnd(8)} (no file)`);
      continue;
    }
    const target = readGlb(file);
    const memo = new Map();
    // Content hash → index in `target.json.images`, so one texture is carried across once however
    // many materials reference it.
    //
    // SEEDED WITH WHAT THE FILE ALREADY HAS. The hardware materials often reference a texture the
    // style file kept anyway, and a map that only remembers what THIS run copied re-adds it beside
    // the identical original. Seeding turned four more duplicate images into references.
    const imageByDigest = new Map();
    for (const [i, img] of (target.json.images ?? []).entries()) {
      if (img.bufferView === undefined) continue;
      const v = target.json.bufferViews[img.bufferView];
      const start = v.byteOffset ?? 0;
      const digest = crypto
        .createHash("md5")
        .update(target.bin.slice(start, start + v.byteLength))
        .digest("hex");
      if (!imageByDigest.has(digest)) imageByDigest.set(digest, i);
    }
    let repointed = 0;
    let alreadyRight = 0;

    // THE REPAINTED BODY MATERIAL, worked out from the file itself: the one most used by nodes that
    // are not hardware and are not already wearing a clone. Needed to REPAIR a node that an earlier,
    // wider run turned into hardware and this run no longer considers hardware — DALFRED's pole, cap
    // and ring rail, once they were added to REPAINT_ANYWAY. The style file has lost their original
    // index (the repaint collapsed everything onto one material), so the majority body material is
    // the honest reconstruction, and on a collapsed file like DALFRED_cozy — a single material for
    // the whole model — it is exactly right rather than merely close.
    const bodyVotes = new Map();
    for (const node of target.json.nodes) {
      if (node.mesh === undefined) continue;
      if (baseByNode.get(node.name)?.hardware) continue;
      for (const prim of target.json.meshes[node.mesh].primitives ?? []) {
        if (target.json.materials[prim.material]?.extras?.hardwareFrom !== undefined) continue;
        bodyVotes.set(prim.material, (bodyVotes.get(prim.material) ?? 0) + 1);
      }
    }
    const bodyMaterial = [...bodyVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    const repaired = [];
    for (const node of target.json.nodes) {
      if (node.mesh === undefined) continue;
      const info = baseByNode.get(node.name);
      if (!info?.hardware) {
        // Not hardware — but is it still wearing a clone an earlier run gave it? Put it back on the
        // body material so the part rejoins the repaint instead of staying stranded in its old finish.
        const prims = target.json.meshes[node.mesh].primitives ?? [];
        for (const prim of prims) {
          if (target.json.materials[prim.material]?.extras?.hardwareFrom === undefined) continue;
          if (bodyMaterial === undefined) continue;
          prim.material = bodyMaterial;
          if (!repaired.includes(node.name)) repaired.push(node.name);
        }
        continue;
      }
      const prims = target.json.meshes[node.mesh].primitives ?? [];
      prims.forEach((prim, i) => {
        // Every hardware node takes back the material IT had in the base model — which is what makes
        // each finish match the authored realistic one.
        let baseIndex = info.mats[i] ?? info.mats[0];
        if (baseIndex === undefined) return;
        // Body-coloured hardware is unified onto the runner system's own plastic rather than kept
        // white — see RECOLOUR_BODY_HARDWARE.
        if (
          unifyIndex !== undefined &&
          bodyNames.has(baseName(base.json.materials[baseIndex].name))
        ) {
          baseIndex = unifyIndex;
        }
        const cloned = cloneMaterial(base, target, baseIndex, memo, imageByDigest);
        if (prim.material === cloned) alreadyRight += 1;
        else {
          prim.material = cloned;
          repointed += 1;
        }
      });
    }

    const before = fs.statSync(file).size;
    if (!dryRun && (repointed || repaired.length)) writeGlb(file, target.json, target.bin);
    const after = dryRun ? before : fs.statSync(file).size;
    console.log(
      `  ${style.padEnd(8)} ${String(repointed).padStart(3)} primitives repointed, ` +
        `${memo.size} materials cloned, ` +
        `${(before / 1048576).toFixed(1)} → ${(after / 1048576).toFixed(1)} MB` +
        (dryRun ? "  (dry run, nothing written)" : ""),
    );
    if (alreadyRight) console.log(`           ${alreadyRight} already correct`);
    if (repaired.length) {
      console.log(
        `           ~ ${repaired.length} node(s) returned to the repaint after an earlier run kept them: ` +
          `${repaired.slice(0, 4).join(", ")}${repaired.length > 4 ? "…" : ""}`,
      );
    }
  }
}

console.log(
  dryRun
    ? "\nDry run only. Drop --dry-run to write."
    : "\nDone. Re-run is safe: a second pass finds the hardware already pointing at its clone.",
);