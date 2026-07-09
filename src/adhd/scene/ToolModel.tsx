import { useEffect, useRef } from "react";
import {
  ModelRenderer,
  useFilamentContext,
  useModel,
} from "react-native-filament";
import { axisAngleBetween } from "@/src/adhd/core/geometry/math";
import { LOOSE_OFFSET_M } from "@/src/adhd/core/geometry/fastenerPose";
import { AssemblyAction, ToolId } from "@/src/adhd/core/type";
import { TIGHTEN_TOTAL_DEG, useGameStore } from "@/src/adhd/core/store";
import { TOOLS } from "@/src/adhd/furnitures/DALFRED/tools";

/**
 * Direction each tool's body extends away from its contact-point origin
 * (read from the GLB geometry bounds): allen key short arm up +Y,
 * screwdriver body -Z behind the tip, mallet head +Z behind the face.
 */
const REST_AXIS: Partial<Record<ToolId, [number, number, number]>> = {
  allenkey: [0, 1, 0],
  screwdriver: [0, 0, -1],
  mallet: [0, 0, 1],
};

/** Clearance between the tool's contact origin and the fastener origin. */
const TIP_GAP_M = 0.012;

/** How far the mallet pulls back between strikes. */
const MALLET_SWING_M = 0.07;

/**
 * The active tool, rendered at the fastener being tightened. Transform is
 * rebuilt imperatively each update (same plain-array transformManager path
 * as OffsetDriver — SharedValues don't cross into filament): alignment
 * rotation (replace), spin about the fastener axis (multiply), then
 * translation to the sinking fastener head (multiply).
 */
export function ToolModel({ action }: { action: AssemblyAction }) {
  const tool = action.tool!;
  const toolAsset = TOOLS[tool]?.asset;
  const model = useModel(toolAsset ?? 0);
  const { transformManager } = useFilamentContext();
  const deg = useGameStore((s) => s.tightenDeg[action.actionId] ?? 0);
  const furniture = useGameStore((s) => s.furniture);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!toolAsset || model.state !== "loaded" || !action.partId || !furniture) return;
    const root = model.rootEntity;
    const part = furniture.parts[action.partId];
    const pose = part.pose;
    // Engage axis (head/strike side, world space), baked from the part origin.
    const e = part.engageDir ?? [0, 0, 1];
    const al = Math.hypot(e[0], e[1], e[2]) || 1;
    const axis: [number, number, number] = [e[0] / al, e[1] / al, e[2] / al];
    const restAxis = REST_AXIS[tool] ?? [0, 1, 0];
    const align = axisAngleBetween(restAxis, axis);
    const p = Math.min(1, deg / TIGHTEN_TOTAL_DEG);

    const place = (gap: number) => {
      const head = LOOSE_OFFSET_M * (1 - p) + gap;
      transformManager.setEntityRotation(root, align.angleRad, align.axis, false);
      if (tool !== "mallet") {
        transformManager.setEntityRotation(root, (deg * Math.PI) / 180, axis, true);
      }
      transformManager.setEntityPosition(
        root,
        [
          pose.position[0] + axis[0] * head,
          pose.position[1] + axis[1] * head,
          pose.position[2] + axis[2] * head,
        ],
        true,
      );
    };

    if (tool === "mallet" && deg > 0) {
      // strike: swing in from pulled-back rest over ~150 ms, then pull back
      const t0 = Date.now();
      const tick = () => {
        const t = Math.min(1, (Date.now() - t0) / 150);
        const swing = t < 0.6 ? 1 - t / 0.6 : (t - 0.6) / 0.4; // in, then back out
        place(TIP_GAP_M + MALLET_SWING_M * swing);
        if (t < 1) raf.current = requestAnimationFrame(tick);
      };
      tick();
      return () => {
        if (raf.current !== null) cancelAnimationFrame(raf.current);
      };
    }

    place(tool === "mallet" ? TIP_GAP_M + MALLET_SWING_M : TIP_GAP_M);
  }, [model, transformManager, action.partId, tool, deg, furniture, toolAsset]);

  if (!toolAsset || model.state !== "loaded") return null;
  return <ModelRenderer model={model} />;
}
