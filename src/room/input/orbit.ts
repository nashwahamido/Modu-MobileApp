// The room camera's orbit model — borrowed from Bruno Simon's "My Room in 3D" (Navigation.js,
// studied via the houssemlachtar/My-3D-Room fork), the project whose control feel and diorama look
// this room targets. What makes that control feel good is three specific decisions, all kept here:
//
//   1. A SPHERICAL state (radius, phi, theta) with independent per-axis limits, so the camera can
//      never leave the arc where the diorama reads as a room — no gimbal weirdness, no under-floor.
//   2. Input mutates a RAW value; what the camera renders is a SMOOTHED copy chasing it every
//      frame. All the glide is in that chase. The reference uses `smoothed += (value - smoothed)
//      * 0.005 * dtMs`, which is frame-rate dependent (drifts at 120 Hz); here the same feel is
//      alpha = 1 - exp(-dt / tau), identical at 60 fps and stable everywhere else.
//   3. Drag deltas are normalized by the viewport's SMALLEST side — one full-screen swipe turns
//      the same number of radians on every device.
//
// Pure math, no Filament and no React: the scene mirrors this state into shared values and applies
// it per frame; buttons and gestures mutate it through the conversions below.
import { MAX_ROOM_YAW, type Vec3 } from "../core/roomShell";

export type OrbitAngles = {
  radius: number;
  // Polar angle from straight-up, radians: small = looking down on the room, PI/2 = level.
  phi: number;
  // Azimuth around Y, measured from +Z — Three.js spherical convention, kept so the numbers can be
  // compared against the reference project directly.
  theta: number;
};

// Rest pose and limits. Provenance:
//   restTheta  — atan2(x, z) of the previous camera direction [1.45, 1.05, -1.45]: 3π/4, the
//                bisector of the diorama's open corner. theta may swing MAX_ROOM_YAW either side,
//                the same ±45° arc the model-rotation clamp enforced.
//   phi        — rest π·0.35 is the reference project's own start; the range allows near-top-down
//                (0.35, useful for placement) down to just above level (0.98·π/2 — never below the
//                floor, and never exactly level where the floor is edge-on).
//   homeRadius — solved, not dialled: the smallest radius at which the shell's floor slab and
//                cornice line stay inside 0.92 of the viewport for EVERY (theta, phi) in these
//                limits, at 68 mm and the tightest stage aspect (~1.15). See scratchpad
//                solve-orbit.mjs; re-solve if the lens, limits, or shell change.
//   focal 68mm — the reference renders at a 20° vertical FOV; 2·atan(12/68) ≈ 20°. The telephoto
//                flattening is a large part of why that room reads as a calm diorama.
export const ORBIT: {
  restTheta: number;
  phi: { rest: number; min: number; max: number };
  homeRadius: number;
  focalLengthMm: number;
  zoom: { min: number; max: number };
  smoothingTau: number;
  dragSensitivity: number;
} = {
  restTheta: (3 * Math.PI) / 4,
  phi: { rest: Math.PI * 0.35, min: 0.35, max: (Math.PI / 2) * 0.98 },
  homeRadius: 9.87,
  focalLengthMm: 68,
  // 100% frames the whole room; 300% is a close look at a single piece (radius ~3.3 in a 2-unit
  // scene). Zooming OUT past 50% just shrinks the diorama, so it stays modest.
  zoom: { min: 0.5, max: 3 },
  // Reaches ~63% of a step change in this many seconds — the reference's glide at 60 fps.
  smoothingTau: 0.2,
  // One smallest-viewport-side of drag = this many radians (the reference uses exactly 1).
  dragSensitivity: 1,
};

export function clampOrbit(angles: OrbitAngles): OrbitAngles {
  return {
    // Zoom is expressed as homeRadius / zoom, so the radius limits derive from the zoom range.
    radius: Math.min(
      ORBIT.homeRadius / ORBIT.zoom.min,
      Math.max(ORBIT.homeRadius / ORBIT.zoom.max, angles.radius),
    ),
    phi: Math.min(ORBIT.phi.max, Math.max(ORBIT.phi.min, angles.phi)),
    theta: Math.min(
      ORBIT.restTheta + MAX_ROOM_YAW,
      Math.max(ORBIT.restTheta - MAX_ROOM_YAW, angles.theta),
    ),
  };
}

// The HUD speaks (rotationY, zoom); the orbit speaks (theta, radius). Two tiny bijections keep the
// rotate/zoom buttons, the degree/percent readouts, and the persistence story untouched.
// rotationY grows with a rightward drag exactly as it did when it turned the model.
export function orbitFromControls(rotationY: number, zoom: number): Pick<OrbitAngles, "radius" | "theta"> {
  return { theta: ORBIT.restTheta - rotationY, radius: ORBIT.homeRadius / zoom };
}

export function controlsFromOrbit(angles: Pick<OrbitAngles, "radius" | "theta">): {
  rotationY: number;
  zoom: number;
} {
  return { rotationY: ORBIT.restTheta - angles.theta, zoom: ORBIT.homeRadius / angles.radius };
}

// Frame-rate-independent exponential chase: the fraction of the remaining distance to cover after
// dt seconds. Equals the reference's 0.005/ms factor at 60 fps.
export function smoothingAlpha(dtSeconds: number, tau: number = ORBIT.smoothingTau): number {
  return 1 - Math.exp(-Math.max(0, dtSeconds) / tau);
}

// Spherical to cartesian, Y-up, theta from +Z — where the eye sits for a given orbit state.
export function eyeFor(target: Vec3, angles: OrbitAngles): Vec3 {
  const sinPhi = Math.sin(angles.phi);
  return {
    x: target.x + angles.radius * sinPhi * Math.sin(angles.theta),
    y: target.y + angles.radius * Math.cos(angles.phi),
    z: target.z + angles.radius * sinPhi * Math.cos(angles.theta),
  };
}
