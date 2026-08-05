// Software fallback for thumbnail rendering.
//
// Run from the modi project root:
//   npm run render:thumbs:soft
//   npm run gen:thumbs
//
// Blender thumbnails look nicer, but Blender can fail before Python starts on some local Metal setups. This script reads GLB meshes directly and renders a simple transparent orthographic PNG for missing furniture, part, and tool thumbnails. Pass --force to overwrite existing PNGs.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { Buffer } from "node:buffer";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(SCRIPT_DIR, "..", "..");
const FURNITURE_MODELS = path.join(SRC, "assets", "models", "furnitures");
const TOOL_MODELS = path.join(SRC, "assets", "models", "tools");
const OUT = path.join(SRC, "assets", "thumbnails");

const SIZE = 256;
const FORCE = process.argv.includes("--force");
const VIEW_DIR = normalize([1, -1, 0.8]);
const LIGHT_DIR = normalize([0.2, -0.45, 0.9]);

function readGlb(glbPath) {
  const buf = fs.readFileSync(glbPath);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${glbPath}: not a GLB`);

  let json = null;
  let bin = null;
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString("utf8"));
    if (type === 0x004e4942) bin = data;
    offset += 8 + length;
  }
  if (!json || !bin) throw new Error(`${glbPath}: missing JSON or BIN chunk`);
  return { json, bin };
}

function componentInfo(componentType) {
  switch (componentType) {
    case 5120:
      return { size: 1, read: (b, o) => b.readInt8(o) };
    case 5121:
      return { size: 1, read: (b, o) => b.readUInt8(o) };
    case 5122:
      return { size: 2, read: (b, o) => b.readInt16LE(o) };
    case 5123:
      return { size: 2, read: (b, o) => b.readUInt16LE(o) };
    case 5125:
      return { size: 4, read: (b, o) => b.readUInt32LE(o) };
    case 5126:
      return { size: 4, read: (b, o) => b.readFloatLE(o) };
    default:
      throw new Error(`unsupported glTF component type ${componentType}`);
  }
}

function componentCount(type) {
  return { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[type] ?? 1;
}

function readAccessor(json, bin, accessorIndex) {
  const acc = json.accessors[accessorIndex];
  if (acc.sparse) throw new Error("sparse accessors are not supported");
  const view = json.bufferViews[acc.bufferView];
  const info = componentInfo(acc.componentType);
  const count = componentCount(acc.type);
  const byteOffset = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const stride = view.byteStride ?? info.size * count;
  const out = [];
  for (let i = 0; i < acc.count; i++) {
    const item = [];
    const base = byteOffset + i * stride;
    for (let c = 0; c < count; c++) {
      item.push(info.read(bin, base + c * info.size));
    }
    out.push(count === 1 ? item[0] : item);
  }
  return out;
}

function materialColor(json, materialIndex) {
  const factor = json.materials?.[materialIndex]?.pbrMetallicRoughness?.baseColorFactor;
  const c = factor ?? [0.74, 0.69, 0.6, 1];
  return [c[0], c[1], c[2], c[3] ?? 1];
}

// Cluster id = the first segment of a node name (cluster_group_index), e.g.
// "base_leg_1" → "base", "seat_pole" → "seat". Lets us render one cluster's nodes out of the combined GLB.
const clusterOf = (name) => (name ?? "").split("_")[0];

function collectTriangles(glbPath, clusterFilter = null) {
  const { json, bin } = readGlb(glbPath);
  const scene = json.scenes?.[json.scene ?? 0];
  const childRefs = new Set();
  for (const node of json.nodes ?? []) {
    for (const child of node.children ?? []) childRefs.add(child);
  }
  const roots = scene?.nodes ?? json.nodes?.map((_, index) => index).filter((i) => !childRefs.has(i)) ?? [];
  const triangles = [];
  const vertices = [];

  const visit = (nodeIndex, parent) => {
    const node = json.nodes[nodeIndex];
    const world = multiplyMat4(parent, nodeMatrix(node));
    if (node.mesh != null && (!clusterFilter || clusterOf(node.name) === clusterFilter)) {
      const mesh = json.meshes[node.mesh];
      for (const prim of mesh.primitives ?? []) {
        if (prim.mode != null && prim.mode !== 4) continue;
        const posIndex = prim.attributes?.POSITION;
        if (posIndex == null) continue;
        const positions = readAccessor(json, bin, posIndex).map((p) => transformPoint(world, p));
        const indices = prim.indices == null ? null : readAccessor(json, bin, prim.indices);
        const color = materialColor(json, prim.material);
        const indexAt = (i) => (indices ? indices[i] : i);
        const triCount = Math.floor((indices?.length ?? positions.length) / 3);
        for (let i = 0; i < triCount; i++) {
          const a = positions[indexAt(i * 3)];
          const b = positions[indexAt(i * 3 + 1)];
          const c = positions[indexAt(i * 3 + 2)];
          if (!a || !b || !c) continue;
          triangles.push({ a, b, c, color });
          vertices.push(a, b, c);
        }
      }
    }
    for (const child of node.children ?? []) visit(child, world);
  };

  for (const root of roots) visit(root, identityMat4());
  return { triangles, vertices };
}

function renderGlb(glbPath, outPath, clusterFilter = null) {
  const { triangles, vertices } = collectTriangles(glbPath, clusterFilter);
  if (!triangles.length || !vertices.length) {
    console.warn(`skip ${path.basename(glbPath)}${clusterFilter ? ` [${clusterFilter}]` : ""}: no triangles`);
    return false;
  }

  const bounds = projectedBounds(vertices);
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 0.001);
  const scale = span * 1.26;
  const midX = (bounds.minX + bounds.maxX) / 2;
  const midY = (bounds.minY + bounds.maxY) / 2;
  const zbuf = new Float64Array(SIZE * SIZE).fill(-Infinity);
  const rgba = new Uint8ClampedArray(SIZE * SIZE * 4);
  const mask = new Uint8Array(SIZE * SIZE);

  for (const tri of triangles) {
    const p0 = projectPoint(tri.a, midX, midY, scale);
    const p1 = projectPoint(tri.b, midX, midY, scale);
    const p2 = projectPoint(tri.c, midX, midY, scale);
    rasterTriangle(p0, p1, p2, tri, zbuf, rgba, mask);
  }

  const png = new Uint8ClampedArray(SIZE * SIZE * 4);
  drawShadowAndOutline(png, mask);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    png[i * 4] = rgba[i * 4];
    png[i * 4 + 1] = rgba[i * 4 + 1];
    png[i * 4 + 2] = rgba[i * 4 + 2];
    png[i * 4 + 3] = rgba[i * 4 + 3];
  }
  fs.writeFileSync(outPath, encodePng(SIZE, SIZE, png));
  return true;
}

function projectedBounds(vertices) {
  const upSeed = [0, 1, 0];
  const right = normalize(cross(upSeed, VIEW_DIR));
  const up = normalize(cross(VIEW_DIR, right));
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of vertices) {
    const x = dot(p, right);
    const y = dot(p, up);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY, right, up };
}

function projectPoint(p, midX, midY, scale) {
  const right = normalize(cross([0, 1, 0], VIEW_DIR));
  const up = normalize(cross(VIEW_DIR, right));
  const x = dot(p, right);
  const y = dot(p, up);
  return {
    x: ((x - midX) / scale + 0.5) * SIZE,
    y: (0.5 - (y - midY) / scale) * SIZE,
    z: dot(p, VIEW_DIR),
    p,
  };
}

function rasterTriangle(p0, p1, p2, tri, zbuf, rgba, mask) {
  const minX = Math.max(0, Math.floor(Math.min(p0.x, p1.x, p2.x)));
  const maxX = Math.min(SIZE - 1, Math.ceil(Math.max(p0.x, p1.x, p2.x)));
  const minY = Math.max(0, Math.floor(Math.min(p0.y, p1.y, p2.y)));
  const maxY = Math.min(SIZE - 1, Math.ceil(Math.max(p0.y, p1.y, p2.y)));
  const area = edge(p0, p1, p2);
  if (Math.abs(area) < 0.0001) return;

  const normal = normalize(cross(sub(tri.b, tri.a), sub(tri.c, tri.a)));
  const shade = 0.58 + 0.42 * Math.max(0, Math.abs(dot(normal, LIGHT_DIR)));
  const alpha = Math.round((tri.color[3] ?? 1) * 255);
  const base = tri.color.slice(0, 3).map((v) => Math.max(0.12, Math.min(0.92, v)));
  const color = base.map((v) => Math.round(v * shade * 255));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const p = { x: x + 0.5, y: y + 0.5 };
      const w0 = edge(p1, p2, p) / area;
      const w1 = edge(p2, p0, p) / area;
      const w2 = edge(p0, p1, p) / area;
      if (w0 < -0.0001 || w1 < -0.0001 || w2 < -0.0001) continue;
      const z = w0 * p0.z + w1 * p1.z + w2 * p2.z;
      const index = y * SIZE + x;
      if (z <= zbuf[index]) continue;
      zbuf[index] = z;
      mask[index] = 1;
      rgba[index * 4] = color[0];
      rgba[index * 4 + 1] = color[1];
      rgba[index * 4 + 2] = color[2];
      rgba[index * 4 + 3] = alpha;
    }
  }
}

function drawShadowAndOutline(data, mask) {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const index = y * SIZE + x;
      if (!mask[index]) continue;
      for (const [dx, dy, alpha] of [
        [1, 0, 84],
        [-1, 0, 84],
        [0, 1, 84],
        [0, -1, 84],
        [3, 5, 34],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) continue;
        const n = ny * SIZE + nx;
        if (mask[n]) continue;
        const o = n * 4;
        data[o] = 43;
        data[o + 1] = 39;
        data[o + 2] = 33;
        data[o + 3] = Math.max(data[o + 3], alpha);
      }
    }
  }
}

function edge(a, b, c) {
  return (c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x);
}

function identityMat4() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function nodeMatrix(node) {
  if (node.matrix) return node.matrix;
  const t = node.translation ?? [0, 0, 0];
  const r = node.rotation ?? [0, 0, 0, 1];
  const s = node.scale ?? [1, 1, 1];
  const [x, y, z, w] = r;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0],
    (xy + wz) * s[0],
    (xz - wy) * s[0],
    0,
    (xy - wz) * s[1],
    (1 - (xx + zz)) * s[1],
    (yz + wx) * s[1],
    0,
    (xz + wy) * s[2],
    (yz - wx) * s[2],
    (1 - (xx + yy)) * s[2],
    0,
    t[0],
    t[1],
    t[2],
    1,
  ];
}

function multiplyMat4(a, b) {
  const out = new Array(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

function transformPoint(m, [x, y, z]) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function normalize(v) {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, rowStart + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, crc]);
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Each render targets a PNG under the organised thumbnail tree (light theme):
//   furnitures/<ID>/light/<ID>.png        furniture preview furnitures/<ID>/light/parts/<base>.png part thumbnails tools/<base>.png                       shared tool thumbnails Dark variants go in the parallel dark/ folder once a dark render exists.
function pngName(glb) {
  return `${path.basename(glb, ".glb")}.png`;
}

// Distinct clusters present in a combined GLB (from mesh node-name prefixes).
function clustersInGlb(glbPath) {
  const { json } = readGlb(glbPath);
  const set = new Set();
  for (const node of json.nodes ?? []) {
    if (node.mesh != null && node.name) set.add(clusterOf(node.name));
  }
  return [...set];
}

function renderJobs() {
  const jobs = [];
  for (const id of fs.readdirSync(FURNITURE_MODELS).sort()) {
    const furnitureDir = path.join(FURNITURE_MODELS, id);
    if (!fs.statSync(furnitureDir).isDirectory()) continue;
    const lightDir = path.join(OUT, "furnitures", id, "light");
    const whole = path.join(furnitureDir, `${id}.glb`);
    if (fs.existsSync(whole)) {
      jobs.push({ glb: whole, out: path.join(lightDir, `${id}.png`) });
      // Per-cluster previews (only for multi-cluster furniture — the combine step).
      const clusters = clustersInGlb(whole);
      if (clusters.length > 1) {
        for (const c of clusters) {
          jobs.push({ glb: whole, out: path.join(lightDir, "clusters", `${c}.png`), cluster: c });
        }
      }
    }
    const partsDir = path.join(furnitureDir, "parts");
    if (!fs.existsSync(partsDir)) continue;
    for (const file of fs.readdirSync(partsDir).sort()) {
      if (!file.endsWith(".glb")) continue;
      jobs.push({ glb: path.join(partsDir, file), out: path.join(lightDir, "parts", pngName(file)) });
    }
  }
  if (fs.existsSync(TOOL_MODELS)) {
    for (const file of fs.readdirSync(TOOL_MODELS).sort()) {
      if (!file.endsWith(".glb")) continue;
      jobs.push({ glb: path.join(TOOL_MODELS, file), out: path.join(OUT, "tools", "light", pngName(file)) });
    }
  }
  return jobs;
}

let wrote = 0;
for (const { glb, out, cluster } of renderJobs()) {
  if (!FORCE && fs.existsSync(out)) continue;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (renderGlb(glb, out, cluster ?? null)) {
    wrote += 1;
    console.log(`thumb: ${path.relative(SRC, out)}`);
  }
}
console.log(`done: wrote ${wrote} thumbnail${wrote === 1 ? "" : "s"}`);
