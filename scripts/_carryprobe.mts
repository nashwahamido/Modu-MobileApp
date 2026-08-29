// scratch probe: where does the held part actually END UP, and can the player see it?
// Replays EKET's build with real GLB boxes, sweeps the finger over the screen from real orbit
// cameras, and runs the runtime's own carry maths (socket depth + occlusion cap).
import fs from "node:fs";
import path from "node:path";
import { applyStructure, buildLiaisons } from "@/src/game/core/model/liaisons";
import { deriveJointFrames, partAnchorOffsets } from "@/src/game/core/model/jointFrames";
import { composeFurnitureActions } from "@/src/game/core/composition/composeActions";
import { seatOffsetFor, stagingShiftFor, targetPositionForAction, holdOffsetFor } from "@/src/game/core/scene/targets";
import { isPickupType, placeId } from "@/src/game/core/ids";
import { rayBoxEntryT, sightlineGapM, VIS_GAP_SLACK_M } from "@/src/game/input/drag/dragPlane";
import { projectToScreen } from "@/src/game/scene/projectToScreen";
import { screenRay } from "@/src/game/core/geometry/math";
import { FOV_Y_DEG } from "@/src/game/scene/cameraConfig";
import type { ClusterId, Furniture, PartBox, PartId, Vec3 } from "@/src/game/core/type";

const F = process.argv[2] ?? "EKET";
const MODELS = path.join(process.cwd(), "src", "assets", "models", "furnitures");

function parseGlb(file: string) {
  const b = fs.readFileSync(file);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString("utf8"));
  const off = 20 + jsonLen;
  return { json, bin: b.subarray(off + 8, off + 8 + b.readUInt32LE(off)) };
}
function readPositions(json: any, bin: Buffer, ai: number): Vec3[] {
  const acc = json.accessors[ai];
  const bv = json.bufferViews[acc.bufferView];
  const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const stride = bv.byteStride ?? 12;
  const out: Vec3[] = new Array(acc.count);
  for (let i = 0; i < acc.count; i++) {
    const o = base + i * stride;
    out[i] = [bin.readFloatLE(o), bin.readFloatLE(o + 4), bin.readFloatLE(o + 8)];
  }
  return out;
}
const rotQ = ([x, y, z, w]: number[], [vx, vy, vz]: Vec3): Vec3 => {
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
};
function glbBoxes(file: string): Record<string, PartBox> {
  const { json, bin } = parseGlb(file);
  const out: Record<string, PartBox> = {};
  for (const n of json.nodes ?? []) {
    if (!n.name || n.mesh == null) continue;
    const t = n.translation ?? [0, 0, 0];
    const q = n.rotation ?? [0, 0, 0, 1];
    const s = n.scale ?? [1, 1, 1];
    const min: number[] = [Infinity, Infinity, Infinity];
    const max: number[] = [-Infinity, -Infinity, -Infinity];
    const lmin: number[] = [Infinity, Infinity, Infinity];
    const lmax: number[] = [-Infinity, -Infinity, -Infinity];
    let any = false;
    for (const prim of json.meshes[n.mesh].primitives) {
      if (prim.attributes.POSITION == null) continue;
      for (const v of readPositions(json, bin, prim.attributes.POSITION)) {
        const r = rotQ(q, [v[0] * s[0], v[1] * s[1], v[2] * s[2]]);
        const w: Vec3 = [r[0] + t[0], r[1] + t[1], r[2] + t[2]];
        any = true;
        for (let k = 0; k < 3; k++) {
          if (w[k] < min[k]) min[k] = w[k];
          if (w[k] > max[k]) max[k] = w[k];
          if (v[k] < lmin[k]) lmin[k] = v[k];
          if (v[k] > lmax[k]) lmax[k] = v[k];
        }
      }
    }
    if (!any) continue;
    const lc: Vec3 = [((lmin[0] + lmax[0]) / 2) * s[0], ((lmin[1] + lmax[1]) / 2) * s[1], ((lmin[2] + lmax[2]) / 2) * s[2]];
    const rc = rotQ(q, lc);
    const axes = [rotQ(q, [1, 0, 0]), rotQ(q, [0, 1, 0]), rotQ(q, [0, 0, 1])] as [Vec3, Vec3, Vec3];
    out[n.name] = {
      min: [min[0], min[1], min[2]],
      max: [max[0], max[1], max[2]],
      obb: { center: [rc[0] + t[0], rc[1] + t[1], rc[2] + t[2]], axes, half: [((lmax[0] - lmin[0]) / 2) * s[0], ((lmax[1] - lmin[1]) / 2) * s[1], ((lmax[2] - lmin[2]) / 2) * s[2]] },
    };
  }
  return out;
}

