// The visibility gate's UNIVERSALITY invariant, run against every shipped furniture offline: at every
// point of the canonical build, every pickup-type action's socket must be visible (sightline gap ≤ its
// own burial + slack) from AT LEAST ONE camera on the orbit sphere. A part this test lists is a part
// the player cannot place from any angle — the class of bug that reached the user three separate times
// (stabilizer rod self-blocked by its dowel, phantom drawer fronts, hidden-cam heuristics) before this
// file existed. It reuses the same pure functions the drag consumes, so a pass here is the gate's
// actual behaviour, not a model of it.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { applyStructure, buildLiaisons } from "@/src/game/core/model/liaisons";
import { deriveJointFrames, partAnchorOffsets } from "@/src/game/core/model/jointFrames";
import { composeFurnitureActions } from "@/src/game/core/composition/composeActions";
import { holdOffsetFor } from "@/src/game/core/scene/targets";
import { isPickupType } from "@/src/game/core/ids";
import { burialDepthM, sightlineGapM, VIS_GAP_SLACK_M } from "./dragPlane";
import type { ClusterId, PartBox, PartId, Vec3 } from "@/src/game/core/type";

const MODELS = path.join(process.cwd(), "src", "assets", "models", "furnitures");
const CONTENT = path.join(process.cwd(), "src", "game", "content", "furnitures");

const FURNITURES = fs
  .readdirSync(MODELS, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(MODELS, d.name, `${d.name}.glb`)) && fs.existsSync(path.join(CONTENT, d.name, "parts.gen.ts")))
  .map((d) => d.name);

// GLB world-box parser — twin of the one in jointFrames.furniture.test.ts (same flat-hierarchy convention, same self-detection argument); duplicated because importing a test file would run its tests.
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
        }
      }
    }
    if (any) out[n.name] = { min: [min[0], min[1], min[2]], max: [max[0], max[1], max[2]] };
  }
  return out;
}

/** The orbit sphere the player can actually reach: 8 azimuths × 3 elevations × 3 radii around the assembly's centre, floored above the bench so no eye samples from underground. */
function orbitEyes(center: Vec3): Vec3[] {
  const eyes: Vec3[] = [];
  for (const r of [0.65, 1.6, 2.4]) {
    for (const elevDeg of [10, 35, 60]) {
      for (let a = 0; a < 8; a++) {
        const az = (a / 8) * Math.PI * 2;
        const el = (elevDeg * Math.PI) / 180;
        eyes.push([
          center[0] + r * Math.cos(el) * Math.cos(az),
          Math.max(0.05, center[1] + r * Math.sin(el)),
          center[2] + r * Math.cos(el) * Math.sin(az),
        ]);
      }
    }
  }
  return eyes;
}

for (const F of FURNITURES) {
  test(`${F}: every pickup socket is visible from somewhere, at every point of the build`, async () => {
    const { PARTS } = await import(`@/src/game/content/furnitures/${F}/parts.gen`);
    const authored = await import(`@/src/game/content/furnitures/${F}/authored`);
    const parts = applyStructure(PARTS, authored.STRUCTURE);
    const liaisons = buildLiaisons(parts);
    const named = glbBoxes(path.join(MODELS, F, `${F}.glb`));
    const boxes: Record<string, PartBox> = {};
    for (const p of Object.values(parts)) if (named[p.meshName]) boxes[p.partId] = named[p.meshName];
    const frames = deriveJointFrames(parts, liaisons, boxes);
    const anchors = partAnchorOffsets(parts, liaisons, frames);
    const actions = composeFurnitureActions(
      authored.AUTHORED_ACTIONS ?? [],
      authored.FASTENER_RULES ?? [],
      parts,
      authored.HARDWARE ?? {},
      authored.CLUSTERS,
    );
    const all = Object.values(boxes);
    const center: Vec3 = [
      (Math.min(...all.map((b) => b.min[0])) + Math.max(...all.map((b) => b.max[0]))) / 2,
      (Math.min(...all.map((b) => b.min[1])) + Math.max(...all.map((b) => b.max[1]))) / 2,
      (Math.min(...all.map((b) => b.min[2])) + Math.max(...all.map((b) => b.max[2]))) / 2,
    ];
    const eyes = orbitEyes(center);

    const placed = new Set<PartId>();
    const combined = new Set<ClusterId>();
    const atBakedPose = (pid: PartId): boolean => {
      const cl = parts[pid]?.cluster;
      if (!cl) return true;
      return !!authored.CLUSTERS?.[cl]?.seed || combined.has(cl);
    };
    const failures: string[] = [];
    for (const a of actions) {
      if (isPickupType(a.type) && a.partId && parts[a.partId]) {
        const part = parts[a.partId];
        const off = anchors[part.partId] ?? holdOffsetFor(part);
        const seat: Vec3 = [
          part.pose.position[0] + off[0],
          part.pose.position[1] + off[1],
          part.pose.position[2] + off[2],
        ];
        const occluders = [...placed]
          .filter((pid) => pid !== a.partId && atBakedPose(pid))
          .map((pid) => ({ ...boxes[pid], pid }))
          .filter((b) => b.min);
        const burial = burialDepthM(seat, occluders);
        let best = Infinity;
        let bestBy: string | null = null;
        for (const eye of eyes) {
          const g = sightlineGapM(eye, seat, occluders);
          if (g.gap < best) {
            best = g.gap;
            bestBy = g.by;
          }
          if (best <= burial + VIS_GAP_SLACK_M) break;
        }
        if (best > burial + VIS_GAP_SLACK_M) {
          failures.push(
            `${a.actionId}: best gap ${(best * 1000).toFixed(0)}mm vs threshold ${((burial + VIS_GAP_SLACK_M) * 1000).toFixed(0)}mm (blocked by ${bestBy ?? "?"})`,
          );
        }
      }
      if (a.type === "placePart" && a.partId) placed.add(a.partId);
      if (a.type === "combineClusters" && a.cluster) combined.add(a.cluster);
    }
    assert.ok(
      failures.length === 0,
      `${F}: ${failures.length} socket(s) invisible from every sampled camera:\n  ${failures.join("\n  ")}`,
    );
  });
}
