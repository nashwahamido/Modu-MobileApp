// The room camera's orbit model, borrowed from Bruno Simon's "My Room in 3D" — the project whose control feel this room targets. Three decisions carry that feel:
//   1. SPHERICAL state with independent per-axis limits, so the camera can never leave the arc where the diorama reads as a room.
//   2. Input mutates a RAW value and the camera renders a SMOOTHED copy chasing it. The reference's chase is frame-rate dependent and drifts at 120Hz; alpha = 1 - exp(-dt / tau) is identical at 60fps and stable everywhere else.
//   3. Drag deltas normalize by the viewport's SMALLEST side, so one full-screen swipe turns the same radians on every device.
// Pure maths: the scene mirrors this into shared values per frame, and buttons and gestures mutate it through the conversions below.
import { type Vec3 } from "../core/roomShell";

export type OrbitAngles = {
  radius: number;
  // Polar angle from straight-up, radians: small = looking down on the room, PI/2 = level.
  phi: number;
  // Azimuth around Y from +Z — Three.js convention, kept so the numbers compare directly against the reference project.
  theta: number;
};

// Rest pose and limits.
//   restTheta  — the pose the room opens in, on x-max and z-min. theta itself is unbounded; see clampOrbit.
//   phi        — rest is the reference project's own start; the range runs near-top-down (useful for placement) to just above level, never below the floor and never exactly level where the floor is edge-on.
//   homeRadius — SOLVED, not dialled: the smallest radius keeping the floor slab and cornice inside 0.92 of the viewport for EVERY (theta, phi) at 68mm and the tightest aspect. The minimum is 9.80 and 9.87 holds at |ndc| 0.913. Re-solve if the lens, limits or shell change.
//   focal 68mm — a 20° vertical FOV, as the reference renders. The telephoto flattening is much of why that room reads as a calm diorama.
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
  // 100% frames the whole room, 300% is a close look at one piece. Zooming OUT past 50% just shrinks the diorama, so it stays modest.
  zoom: { min: 0.5, max: 3 },
  // Reaches ~63% of a step change in this many seconds — the reference's glide at 60fps.
  smoothingTau: 0.2,
  // One smallest-viewport-side of drag = this many radians (the reference uses exactly 1).
  dragSensitivity: 1,
};

// theta is deliberately NOT clamped: the shell is enclosed on all four sides and the near walls fade out, so every azimuth reads as a room. phi and radius still are — those limits are about framing, which four walls do not change.
// It runs unbounded rather than wrapped into (-π, π]: wrapping steps raw.theta by 2π at the seam, and the smoothed value chases raw the short way in VALUE not in angle, so one drag past it would spin the room a full turn backwards.
// Session state only, so the number never grows far.
export function clampOrbit(angles: OrbitAngles): OrbitAngles {
  return {
    // Zoom is homeRadius / zoom, so the radius limits derive from the zoom range.
    radius: Math.min(
      ORBIT.homeRadius / ORBIT.zoom.min,
      Math.max(ORBIT.homeRadius / ORBIT.zoom.max, angles.radius),
    ),
    phi: Math.min(ORBIT.phi.max, Math.max(ORBIT.phi.min, angles.phi)),
    theta: angles.theta,
  };
}

// The pose a double-tap returns to, on all three axes. theta is the delicate one: it is unbounded, so a player who has turned the room three times sits at restTheta - 6π, and resetting to the literal value would render all three turns backwards.
// Snapping to the NEAREST whole number of turns from rest gives the identical view by the shortest path, which is what a reset should look like.
export function restOrbit(fromTheta: number): OrbitAngles {
  const turns = Math.round((fromTheta - ORBIT.restTheta) / (2 * Math.PI));
  return {
    radius: ORBIT.homeRadius,
    phi: ORBIT.phi.rest,
    theta: ORBIT.restTheta + turns * 2 * Math.PI,
  };
}

// The HUD speaks (rotationY, zoom), the orbit speaks (theta, radius). Two bijections keep the buttons, readouts and persistence untouched, with rotationY still growing on a rightward drag.
export function orbitFromControls(rotationY: number, zoom: number): Pick<OrbitAngles, "radius" | "theta"> {
  return { theta: ORBIT.restTheta - rotationY, radius: ORBIT.homeRadius / zoom };
}

export function controlsFromOrbit(angles: Pick<OrbitAngles, "radius" | "theta">): {
  rotationY: number;
  zoom: number;
} {
  return { rotationY: ORBIT.restTheta - angles.theta, zoom: ORBIT.homeRadius / angles.radius };
}

// Frame-rate-independent exponential chase: the fraction of remaining distance to cover after dt seconds. Equals the reference's factor at 60fps.
export function smoothingAlpha(dtSeconds: number, tau: number = ORBIT.smoothingTau): number {
  return 1 - Math.exp(-Math.max(0, dtSeconds) / tau);
}

// Spherical to cartesian, Y-up, theta from +Z: where the eye sits for a given orbit state.
export function eyeFor(target: Vec3, angles: OrbitAngles): Vec3 {
  const sinPhi = Math.sin(angles.phi);
  return {
    x: target.x + angles.radius * sinPhi * Math.sin(angles.theta),
    y: target.y + angles.radius * Math.cos(angles.phi),
    z: target.z + angles.radius * sinPhi * Math.cos(angles.theta),
  };
}
