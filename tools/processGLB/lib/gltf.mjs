import fs from "node:fs";

export function parseGlb(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a GLB`);
  const jsonLen = b.readUInt32LE(12);
  if (b.readUInt32LE(16) !== 0x4e4f534a) throw new Error(`${file}: chunk 0 isn't JSON`);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString("utf8"));
  const off = 20 + jsonLen;
  if (b.readUInt32LE(off + 4) !== 0x004e4942) throw new Error(`${file}: no BIN chunk`);
  const bin = b.subarray(off + 8, off + 8 + b.readUInt32LE(off));
  return { json, bin };
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

/** TRS -> column-major 4x4 (glTF convention). */
export function trsToMat4(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = q, [sx, sy, sz] = s;
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z,
    yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [
    (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
    2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
    2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    t[0], t[1], t[2], 1,
  ];
}

export function mulMat4(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      o[c * 4 + r] =
        a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}

export function transformPoint(m, [x, y, z]) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

export function parentIndex(json) {
  const p = new Map();
  (json.nodes ?? []).forEach((n, i) => (n.children ?? []).forEach((c) => p.set(c, i)));
  return p;
}

export function worldMatrix(json, idx, parents, cache = new Map()) {
  if (cache.has(idx)) return cache.get(idx);
  const n = json.nodes[idx];
  const local = n.matrix ? [...n.matrix] : trsToMat4(n.translation, n.rotation, n.scale);
  const p = parents.get(idx);
  const m = p == null ? local : mulMat4(worldMatrix(json, p, parents, cache), local);
  cache.set(idx, m);
  return m;
}
