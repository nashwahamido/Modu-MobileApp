// Derive each fastener's shaft axis, engage sign and TOOL ANCHOR from its GLB mesh, then diff against what the pipeline currently trusts: the exported engageDir in parts.gen (convention: shaft on Blender-local Y) and the node-origin-at-tool-point convention. Prototype for flipping those conventions from load-bearing to derived — eventually a processGLB lib module (verify/apply).
//
//   node src/game/helper-scripts/derive-fasteners.mjs [ID ...]
//
// Per fastener it reports:
//   shape    rod | disc (rotational-symmetry-scored PCA; a cam's axis is its short axis)
//   engage   angle between derived engage (head→outward, world) and parts.gen engageDir
//            OK ≤6° · FLIPPED ≥174° (sign wrong) · MISMATCH otherwise · AXIS-ONLY when the
//            head is geometrically ambiguous (symmetric double-ended hardware)
//   anchor   |derived tool anchor − node origin| — the head's outer-face centre on the axis;
//            conforming exports have it at the origin (that's the tool-point convention)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MODELS = path.join(ROOT, "..", "..", "assets", "models", "furnitures");
const DATA = path.join(ROOT, "..", "data", "furnitures");

const ANGLE_OK_DEG = 6;
const ANCHOR_OK_M = 0.006; // ≤6mm counts as "origin is at the tool point" — the derived anchor sits on the head's OUTER extreme, so a conforming origin (at the head's underside plane) still reads a head-cap-thickness away (DALFRED screws: 2.6–3.9mm)
const HEAD_RATIO = 1.15; // end-radius ratio that counts as a detectable head

