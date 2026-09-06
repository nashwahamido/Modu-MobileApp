// Run every time the model has been updated.

// Extracts each mesh node of a furniture's combined GLB into
// src/game/content/furnitures/<ID>/parts.gen.ts — MODEL FACTS ONLY.

//   npx tsx src/game/helper-scripts/read-parts.mts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fastenerGeometry } from "@/src/game/core/derive/fastenerGeometry";
import { readGlbMeshes, rotateByQuat, type GlbMesh } from "@/src/game/core/derive/glb";
import type { Quat, Vec3 } from "@/src/game/core/type";
import FASTENER_ROLES from "./fastener-roles.json";

const ROOT = path.dirname(fileURLToPath(import.meta.url)); // .../src/game/helper-scripts
const MODELS = path.join(ROOT, "..", "..", "assets", "models", "furnitures");
const OUT = path.join(ROOT, "..", "content", "furnitures");

// Furnitures are AUTO-DISCOVERED: every assets/models/furnitures/<ID>/<ID>.glb is ingested — dropping a new model in needs zero script edits. `CONFIG` is the rare escape hatch (typeOverrides forces a part's structural/fastener type).
const CONFIG: Record<string, { typeOverrides: Record<string, "structural" | "fastener"> }> = {};
const FURNITURES = Object.fromEntries(
  fs.readdirSync(MODELS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(MODELS, d.name, `${d.name}.glb`)))
    .map((d) => [d.name, CONFIG[d.name] ?? { typeOverrides: {} }]),
);

// Fasteners: screws, bolts, cams, dowels… detected by the group's leading word (fastener-roles.json, KEYS only — detection, not classification: the furniture's FASTENERS def decides the role and lowering writes it onto every instance). Unseen hardware word = one line in the table, or a typeOverride above.
const FASTENER_PREFIXES = Object.keys(FASTENER_ROLES.prefixes);
const isFastenerName = (group: string) => FASTENER_PREFIXES.some((p) => group.toLowerCase().startsWith(p));

// The export convention's head side in the mesh's LOCAL frame: shaft on local Y, head toward −Z (scripts/NAMING.md). It is the fallback for genuinely headless hardware (symmetric dowels, double-ended studs) and the float-exact axis wherever the measured shaft agrees with it.
const LOCAL_ENGAGE: Vec3 = [0, 0, -1];
// Snap a near-axis unit vector to the exact principal axis. A FLOAT-NOISE filter, not a geometry tolerance: 0.9999 is 0.81°, and BEKVÄM's splayed-leg screws sit at a real 5° that must survive (they spin ABOUT engageDir, and flattening it made them precess).
const AXIS_SNAP_MIN = 0.9999;
const round = (v: readonly number[], d: number): number[] => v.map((n) => +n.toFixed(d));
function snapAxis(u: Vec3): number[] {
  const i = u.map(Math.abs).indexOf(Math.max(...u.map(Math.abs)));
  if (Math.abs(u[i]) > AXIS_SNAP_MIN) {
    const e = [0, 0, 0];
    e[i] = Math.sign(u[i]);
    return e;
  }
  return round(u, 4);
}
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const neg = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];

// How far the measured shaft may sit from the convention's before the mesh is believed over the frame: 10° (cos 0.985, the same cardinal tolerance derive/jointGeometry uses). Inside it the PCA is reading bore lean and mesh asymmetry (1–3° on EKET's runner screws, 8° on DALFRED's disc-shaped cap) and the convention's exact vector stands; outside it the export broke the convention (EKET's cams and plugs bake a blanket +X, 90° off their real shafts) and only the mesh can say.
const AGREE_COS_MIN = 0.985;
// engageDir = the shaft, signed toward the MEASURED head (core/derive/fastenerGeometry.ts). Axis: the convention frame where the mesh agrees with it, the PCA shaft where it clearly does not. Sign: the head end when the radial profile sees one, else the convention's — the 12 genuinely headless fasteners (BEKVÄM dowels, LACK studs) keep their exported sign.
// The RESOLVED axis, unsnapped: `headOffset` needs the same one, because the whole point of the fallback is that the export convention does not always hold and a head face measured in a frame the shaft does not follow is not a head face.
function engageAxis(m: GlbMesh): Vec3 {
  const convention = rotateByQuat(m.pose.rotation, LOCAL_ENGAGE);
  const g = fastenerGeometry(m);
  const agree = Math.abs(dot(g.axis, convention)) >= AGREE_COS_MIN;
  let axis: Vec3 = agree ? convention : dot(g.axis, convention) < 0 ? neg(g.axis) : g.axis;
  if (g.engage && dot(g.engage, axis) < 0) axis = neg(axis);
  return axis;
}