const W = 844;
const H = 390;
const FINGER_LIFT_DP = 22;
const CARRY_SURFACE_MARGIN_M = 0.02;
const RAY_CARRY_MIN_M = 0.12;

const { PARTS } = await import(`@/src/game/content/furnitures/${F}/parts.gen`);
const authored = await import(`@/src/game/content/furnitures/${F}/authored`);
const parts = applyStructure(PARTS, authored.STRUCTURE);
const liaisons = buildLiaisons(parts);
const named = glbBoxes(path.join(MODELS, F, `${F}.glb`));
const boxes: Record<string, PartBox> = {};
for (const p of Object.values(parts) as any[]) if (named[p.meshName]) boxes[p.partId] = named[p.meshName];
const frames = deriveJointFrames(parts, liaisons, boxes);
const anchors = partAnchorOffsets(parts, liaisons, frames);
const actions = composeFurnitureActions(
  authored.AUTHORED_ACTIONS ?? [],
  authored.FASTENER_RULES ?? [],
  parts,
  authored.HARDWARE ?? {},
  authored.CLUSTERS,
);
const { SWEEP } = await import(`@/src/game/content/furnitures/${F}/sweep.gen`);
const furniture = { parts, actions, liaisons, clusters: authored.CLUSTERS, sweep: SWEEP } as unknown as Furniture;

const all = Object.values(boxes);
const centre: Vec3 = [
  (Math.min(...all.map((b) => b.min[0])) + Math.max(...all.map((b) => b.max[0]))) / 2,
  (Math.min(...all.map((b) => b.min[1])) + Math.max(...all.map((b) => b.max[1]))) / 2,
  (Math.min(...all.map((b) => b.min[2])) + Math.max(...all.map((b) => b.max[2]))) / 2,
];

/** Orbit eyes the player can actually be at. */
function eyes(): { eye: Vec3; label: string }[] {
  const out: { eye: Vec3; label: string }[] = [];
  for (const r of [0.65, 1.1]) {
    for (const elevDeg of [15, 35]) {
      for (let a = 0; a < 8; a++) {
        const az = (a / 8) * Math.PI * 2;
        const el = (elevDeg * Math.PI) / 180;
        out.push({
          eye: [centre[0] + r * Math.cos(el) * Math.cos(az), Math.max(0.05, centre[1] + r * Math.sin(el)), centre[2] + r * Math.cos(el) * Math.sin(az)],
          label: `r${r} el${elevDeg} az${((az * 180) / Math.PI).toFixed(0)}`,
        });
      }
    }
  }
  return out;
}

const GROUPS = (process.argv[3] ?? "cam139434,dowel139435,suspBracket").split(",");

