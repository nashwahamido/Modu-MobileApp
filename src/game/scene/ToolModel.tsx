import { useEffect, useRef } from "react";
import {
  ModelRenderer,
  useFilamentContext,
  useModel,
} from "react-native-filament";
import { axisAngleBetween } from "@/src/game/core/geometry/math";
import {
  engageAxis,
  pressParkInfo,
  slideParkInfo,
} from "@/src/game/core/evaluation/engagement";
import { LOOSE_OFFSET_M } from "@/src/game/core/geometry/fastenerPose";
import { AssemblyAction, ToolId } from "@/src/game/core/type";
import { TIGHTEN_TOTAL_DEG, useGameStore } from "@/src/game/core/store";

/** Direction each tool's body extends away from its contact-point origin (read from the GLB geometry bounds): allen key short arm up +Y, screwdriver body -Z behind the tip, mallet head +Z behind the face. */
const REST_AXIS: Partial<Record<ToolId, [number, number, number]>> = {
  allenkey: [0, 1, 0],
  screwdriver: [0, 0, -1],
  mallet: [0, 0, 1],
};

/** Clearance between the tool's contact origin and the fastener origin. */
const TIP_GAP_M = 0.012;

/** How far the mallet pulls back between strikes. */
const MALLET_SWING_M = 0.07;

/** The active tool, rendered at the fastener being tightened. Transform is rebuilt imperatively each update (same plain-array transformManager path as OffsetDriver — SharedValues don't cross into filament): alignment rotation (replace), spin about the fastener axis (multiply), then translation to the sinking fastener head (multiply). */
export function ToolModel({ action }: { action: AssemblyAction }) {
  const tool = action.tool!;
  const strike = (action.motion ?? (tool === "mallet" ? "strike" : "spin")) === "strike";
  const furniture = useGameStore((s) => s.furniture);
  const toolAsset = furniture?.tools?.[tool]?.asset;
  const model = useModel(toolAsset ?? 0);
  const { transformManager } = useFilamentContext();
  const isDrive = action.type === "placePart";
  const driveP = useGameStore((s) => s.driveProgress[action.actionId] ?? 0);
  const tightenRaw = useGameStore((s) => s.tightenDeg[action.actionId] ?? 0);
  const deg = isDrive ? driveP * TIGHTEN_TOTAL_DEG : tightenRaw;
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!toolAsset || model.state !== "loaded" || !action.partId || !furniture) return;
    const root = model.rootEntity;
    const part = furniture.parts[action.partId];
    const pose = part.pose;
    const done = new Set(useGameStore.getState().completed);
    const signed = isDrive
      ? (() => {
          const info =
            pressParkInfo(furniture, action, done) ??
            slideParkInfo(furniture, action, done);
          const ax = info?.axis ?? [0, 1, 0];
          return [-ax[0], -ax[1], -ax[2]] as [number, number, number];
        })()
      : engageAxis(part, done);
    const e = signed[0] || signed[1] || signed[2] ? signed : [0, 0, 1];
    const al = Math.hypot(e[0], e[1], e[2]) || 1;
    const axis: [number, number, number] = [e[0] / al, e[1] / al, e[2] / al];
    const restAxis = REST_AXIS[tool] ?? [0, 1, 0];
    const align = axisAngleBetween(restAxis, axis);
    const p = Math.min(1, deg / TIGHTEN_TOTAL_DEG);

    // Anchor at the authored tool contact point when the node origin isn't it (EKET suspension bracket: origin on the plate, screw hole at the circular boss); insertProud-0 parts rest flush, so the tool tip starts at the hole instead of following a 2cm proud head.
    const [ax0, ay0, az0] = part.toolAnchor ?? [0, 0, 0];
    const anchor: [number, number, number] = [
      pose.position[0] + ax0,
      pose.position[1] + ay0,
      pose.position[2] + az0,
    ];
    const proud = part.insertProud ?? LOOSE_OFFSET_M;

    const place = (gap: number) => {
      const head = proud * (1 - p) + gap;
      transformManager.setEntityRotation(root, align.angleRad, align.axis, false);
      if (!strike) {
        transformManager.setEntityRotation(root, (-deg * Math.PI) / 180, axis, true);
      }
      transformManager.setEntityPosition(
        root,
        [
          anchor[0] + axis[0] * head,
          anchor[1] + axis[1] * head,
          anchor[2] + axis[2] * head,
        ],
        true,
      );
    };

    if (strike && deg > 0) {
      const t0 = Date.now();
      const tick = () => {
        const t = Math.min(1, (Date.now() - t0) / 150);
        const swing = t < 0.6 ? 1 - t / 0.6 : (t - 0.6) / 0.4;
        place(TIP_GAP_M + MALLET_SWING_M * swing);
        if (t < 1) raf.current = requestAnimationFrame(tick);
      };
      tick();
      return () => {
        if (raf.current !== null) cancelAnimationFrame(raf.current);
      };
    }

    place(strike ? TIP_GAP_M + MALLET_SWING_M : TIP_GAP_M);
  }, [model, transformManager, action, isDrive, strike, tool, deg, furniture, toolAsset]);

  if (!toolAsset || model.state !== "loaded") return null;
  return <ModelRenderer model={model} />;
}