// World offset origin → mesh bounds centre.
const visualCenterOffset = (m: GlbMesh): number[] =>
  round(rotateByQuat(m.pose.rotation, m.bounds.min.map((v, i) => ((v + m.bounds.max[i]) / 2) * m.scale[i]) as Vec3), 6);

const conj = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];

// World offset origin → HEAD END of the bounding box, measured along the SAME axis `engageDir` resolved to. ToolModel projects this onto the live tool axis so the tool meets the head instead of hovering a fixed gap off the ORIGIN — so the two have to agree on which end the head is. Pinning it to the local −Z face instead assumed the export convention always holds: for EKET's 8 cams and 8 pins, whose measured shaft overrides that convention by ~85°, the offset came out at right angles to the drive axis and ToolModel's projection cancelled a real 5.2–5.8mm to zero, putting the tool back on the origin this field exists to move it off.
// Identical to the old value wherever the convention DOES hold: there the axis is world(local −Z), the support point is the −Z face centre, and the arithmetic is the same. An instance whose engageDir is then overridden by hand to a different axis wants `toolAnchor`, which is stated in world offsets and wins outright.
function headOffset(m: GlbMesh, axis: Vec3): number[] {
  const a = rotateByQuat(conj(m.pose.rotation), axis);
  const c: Vec3 = [((m.bounds.min[0] + m.bounds.max[0]) / 2) * m.scale[0], ((m.bounds.min[1] + m.bounds.max[1]) / 2) * m.scale[1], ((m.bounds.min[2] + m.bounds.max[2]) / 2) * m.scale[2]];
  const half: Vec3 = [((m.bounds.max[0] - m.bounds.min[0]) / 2) * m.scale[0], ((m.bounds.max[1] - m.bounds.min[1]) / 2) * m.scale[1], ((m.bounds.max[2] - m.bounds.min[2]) / 2) * m.scale[2]];
  // Support point of the box along `a` — the box corner/face the axis reaches furthest toward, which for a cardinal `a` is exactly that face's centre.
  const reach = Math.abs(half[0] * a[0]) + Math.abs(half[1] * a[1]) + Math.abs(half[2] * a[2]);
  return round(rotateByQuat(m.pose.rotation, [c[0] + a[0] * reach, c[1] + a[1] * reach, c[2] + a[2] * reach]), 6);
}

function buildParts(meshes: readonly GlbMesh[], typeOverrides: Record<string, "structural" | "fastener">) {
  const parts: Record<string, unknown> = {};
  for (const m of meshes) {
    const type = typeOverrides[m.group] ?? (m.attached?.length === 2 || isFastenerName(m.group) ? "fastener" : "structural");
    // Resolved once: engageAxis runs the vertex PCA, and engageDir and headOffset are two readings of the same answer.
    const axis = type === "fastener" ? engageAxis(m) : null;
    parts[m.partId] = {
      partId: m.partId,
      group: m.group,
      meshName: m.meshName,
      type,
      cluster: m.cluster,
      ...(m.attached ? { attached: m.attached } : {}),
      visualCenterOffset: visualCenterOffset(m),
      // NO role field: the furniture's FASTENERS def states it and derive-structure.mts writes it into structure.gen (core/derive/fasteners.ts).
      ...(axis ? { engageDir: snapAxis(axis), headOffset: headOffset(m, axis) } : {}),
      pose: { position: round(m.pose.position, 6), rotation: round(m.pose.rotation, 6) },
    };
  }
  return parts;
}

function emit(id: string, parts: Record<string, unknown>) {
  const body = Object.entries(parts)
    .map(([pid, d]) => `  ${JSON.stringify(pid)}: ${JSON.stringify(d)},`)
    .join("\n");
  const out = path.join(OUT, id, "parts.gen.ts");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    `// GENERATED by src/game/helper-scripts/read-parts.mts — do not edit by hand.
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
  const meshes = readGlbMeshes(fs.readFileSync(path.join(MODELS, id, `${id}.glb`)));
  emit(id, buildParts(meshes, cfg.typeOverrides));
}
