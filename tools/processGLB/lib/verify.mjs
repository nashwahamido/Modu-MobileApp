// tools/processGLB/lib/verify.mjs — post-export gate.
import { parseGlb, readVec3 } from "./gltf.mjs";
import { parseName, partIdOf } from "./naming.mjs";

const rotq = ([x, y, z, w], [vx, vy, vz]) => {
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
};

export function verifyGlb(glbPath, fastenerPrefixes) {
  const { json, bin } = parseGlb(glbPath);
  const errors = [], warnings = [];
  const child = new Set();
  for (const nd of json.nodes ?? []) for (const c of nd.children ?? []) child.add(c);

  const pids = [];
  (json.nodes ?? []).forEach((nd, idx) => {
    if (!nd.name || nd.mesh == null) return;
    if (child.has(idx)) errors.push(`${nd.name}: parented (read-parts reads nodes flat)`);
    if (nd.matrix) errors.push(`${nd.name}: matrix transform (read-parts throws)`);
    const p = parseName(nd.name);
    if (!p.cluster || !p.group) errors.push(`${nd.name}: does not parse as cluster_group[...]`);
    pids.push(partIdOf(nd.name));

    const isFast = fastenerPrefixes.some((x) => p.group?.toLowerCase().startsWith(x)) || p.attached?.length === 2;
    if (!isFast) return;
    const rot = nd.rotation ?? [0, 0, 0, 1], scl = nd.scale ?? [1, 1, 1];
    const eng = rotq(rot, [0, 0, -1]);
    let wmin = [Infinity, Infinity, Infinity], wmax = [-Infinity, -Infinity, -Infinity];
    for (const prim of json.meshes[nd.mesh].primitives) {
      if (prim.attributes.POSITION == null) continue;
      for (const v of readVec3(json, bin, prim.attributes.POSITION)) {
        const r = rotq(rot, [v[0] * scl[0], v[1] * scl[1], v[2] * scl[2]]);
        for (let i = 0; i < 3; i++) { if (r[i] < wmin[i]) wmin[i] = r[i]; if (r[i] > wmax[i]) wmax[i] = r[i]; }
      }
    }
    const dims = wmax.map((v, i) => v - wmin[i]);
    const shaft = dims.indexOf(Math.max(...dims));
    const aspect = dims[shaft] / ([...dims].sort((a, b) => a - b)[1] || 1e-9);
    // aspect >= 1.6 is the gate: near-cubic fasteners (cam-shaped etc.) have no well-defined
    // single shaft axis, so an ambiguous/diagonal engage direction on them is expected, not
    // an error -- only elongated fasteners are held to the axis-parallel check.
    if (aspect >= 1.6) {
      const engAxis = eng.findIndex((c) => Math.abs(c) > 0.9);
      if (engAxis === -1) errors.push(`${nd.name}: engage is diagonal ${eng.map((c) => c.toFixed(2))}`);
      else if (engAxis !== shaft)
        errors.push(`${nd.name}: engage axis ${"XYZ"[engAxis]} not parallel to shaft ${"XYZ"[shaft]}`);
    }
  });

  const dup = pids.filter((p, i) => pids.indexOf(p) !== i);
  if (dup.length) errors.push(`duplicate partIds: ${[...new Set(dup)].join(", ")}`);
  const pidSet = new Set(pids);
  for (const nd of json.nodes ?? []) {
    const att = nd.name && parseName(nd.name).attached;
    if (att) for (const ep of att) if (!pidSet.has(ep)) errors.push(`${nd.name}: dangling endpoint "${ep}"`);
  }
  return { errors, warnings };
}