const placed = new Set<PartId>();
const combined = new Set<ClusterId>();
for (const a of actions) {
  const part = a.partId ? parts[a.partId] : null;
  if (isPickupType(a.type) && part && GROUPS.includes(part.group ?? "")) {
    // Same occluder inference as the visibility sweep: parts standing at their baked pose right now.
    const cl = part.cluster;
    const occ = [...placed]
      .filter((pid) => {
        if (pid === a.partId) return false;
        const other = parts[pid]?.cluster;
        return !other || other === cl || combined.has(other);
      })
      .map((pid) => ({ ...boxes[pid], pid }))
      .filter((b) => b.min);
    const done = new Set([...placed].map((pid) => placeId(pid)));

    // The candidate group the drag would carry: every not-yet-placed part of the same group.
    const group = Object.values(parts).filter(
      (q: any) => q.group === part.group && !placed.has(q.partId),
    ) as any[];
    const cands = group.map((q) => {
      const off = seatOffsetFor(q, boxes[q.partId], anchors, done, occ);
      const shift = stagingShiftFor({ ...a, partId: q.partId } as any, parts) ?? [0, 0, 0];
      const seat: Vec3 = [q.pose.position[0] + off[0] + shift[0], q.pose.position[1] + off[1] + shift[1], q.pose.position[2] + off[2] + shift[2]];
      const pos = targetPositionForAction({ ...a, partId: q.partId } as any, parts, done);
      const ho = holdOffsetFor(q, anchors);
      return { pid: q.partId, seat, hold: [pos[0] + ho[0], pos[1] + ho[1], pos[2] + ho[2]] as Vec3 };
    });
    if (!cands.length) { placed.add(a.partId as PartId); continue; }

    let worst = { frac: 0, label: "", detail: "" };
    let totalHidden = 0;
    let totalPx = 0;
    for (const { eye, label } of eyes()) {
      const look = { eye, center: centre, up: [0, 1, 0] as Vec3 };
      const la = [eye, centre, [0, 1, 0]] as any;
      // Which candidates are visible from here (the acquisition gate): in frame + clear sightline.
      const visible = cands.filter((c) => {
        const sp = projectToScreen(la, c.seat, W, H);
        if (!sp || sp.x < 0 || sp.x > W || sp.y < 0 || sp.y > H) return false;
        return sightlineGapM(eye, c.seat, occ).gap <= VIS_GAP_SLACK_M + 0.004;
      });
      // nearest defaults to candidates[0] when nothing passes the gate (usePartDrag line 503).
      const fallback = cands[0];
      let hidden = 0;
      let px = 0;
      let sample = "";
      for (let sx = 40; sx < W; sx += 60) {
        for (let sy = 30; sy < H; sy += 40) {
          px++;
          const { eye: e0, dir } = screenRay(look, FOV_Y_DEG, W, H, sx, sy - FINGER_LIFT_DP);
          // socketDepth: the nearest VISIBLE candidate's seat, else candidates[0] — the runtime's fallback.
          let ref = fallback;
          let bestPx = Infinity;
          for (const c of visible) {
            const sp = projectToScreen(la, c.seat, W, H);
            if (!sp) continue;
            const d = Math.hypot(sp.x - sx, sp.y - sy);
            if (d < bestPx) { bestPx = d; ref = c; }
          }
          const spRef = projectToScreen(la, ref.seat, W, H);
          const socketDepth = spRef ? spRef.depth : null;
          const hit = rayBoxEntryT(e0, dir, occ);
          const cap = Number.isFinite(hit.t) ? hit.t - CARRY_SURFACE_MARGIN_M : Infinity;
          const want = socketDepth != null && socketDepth > 0 ? socketDepth : 0.5;
          const t = Math.max(RAY_CARRY_MIN_M, Math.min(want, cap));
          const P: Vec3 = [e0[0] + t * dir[0], e0[1] + t * dir[1], e0[2] + t * dir[2]];
          const g = sightlineGapM(eye, P, occ);
          if (g.gap > 0.005) {
            hidden++;
            if (!sample) sample = `px(${sx},${sy}) sock=${socketDepth?.toFixed(3)} cap=${Number.isFinite(cap) ? cap.toFixed(3) : "inf"} t=${t.toFixed(3)} behind=${g.by} by ${(g.gap * 100).toFixed(1)}cm vis=${visible.length}/${cands.length}`;
          }
        }
      }
      totalHidden += hidden;
      totalPx += px;
      if (hidden / px > worst.frac) worst = { frac: hidden / px, label, detail: sample };
    }
    console.log(
      `${(a.partId ?? "").padEnd(16)} ${a.type.padEnd(15)} hidden ${((100 * totalHidden) / totalPx).toFixed(0)}% of screen×camera   worst ${(100 * worst.frac).toFixed(0)}% @ ${worst.label}\n    ${worst.detail}`,
    );
  }
  if (a.partId && (a.type === "placePart" || a.type === "insertFastener")) placed.add(a.partId as PartId);
  if (a.type === "combineClusters" && a.cluster) combined.add(a.cluster);
}
void furniture;
