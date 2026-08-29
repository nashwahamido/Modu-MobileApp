// Every screen↔world conversion the part drag needs, bound once to the live camera and window. Split out of usePartDrag because none of it touches drag STATE: each function answers a question about where a screen point lands in the world (or the reverse) and could be asked by anything holding the camera. The finger lift is baked in here rather than at the call sites — the part rides above the fingertip, and a conversion that forgot the lift was a class of one-off bug.
import { useCallback } from "react";
import { useWindowDimensions } from "react-native";

import type { Furniture, Vec3 } from "@/src/game/core/type";
import { screenRay } from "@/src/game/core/geometry/math";
import { cameraBasis, projectToScreen, type GetLookAt } from "@/src/game/scene/projectToScreen";
import { FOV_Y_DEG } from "@/src/game/scene/cameraConfig";
import { dragPlanePoint, dragRayPoint, leashAlongRay, rayBoxEntryT } from "./dragPlane";
import { CARRY_CAP_ENABLED, CARRY_SURFACE_MARGIN_M, FINGER_LIFT_DP } from "./dragConfig";
import type { DragSession, Float3 } from "./dragSession";

export function useDragCamera(
  // The PANNED look-at, never the manipulator's own: see useOrbitCamera's getLookAt.
  getLookAt: GetLookAt,
  getFocusPoint: () => Vec3,
) {
  const { width: winW, height: winH } = useWindowDimensions();

  /** The finger's point on a plane FACING the camera through `anchor` — the mapping a vertically-entering part needs, where screen-up is world-up. */
  const fingerOnCameraPlaneAt = useCallback(
    (absX: number, absY: number, anchor: Vec3): Float3 | null => {
      const la = getLookAt();
      const basis = cameraBasis(la);
      if (!la || !basis) return null;
      const { eye, fwd, right, camUp } = basis;
      const center = la[1];
      const dist =
        (anchor[0] - eye[0]) * fwd[0] +
        (anchor[1] - eye[1]) * fwd[1] +
        (anchor[2] - eye[2]) * fwd[2];
      if (!Number.isFinite(dist) || dist <= 0) return null;
      const tanV = Math.tan((FOV_Y_DEG * Math.PI) / 360);
      const tanH = tanV * (winW / winH);
      const ndcX = (2 * absX) / winW - 1;
      const ndcY = 1 - (2 * (absY - FINGER_LIFT_DP)) / winH;
      const p: Float3 = [
        anchor[0] + right[0] * ndcX * tanH * dist + camUp[0] * ndcY * tanV * dist,
        anchor[1] + right[1] * ndcX * tanH * dist + camUp[1] * ndcY * tanV * dist,
        anchor[2] + right[2] * ndcX * tanH * dist + camUp[2] * ndcY * tanV * dist,
      ];
      return leashAlongRay(eye as Float3, center as Float3, eye as Float3, p);
    },
    [getLookAt, winW, winH],
  );

  /** EXPERIMENT (drag-no-plane): the finger's point with no plane — on the ray, just in front of the model's near boundary (see dragRayPoint). The adaptive default; level mode keeps fingerOnPlane. `capM` is the eased occlusion cap the caller maintains (DragSession.carryCap); Infinity leaves the carry uncapped. */
  const fingerOnRay = useCallback(
    (
      absX: number,
      absY: number,
      modelRadius: number,
      holdReach = 0,
      socketDepthM: number | null = null,
      capM = Infinity,
    ): Float3 | null => {
      const la = getLookAt();
      if (!la) return null;
      return dragRayPoint(
        { eye: la[0], center: la[1], up: la[2] },
        FOV_Y_DEG,
        winW,
        winH,
        absX,
        absY - FINGER_LIFT_DP,
        modelRadius,
        holdReach,
        socketDepthM,
        capM,
      );
    },
    [getLookAt, winW, winH],
  );

  /** The occlusion cap for a finger at (absX, absY): the axial depth of the first placed-part box the finger's ray enters, backed off by the surface margin. Infinity over open space. Bound here rather than in the gesture because it is the same unproject the carry itself runs — one place that knows the finger lift, the FOV and the window. */
  const carryCapAt = useCallback(
    (absX: number, absY: number, boxes: readonly { min: Vec3; max: Vec3; pid?: string }[]): number => {
      if (!CARRY_CAP_ENABLED || !boxes.length) return Infinity;
      const la = getLookAt();
      if (!la) return Infinity;
      const { eye, dir } = screenRay(
        { eye: la[0], center: la[1], up: la[2] },
        FOV_Y_DEG,
        winW,
        winH,
        absX,
        absY - FINGER_LIFT_DP,
      );
      const hit = rayBoxEntryT(eye, dir, boxes);
      return Number.isFinite(hit.t) ? hit.t - CARRY_SURFACE_MARGIN_M : Infinity;
    },
    [getLookAt, winW, winH],
  );

  /** Bounding radius of the assembly around the current orbit pivot, from the baked poses — what "in front of the model" measures against. Baked poses are the finished-furniture layout, so the radius is stable for the whole drag. */
  const assemblyRadius = useCallback(
    (furniture: Furniture): number => {
      const piv = getFocusPoint();
      let r2 = 0;
      for (const pt of Object.values(furniture.parts)) {
        const off = pt.visualCenterOffset ?? [0, 0, 0];
        const dx = pt.pose.position[0] + off[0] - piv[0];
        const dy = pt.pose.position[1] + off[1] - piv[1];
        const dz = pt.pose.position[2] + off[2] - piv[2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > r2) r2 = d2;
      }
      return Math.sqrt(r2) + 0.05;
    },
    [getFocusPoint],
  );

  /** World point on the work plane under (just above) the finger. Null only when there is no camera yet — a finger aimed past the horizon is answered by the limit, not by a miss (see dragPlanePoint). */
  const fingerOnPlane = useCallback(
    (absX: number, absY: number, planeY: number): Float3 | null => {
      const la = getLookAt();
      if (!la) return null;
      const [eye, center, up] = la;
      return dragPlanePoint(
        { eye, center, up },
        FOV_Y_DEG,
        winW,
        winH,
        absX,
        absY - FINGER_LIFT_DP,
        planeY,
      );
    },
    [getLookAt, winW, winH],
  );

  /** The camera-plane carry for an upright part: a metres-per-pixel DELTA from where the finger started, rather than an absolute aim, so the part keeps whatever offset the grab had. */
  const fingerOnCameraPlane = useCallback(
    (absX: number, absY: number, s: DragSession): Float3 | null => {
      const la = getLookAt();
      const basis = cameraBasis(la);
      if (!la || !basis) return null;
      const { eye, right, camUp } = basis;
      const center = la[1];
      const anchor: Vec3 = [
        s.bakedPos[0] + s.base[0] + s.grabOffset[0],
        s.bakedPos[1] + s.base[1] + s.grabOffset[1],
        s.bakedPos[2] + s.base[2] + s.grabOffset[2],
      ];
      const dist = Math.hypot(
        anchor[0] - eye[0],
        anchor[1] - eye[1],
        anchor[2] - eye[2],
      );
      const metersPerPx =
        (2 * dist * Math.tan((FOV_Y_DEG * Math.PI) / 360)) / winH;
      const dx = (absX - s.startX) * metersPerPx;
      const dy = (absY - s.startY) * metersPerPx;
      const p: Float3 = [
        anchor[0] + right[0] * dx - camUp[0] * dy,
        anchor[1] + right[1] * dx - camUp[1] * dy,
        anchor[2] + right[2] * dx - camUp[2] * dy,
      ];
      return leashAlongRay(eye as Float3, center as Float3, eye as Float3, p);
    },
    [getLookAt, winH],
  );

  /** Projects a world point to screen pixels (+ axial depth along the view axis). Used to match candidates by where the finger AIMS on screen. */
  const worldToScreen = useCallback(
    (w: Vec3): { x: number; y: number; depth: number } | null =>
      projectToScreen(getLookAt(), w, winW, winH),
    [getLookAt, winW, winH],
  );

  return {
    winW,
    winH,
    fingerOnCameraPlaneAt,
    fingerOnRay,
    carryCapAt,
    assemblyRadius,
    fingerOnPlane,
    fingerOnCameraPlane,
    worldToScreen,
  };
}
