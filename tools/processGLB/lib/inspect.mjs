import { readVec3, parentIndex, worldMatrix, transformPoint } from "./gltf.mjs";

export function shaftOf(dims) {
  const axis = dims.indexOf(Math.max(...dims));
  const mid = [...dims].sort((a, b) => a - b)[1] || 1e-9;
  return { axis, aspect: dims[axis] / mid };
}

/** Which end of the shaft is the bulkier (head/loose) end: compare the
 *  perpendicular spread of the outer 15% slabs. Ties -> +1. */
export function headSignOf(verts, axisIdx) {
  let lo = Infinity, hi = -Infinity;
  for (const v of verts) { if (v[axisIdx] < lo) lo = v[axisIdx]; if (v[axisIdx] > hi) hi = v[axisIdx]; }
  const rng = hi - lo || 1e-9;
  const perp = [0, 1, 2].filter((i) => i !== axisIdx);
  const spread = (sel) => {
    if (!sel.length) return 0;
    let s = 0;
    for (const i of perp) {
      let a = Infinity, b = -Infinity;
      for (const v of sel) { if (v[i] < a) a = v[i]; if (v[i] > b) b = v[i]; }
      s += b - a;
    }
    return s;
  };
  const loS = spread(verts.filter((v) => (v[axisIdx] - lo) / rng < 0.15));
  const hiS = spread(verts.filter((v) => (hi - v[axisIdx]) / rng < 0.15));
  return hiS >= loS ? 1 : -1;
}

export function buildInventory(json, bin, source) {
  const parents = parentIndex(json);
  const cache = new Map();
  const nodes = [];
  (json.nodes ?? []).forEach((n, idx) => {
    if (!n.name || n.mesh == null) return;
    const m = worldMatrix(json, idx, parents, cache);
    const lmin = [Infinity, Infinity, Infinity], lmax = [-Infinity, -Infinity, -Infinity];
    const wmin = [Infinity, Infinity, Infinity], wmax = [-Infinity, -Infinity, -Infinity];
    const local = [];
    let vertexCount = 0;
    for (const prim of json.meshes[n.mesh].primitives) {
      if (prim.attributes.POSITION == null) continue;
      for (const v of readVec3(json, bin, prim.attributes.POSITION)) {
        vertexCount++;
        local.push(v);
        const w = transformPoint(m, v);
        for (let i = 0; i < 3; i++) {
          if (v[i] < lmin[i]) lmin[i] = v[i];
          if (v[i] > lmax[i]) lmax[i] = v[i];
          if (w[i] < wmin[i]) wmin[i] = w[i];
          if (w[i] > wmax[i]) wmax[i] = w[i];
        }
      }
    }
    if (!vertexCount) return;
    const localDims = lmax.map((v, i) => v - lmin[i]);
    const worldDims = wmax.map((v, i) => v - wmin[i]);
    const { axis, aspect } = shaftOf(localDims);
    nodes.push({
      idx,
      name: n.name,
      parent: parents.has(idx) ? (json.nodes[parents.get(idx)].name ?? `#${parents.get(idx)}`) : null,
      article: (n.name.match(/\d{5,8}/) ?? [null])[0],
      vertexCount,
      localDims: localDims.map((v) => +v.toFixed(5)),
      worldPos: wmin.map((v, i) => +((v + wmax[i]) / 2).toFixed(5)),
      worldDims: worldDims.map((v) => +v.toFixed(5)),
      worldMin: wmin.map((v) => +v.toFixed(5)),
      worldMax: wmax.map((v) => +v.toFixed(5)),
      shaftAxisLocal: "XYZ"[axis],
      worldShaftAxis: "XYZ"[worldDims.indexOf(Math.max(...worldDims))],
      aspect: +aspect.toFixed(3),
      headSign: headSignOf(local, axis),
    });
  });
  return { source, count: nodes.length, nodes };
}
