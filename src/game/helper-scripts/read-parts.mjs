// Run every time the model has been updated.

// Extracts each node of a furniture's combined GLB
// src/game/content/furnitures/<ID>/parts.gen.ts — MODEL FACTS ONLY.

//   node src/game/helper-scripts/read-parts.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url)); // .../src/game/helper-scripts
const MODELS = path.join(ROOT, "..", "..", "assets", "models", "furnitures");
const OUT = path.join(ROOT, '..', 'data', 'furnitures');

// Furnitures are AUTO-DISCOVERED: every assets/models/furnitures/<ID>/<ID>.glb is ingested — dropping a new model in needs zero script edits. `CONFIG` is the rare escape hatch (typeOverrides forces a part's structural/fastener type).
const CONFIG = {};
const FURNITURES = Object.fromEntries(
  fs.readdirSync(MODELS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(MODELS, d.name, `${d.name}.glb`)))
    .map((d) => [d.name, CONFIG[d.name] ?? { typeOverrides: {} }]),
);

// Parse info in the model node names. See scripts/NAMING.md.
// Convention:  cluster _ group [_ index] [__ jointA [& jointB]]
//   A fastener names the structural part(s) it joins after "__": one (a screw securing a part) or two with "&" (a bolt/cam bridging a joint), e.g. base_screw105251_1__leg_1&circleUpp   → joins ["leg_1","circleUpp"] whole_bolt115980_4__leg_4&tableTop     → joins ["leg_4","tableTop"]

function parseName(name) {
  // identity "__" joints. The joint spec is the structural part(s) a fastener connects — one, or two joined by "&". Legacy names (no "__") put the spec as the tail after the index, e.g. `..._screw105251_1_leg_1` or `..._bolt_4_a&b`.
  const dd = name.indexOf('__');
  const head = dd === -1 ? name : name.slice(0, dd);
  const [cluster, group, i, ...rest] = head.split('_');
  const hasIndex = i !== undefined && /^\d+$/.test(i);
  const index = hasIndex ? Number(i) : undefined;
  const spec = dd === -1 ? (rest.length ? rest.join('_') : undefined) : name.slice(dd + 2);
  const attached = spec ? spec.split('&') : undefined; // 1 or 2 structural partIds
  return {
    cluster,
    group,
    index,
    partId: hasIndex ? `${group}_${index}` : group,
    attached,
  };
}

// Fasteners: screws, bolts, cams, dowels… detected by the group's leading word.
// The prefix list comes from the SHARED table core/fastener-kinds.json — the same table the runtime derives each fastener's KIND from (fastenerKindOf), so this script emits NO kind field at all: name the hardware by its function and everything downstream derives. Unseen hardware word = one line in the table.
const FASTENER_PREFIXES = Object.keys(
  JSON.parse(
    fs.readFileSync(path.join(ROOT, "..", "core", "model", "fastener-kinds.json"), "utf8"),
  ).prefixes,
);
const isFastenerName = (group) =>
  FASTENER_PREFIXES.some((p) => group.toLowerCase().startsWith(p));
const typeOf = (group, override, joinsTwo) =>
  override ?? (joinsTwo || isFastenerName(group) ? 'fastener' : 'structural');

// A fastener's loose/head side in its LOCAL glTF frame.
const LOCAL_ENGAGE = [0, 0, -1];
// rotate a vector by a quaternion (xyzw)
function rotateByQuat([x, y, z, w], [vx, vy, vz]) {
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ];
}
// snap a near-axis unit vector to the exact principal axis (fasteners are axis-aligned).
function snapAxis(u) {
  const i = u.map(Math.abs).indexOf(Math.max(...u.map(Math.abs)));
  if (Math.abs(u[i]) > 0.9) {
    const e = [0, 0, 0];
    e[i] = Math.sign(u[i]);
    return e;
  }
  return u.map((v) => +v.toFixed(4));
}

// read the node list out of a combined GLB
function readGlb(glbPath) {
  const b = fs.readFileSync(glbPath);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${glbPath}: not a GLB`);
  const jsonLen = b.readUInt32LE(12);          // chunk-0 length
  if (b.readUInt32LE(16) !== 0x4e4f534a)       // chunk-0 type must be JSON
    throw new Error(`${glbPath}: chunk 0 isn't JSON`);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString('utf8'));
  const off = 20 + jsonLen;
  if (b.readUInt32LE(off + 4) !== 0x004e4942) throw new Error(`${glbPath}: no BIN chunk`);
  const bin = b.subarray(off + 8, off + 8 + b.readUInt32LE(off));
  return { json, bin };
}