// ───────── GLB parsing (same format read-parts/extract-structure handle) ─────────
export function parseGlb(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a GLB`);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString("utf8"));
  const off = 20 + jsonLen;
  if (b.readUInt32LE(off + 4) !== 0x004e4942) throw new Error(`${file}: no BIN chunk`);
  return { json, bin: b.subarray(off + 8, off + 8 + b.readUInt32LE(off)) };
}
export function readVec3(json, bin, ai) {
  const acc = json.accessors[ai];
  const bv = json.bufferViews[acc.bufferView];
  const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const stride = bv.byteStride ?? 12;
  const out = new Array(acc.count);
  for (let i = 0; i < acc.count; i++) {
    const o = base + i * stride;
    out[i] = [bin.readFloatLE(o), bin.readFloatLE(o + 4), bin.readFloatLE(o + 8)];
  }
  return out;
}
export const rotQ = ([x, y, z, w], [vx, vy, vz]) => {
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
};

// ───────── tiny vector + eigen helpers ─────────
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const norm = (a) => Math.hypot(a[0], a[1], a[2]);
export const unit = (a) => mul(a, 1 / (norm(a) || 1));

/** Eigenvectors of a symmetric 3×3 (cyclic Jacobi). Returns [{value, vector}] sorted desc. */
function eig3(m) {
  let a = m.map((r) => [...r]);
  let v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 24; sweep++) {
    let off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
    if (off < 1e-14) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[p][q]) < 1e-15) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      const app = a[p][p], aqq = a[q][q], apq = a[p][q];
      a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
      a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
      a[p][q] = a[q][p] = 0;
      for (let k = 0; k < 3; k++) {
        if (k !== p && k !== q) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = a[p][k] = c * akp - s * akq;
          a[k][q] = a[q][k] = s * akp + c * akq;
        }
        const vkp = v[k][p], vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq;
        v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  return [0, 1, 2]
    .map((i) => ({ value: a[i][i], vector: unit([v[0][i], v[1][i], v[2][i]]) }))
    .sort((x, y) => y.value - x.value);
}

// ───────── parts.gen loading (PARTS_RAW is strict JSON per line) ─────────
export function loadPartsGen(id) {
  const src = fs.readFileSync(path.join(DATA, id, "parts.gen.ts"), "utf8");
  const m = src.match(/const PARTS_RAW = \{([\s\S]*?)\} satisfies/);
  if (!m) throw new Error(`${id}: PARTS_RAW not found`);
  return JSON.parse(`{${m[1].trim().replace(/,\s*$/, "")}}`);
}

// ───────── per-fastener geometry analysis ─────────
/**
 * All in node-LOCAL space unless suffixed World. Returns null for empty meshes.
 * axis     unit shaft/symmetry axis (local, sign meaningless until head chosen)
 * shape    "rod" | "disc"
 * tHead    signed axis coordinate (from projected centroid) of the head extreme
 * headSure true when the radius profile alone identified the head
 */
export function analyse(verts) {
  const n = verts.length;
  if (!n) return null;
  const step = Math.max(1, Math.floor(n / 2500));
  const pts = [];
  for (let i = 0; i < n; i += step) pts.push(verts[i]);
  const c = mul(pts.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / pts.length);
  const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) {
    const d = sub(p, c);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i][j] += d[i] * d[j];
  }
  const es = eig3(cov);

  // The shaft is whichever eigenvector the mesh is most ROTATIONALLY SYMMETRIC about (variance ranking alone mistakes a cam disc's diameter for its axis): bin by axial position, score the radius spread per bin.
  let best = null;
  for (const e of es) {
    const ts = pts.map((p) => dot(sub(p, c), e.vector));
    const tMin = Math.min(...ts), tMax = Math.max(...ts);
    const span = tMax - tMin || 1e-9;
    const B = 16;
    const sums = Array.from({ length: B }, () => ({ n: 0, r: 0, r2: 0 }));
    for (let i = 0; i < pts.length; i++) {
      const d = sub(pts[i], c);
      const r = norm(sub(d, mul(e.vector, ts[i])));
      const bin = Math.min(B - 1, Math.floor(((ts[i] - tMin) / span) * B));
      sums[bin].n++;
      sums[bin].r += r;
      sums[bin].r2 += r * r;
    }
    let score = 0, used = 0;
    for (const s of sums) {
      if (s.n < 4) continue;
      const mean = s.r / s.n;
      const sd = Math.sqrt(Math.max(0, s.r2 / s.n - mean * mean));
      score += sd / (mean + 1e-6);
      used++;
    }
    if (!used) continue;
    score /= used;
    const cand = { axis: e.vector, ts, tMin, tMax, span, sums, score };
    if (!best || score < best.score) best = cand;
  }
  if (!best) return null;

  // extents perpendicular to the chosen axis → rod vs disc
  let rMax = 0;
  for (let i = 0; i < pts.length; i++) {
    const d = sub(pts[i], c);
    const r = norm(sub(d, mul(best.axis, best.ts[i])));
    if (r > rMax) rMax = r;
  }
  const shape = best.span >= 1.4 * 2 * rMax ? "rod" : "disc";

  // ── head detection: wide end by OUTER envelope ──
  // "head = wide end" holds (user-confirmed) — but measured on the OUTER radius envelope, never the mean: the screwdriver recess cut into a head fills its bins with small-radius vertices, dragging the MEAN below the shank's and flipping the verdict (the 2026-07-23 EKET screw100349 incident: a correct mesh read as "mounted backwards"; a thread-first variant then repeated the mistake by reading the recess roughness as threads). Per-bin p95 radius = the envelope with a little outlier armour.
  const B2 = Math.max(16, Math.min(48, Math.round(best.span / 0.0008)));
  const binR = Array.from({ length: B2 }, () => []);
  for (let i = 0; i < pts.length; i++) {
    const d = sub(pts[i], c);
    const r = norm(sub(d, mul(best.axis, best.ts[i])));
    const b = Math.min(B2 - 1, Math.floor(((best.ts[i] - best.tMin) / best.span) * B2));
    binR[b].push(r);
  }
  const p95 = (xs) => {
    const s = [...xs].sort((x, y) => x - y);
    return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))];
  };
  const bOuter = binR.map((xs) => (xs.length >= 3 ? p95(xs) : NaN));
  if (process.env.DUMP_PROFILE) {
    console.log(
      `PROFILE B2=${B2} span=${(best.span * 1000).toFixed(1)}mm verts=${n}\n` +
        bOuter
          .map((r, i) =>
            Number.isFinite(r)
              ? `  bin${String(i).padStart(2)} outer=${(r * 1000).toFixed(2)}mm (n=${binR[i].length})`
              : `  bin${String(i).padStart(2)} (empty)`,
          )
          .join("\n"),
    );
  }
  // outer envelope over each END 20% of the axial span
  const endOuter = (lo) => {
    const from = lo ? 0 : Math.floor(B2 * 0.8);
    const to = lo ? Math.ceil(B2 * 0.2) : B2;
    let m = 0;
    for (let i = from; i < to; i++) if (Number.isFinite(bOuter[i]) && bOuter[i] > m) m = bOuter[i];
    return m;
  };
  const rLo = endOuter(true), rHi = endOuter(false);
  const ratio = (Math.max(rLo, rHi) + 1e-9) / (Math.min(rLo, rHi) + 1e-9);
  // provisional either way — when the ratio is inconclusive the driver may override via attached-context
  const tHead = rHi > rLo ? best.tMax : best.tMin;
  const headBasis = ratio >= HEAD_RATIO ? "radius" : null;
  return { centroid: c, axis: best.axis, shape, symmetry: best.score, tMin: best.tMin, tMax: best.tMax, tHead, headBasis };
}

// ───────── driver ─────────
import { pathToFileURL } from "node:url";
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
const IDS = !isMain ? [] : process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(MODELS, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(MODELS, d.name, `${d.name}.glb`)))
      .map((d) => d.name)
      .sort();

const deg = (rad) => (rad * 180) / Math.PI;
const mm = (m) => (m * 1000).toFixed(1);
const fmtV = (v) => `[${v.map((x) => x.toFixed(3)).join(",")}]`;

let totals = { ok: 0, flipped: 0, mismatch: 0, axisOnly: 0, anchorOff: 0, fasteners: 0 };

for (const id of IDS) {
  const { json, bin } = parseGlb(path.join(MODELS, id, `${id}.glb`));
  const gen = loadPartsGen(id);
  const byMesh = Object.fromEntries(Object.values(gen).map((p) => [p.meshName, p]));

  // world AABB per node — context for tip disambiguation (the tip end is embedded in an attached partner; the head/tool end is exposed)
  const nodeInfo = new Map();
  for (const nd of json.nodes ?? []) {
    if (!nd.name || nd.mesh == null) continue;
    const t = nd.translation ?? [0, 0, 0], q = nd.rotation ?? [0, 0, 0, 1], s = nd.scale ?? [1, 1, 1];
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    let localVerts = [];
    for (const prim of json.meshes[nd.mesh].primitives) {
      if (prim.attributes.POSITION == null) continue;
      const vs = readVec3(json, bin, prim.attributes.POSITION);
      localVerts = localVerts.concat(vs);
      for (const v of vs) {
        const w = add(rotQ(q, [v[0] * s[0], v[1] * s[1], v[2] * s[2]]), t);
        for (let k = 0; k < 3; k++) {
          if (w[k] < min[k]) min[k] = w[k];
          if (w[k] > max[k]) max[k] = w[k];
        }
      }
    }
    nodeInfo.set(nd.name, { t, q, s, localVerts, min, max });
  }
  const gapToAabb = (p, box) => {
    let g = 0;
    for (let k = 0; k < 3; k++) {
      const d = Math.max(box.min[k] - p[k], p[k] - box.max[k], 0);
      g += d * d;
    }
    return Math.sqrt(g);
  };

  console.log(`\n══ ${id} ══`);
  const lines = [];
  for (const part of Object.values(gen)) {
    if (part.type !== "fastener") continue;
    totals.fasteners++;
    const node = nodeInfo.get(part.meshName);
    if (!node?.localVerts.length) {
      lines.push(`  ${part.partId}: NO MESH DATA`);
      continue;
    }
    const a = analyse(node.localVerts);
    if (!a) {
      lines.push(`  ${part.partId}: analysis failed`);
      continue;
    }
    const toWorldDir = (v) => rotQ(node.q, v);
    const axisPoint = (t) => add(a.centroid, mul(a.axis, t)); // local point on the axis line
    const toWorldPt = (v) => add(rotQ(node.q, [v[0] * node.s[0], v[1] * node.s[1], v[2] * node.s[2]]), node.t);

    // choose the head end: thread/radius analysis when it speaks, else the end FARTHEST from the attached partners (tip embeds, head stays exposed)
    let tHead = a.tHead;
    let headBasis = a.headBasis;
    if (!headBasis && part.attached?.length) {
      const boxes = part.attached.map((pid) => {
        const mesh = Object.values(gen).find((g) => g.partId === pid)?.meshName;
        return mesh ? nodeInfo.get(mesh) : null;
      }).filter(Boolean);
      if (boxes.length) {
        const gapOf = (t) => Math.min(...boxes.map((b) => gapToAabb(toWorldPt(axisPoint(t)), b)));
        const embedLo = gapOf(a.tMin), embedHi = gapOf(a.tMax);
        if (Math.abs(embedLo - embedHi) > 1e-4) {
          tHead = embedLo > embedHi ? a.tMin : a.tMax; // head = MORE exposed end
          headBasis = "context";
        }
      }
    }
    const tTip = tHead === a.tMax ? a.tMin : a.tMax;
    const engageDerived = unit(toWorldDir(mul(a.axis, Math.sign(tHead - tTip))));

    // engage verdict vs the exported engageDir
    const cat = part.engageDir ? unit(part.engageDir) : null;
    let engageMsg = "no catalog engageDir";
    if (cat) {
      const angle = deg(Math.acos(Math.max(-1, Math.min(1, dot(engageDerived, cat)))));
      if (!headBasis) {
        const axisAngle = Math.min(angle, 180 - angle);
        engageMsg = `AXIS-ONLY ${axisAngle.toFixed(1)}° (symmetric — sign undecidable)`;
        totals.axisOnly++;
      } else if (angle <= ANGLE_OK_DEG) {
        engageMsg = `OK ${angle.toFixed(1)}°`;
        totals.ok++;
      } else if (angle >= 180 - ANGLE_OK_DEG) {
        engageMsg = `FLIPPED (${angle.toFixed(1)}°)`;
        totals.flipped++;
      } else {
        engageMsg = `MISMATCH ${angle.toFixed(1)}°`;
        totals.mismatch++;
      }
    }

    // tool anchor: the head's outer-face centre on the axis — convention says the node origin sits here
    const anchorLocal = axisPoint(tHead);
    const offset = norm(anchorLocal);
    const anchorMsg =
      offset <= ANCHOR_OK_M
        ? `OK ${mm(offset)}mm`
        : `OFF ${mm(offset)}mm local ${fmtV(anchorLocal)}`;
    if (offset > ANCHOR_OK_M) totals.anchorOff++;

    // symmetry ≥0.2 marked needs-human: the EKET screw109041 misread sat at 0.22–0.25 while every clean screw scored ≤0.19 — verdicts above the line are proposals, not findings
    const conf = a.symmetry >= 0.2 ? "  ⚠needs-human(sym)" : "";
    lines.push(
      `  ${part.partId.padEnd(18)} ${a.shape.padEnd(4)} sym=${a.symmetry.toFixed(2)} head:${(headBasis ?? "?").padEnd(7)} engage: ${engageMsg.padEnd(34)} anchor: ${anchorMsg}${conf}`,
    );
    // DUMP=group1,group2 prints machine-readable derived values for patching
    if ((process.env.DUMP ?? "").split(",").filter(Boolean).some((g) => part.group === g)) {
      const headW = toWorldPt(axisPoint(tHead));
      const tipW = toWorldPt(axisPoint(tTip));
      console.log(
        `DUMP ${part.partId} engageDerived=${JSON.stringify(engageDerived.map((x) => +x.toFixed(6)))} headW=${fmtV(headW)} tipW=${fmtV(tipW)} catalog=${JSON.stringify(part.engageDir)}`,
      );
    }
  }
  // collapse identical geometry lines per group for readability
  const seen = new Map();
  for (const l of lines) {
    const grp = l.trim().split(/[_\s]/)[0];
    const rest = l.replace(/^ {2}\S+/, "");
    const key = grp + rest;
    if (seen.has(key)) seen.get(key).count++;
    else seen.set(key, { line: l, count: 1 });
  }
  for (const { line, count } of seen.values()) console.log(count > 1 ? `${line}  ×${count}` : line);
}

console.log(
  `\nTOTAL fasteners=${totals.fasteners}  engage OK=${totals.ok} flipped=${totals.flipped} mismatch=${totals.mismatch} axis-only=${totals.axisOnly}  anchor OFF=${totals.anchorOff}`,
);
