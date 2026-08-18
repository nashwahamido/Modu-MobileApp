// Where two parts actually MEET, derived per liaison from their bounds at baked pose. The drag holds a part by its joint and aims at the partner's, instead of at a pose-derived visual center: measured on LACK, a leg's node origin is its FOOT, so the previous hold point sat 32cm from the joint it was being aimed into. Pure — boxes come from the scene (Filament), nothing here touches React or the renderer.
import type { JointFrame, LiaisonId, LiaisonMap, PartBox, PartDef, PartId, Vec3 } from "@/src/game/core/type";

/** Slack (m) allowed between two parts' boxes before they stop counting as touching. Chosen from the MIDDLE of a measured 2-20mm plateau over all four shipped furnitures, not fitted to any one of them; anchors do not move at all across that range (max drift 0.00mm on LACK/DALFRED/BEKVAM). Above ~20mm a connector-bridged pair starts overlapping THROUGH its air gap and takes a wrong anchor across empty space, so this must not be raised casually. */
export const CONTACT_EXPANSION_M = 0.01;

export function boxCenter(b: PartBox): Vec3 {
  return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
}

/** The intersection of two boxes each grown by `e`, or null when they miss. */
export function boxOverlap(a: PartBox, b: PartBox, e: number): PartBox | null {
  const min: number[] = [0, 0, 0];
  const max: number[] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    min[k] = Math.max(a.min[k] - e, b.min[k] - e);
    max[k] = Math.min(a.max[k] + e, b.max[k] + e);
    if (min[k] > max[k]) return null;
  }
  return { min: [min[0], min[1], min[2]], max: [max[0], max[1], max[2]] };
}

/** Pull a point onto the nearest point of `b`. The expansion can place a raw overlap center just outside a thin part (measured: BEKVAM's topPlane, 0.1mm out), and an anchor outside its own part reads as a hold point floating off the geometry. */
export function clampIntoBox(p: Vec3, b: PartBox): Vec3 {
  return [
    Math.min(Math.max(p[0], b.min[0]), b.max[0]),
    Math.min(Math.max(p[1], b.min[1]), b.max[1]),
    Math.min(Math.max(p[2], b.min[2]), b.max[2]),
  ];
}

const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** One frame per liaison whose endpoints both have a box and genuinely meet. A liaison realized THROUGH a fastener has no direct contact — EKET's stabilizerRod sits 3.7cm clear of the runner frames, bridged by a dowel — so the bridging fastener's own box supplies the anchor. Liaisons that resolve neither way are simply absent; consumers fall back. */
export function deriveJointFrames(
  parts: Record<PartId, PartDef>,
  liaisons: LiaisonMap,
  boxes: Record<PartId, PartBox>,
  expansion: number = CONTACT_EXPANSION_M,
): Record<LiaisonId, JointFrame> {
  const out: Record<LiaisonId, JointFrame> = {};
  const partList = Object.values(parts);
  for (const l of Object.values(liaisons)) {
    const A = boxes[l.a];
    const B = boxes[l.b];
    if (!A || !B) continue;
    let anchor: Vec3 | null = null;
    let via: "direct" | "bridge" = "direct";
    const ov = boxOverlap(A, B, expansion);
    if (ov) {
      anchor = boxCenter(ov);
    } else {
      const bridge = partList.find(
        (p) => p.type === "fastener" && p.attached?.includes(l.a as never) && p.attached?.includes(l.b as never) && boxes[p.partId],
      );
      if (bridge) {
        anchor = boxCenter(boxes[bridge.partId]);
        via = "bridge";
      }
    }
    if (!anchor) continue;
    out[l.id] = {
      liaison: l.id,
      anchor,
      offsetA: sub3(clampIntoBox(anchor, A), parts[l.a].pose.position),
      offsetB: sub3(clampIntoBox(anchor, B), parts[l.b].pose.position),
      via,
    };
  }
  return out;
}

/**
 * A part's resolved drag anchor as an offset from its own pose.position — the one lookup the drag reads.
 *
 * `isPlaced` decides WHICH joint, and it matters more than it looks. A part with several joints has
 * several sockets, and the one the finger should hold is the one it is actually going into — the
 * joint meeting geometry that is already on the bench. Averaging them all instead put a DALFRED leg's
 * hold point at y=0.407, 7.3 cm from the nearest real socket and connected to nothing (its joints sit
 * at 0.181, 0.480 and 0.560), which on device read as holding the leg by thin air. LACK hid this
 * because its leg has exactly ONE joint, so the average WAS the socket.
 *
 * Without a placed partner the average is still the answer, and the fallback is load-bearing rather
 * than defensive: anchors are computed at baked poses so they exist regardless of assembly order, and
 * LACK can be built leg-first, where nothing the leg meets is on the bench yet. Filtering with no
 * fallback would leave that leg with no anchor at all.
 *
 * Parts with no frame are absent, and their consumers fall back to the older heuristic.
 */
export function partAnchorOffsets(
  parts: Record<PartId, PartDef>,
  liaisons: LiaisonMap,
  frames: Record<LiaisonId, JointFrame>,
  isPlaced?: (partId: PartId) => boolean,
): Record<PartId, Vec3> {
  const acc: Record<string, Vec3[]> = {};
  const onBench: Record<string, Vec3[]> = {};
  for (const f of Object.values(frames)) {
    const l = liaisons[f.liaison];
    if (!l) continue;
    (acc[l.a] ??= []).push(f.offsetA);
    (acc[l.b] ??= []).push(f.offsetB);
    if (isPlaced?.(l.b)) (onBench[l.a] ??= []).push(f.offsetA);
    if (isPlaced?.(l.a)) (onBench[l.b] ??= []).push(f.offsetB);
  }
  const out: Record<PartId, Vec3> = {};
  for (const p of Object.values(parts)) {
    const authored = p.jointAnchor;
    if (authored) {
      out[p.partId] = [
        authored[0] - p.pose.position[0],
        authored[1] - p.pose.position[1],
        authored[2] - p.pose.position[2],
      ];
      continue;
    }
    // The joints meeting already-placed geometry win outright; the all-joints average is only what is left when none of them is on the bench yet.
    const list = onBench[p.partId]?.length ? onBench[p.partId] : acc[p.partId];
    if (!list?.length) continue;
    out[p.partId] = [
      list.reduce((s, v) => s + v[0], 0) / list.length,
      list.reduce((s, v) => s + v[1], 0) / list.length,
      list.reduce((s, v) => s + v[2], 0) / list.length,
    ];
  }
  return out;
}