function readVec3(json, bin, accessorIndex) {
  const acc = json.accessors[accessorIndex];
  const bv = json.bufferViews[acc.bufferView];
  const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const stride = bv.byteStride ?? 12;
  const out = [];
  for (let i = 0; i < acc.count; i++) {
    const o = base + i * stride;
    out.push([bin.readFloatLE(o), bin.readFloatLE(o + 4), bin.readFloatLE(o + 8)]);
  }
  return out;
}

function visualCenterOffset(json, bin, node) {
  if (node.mesh == null) return undefined;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const prim of json.meshes[node.mesh].primitives) {
    if (prim.attributes.POSITION == null) continue;
    for (const v of readVec3(json, bin, prim.attributes.POSITION)) {
      for (let i = 0; i < 3; i++) {
        if (v[i] < min[i]) min[i] = v[i];
        if (v[i] > max[i]) max[i] = v[i];
      }
    }
  }
  if (!Number.isFinite(min[0])) return undefined;
  const scale = node.scale ?? [1, 1, 1];
  const localCenter = min.map((v, i) => ((v + max[i]) / 2) * scale[i]);
  return rotateByQuat(node.rotation ?? [0, 0, 0, 1], localCenter).map((v) => +v.toFixed(6));
}

// nodes -> { partId: <model facts> }
function buildParts(json, bin, typeOverrides = {}) {
  const parts = {};
  for (const n of json.nodes ?? []) {
    if (!n.name) continue;
    // combined_* nodes are pre-merged whole-cluster proxies for the combine carry (ClusterDef.carryMesh) — presentation-only, never parts
    if (n.name.startsWith('combined_')) continue;
    if (n.matrix) throw new Error(`node ${n.name} uses a matrix transform`);
    const p = parseName(n.name);
    const joinsTwo = p.attached?.length === 2;
    const type = typeOf(p.group, typeOverrides[p.group], joinsTwo);
    const rotation = n.rotation ?? [0, 0, 0, 1];
    parts[p.partId] = {
      partId: p.partId,
      group: p.group,
      meshName: n.name,
      type,
      cluster: p.cluster,
      ...(p.attached ? { attached: p.attached } : {}),
      ...(n.mesh != null ? { visualCenterOffset: visualCenterOffset(json, bin, n) } : {}),
      // NO kind field: the runtime derives it from the group name (fastenerKindOf ← core/fastener-kinds.json).
      ...(type === 'fastener'
        ? { engageDir: snapAxis(rotateByQuat(rotation, LOCAL_ENGAGE)) }
        : {}),
      pose: {
        position: (n.translation ?? [0, 0, 0]).map((v) => +v.toFixed(6)),
        rotation: rotation.map((v) => +v.toFixed(6)),
      },
    };
  }
  return parts;
}

// write src/game/content/furnitures/<ID>/parts.gen.ts
function emit(id, parts) {
  const body = Object.values(parts)
    .map((d) => `  ${JSON.stringify(d.partId)}: ${JSON.stringify(d)},`)
    .join('\n');
  const out = path.join(OUT, id, 'parts.gen.ts');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    `// GENERATED by scripts/extract-parts.mjs — do not edit by hand.
// Model facts only. Display labels (Furniture.labels) and tool (per action) live elsewhere.
import { PartDef, PartId, RawPartDef } from "@/src/game/core/type";

// Raw plain-string literal — validated by \`satisfies\`, then branded once below.
const PARTS_RAW = {
${body}
} satisfies Record<string, Omit<RawPartDef, "tool">>;

export const PARTS = PARTS_RAW as unknown as Record<PartId, PartDef>;
export const ALL_PART_IDS = Object.keys(PARTS_RAW) as PartId[];
`,
  );
  console.log(`${id}: wrote ${Object.keys(parts).length} parts → ${out}`);
}

for (const [id, cfg] of Object.entries(FURNITURES)) {
  const glb = path.join(MODELS, id, `${id}.glb`);
  const { json, bin } = readGlb(glb);
  emit(id, buildParts(json, bin, cfg.typeOverrides));
}
