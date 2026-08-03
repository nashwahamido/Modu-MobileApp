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
import { type Vec3 } from "../core/roomShell";

export type OrbitAngles = {
  radius: number;
  // Polar angle from straight-up, radians: small = looking down on the room, PI/2 = level.
  phi: number;
  // Azimuth around Y, measured from +Z — Three.js spherical convention, kept so the numbers can be
  // compared against the reference project directly.
  theta: number;
};

// Rest pose and limits. Provenance:
//   restTheta  — atan2(x, z) of the previous camera direction [1.45, 1.05, -1.45]: 3π/4. It was the
//                bisector of the two-wall diorama's open corner; with four walls it is simply the
//                pose that opens on x-max and z-min, i.e. the view the room has always started in.
//                theta is unbounded now — see clampOrbit.
//   phi        — rest π·0.35 is the reference project's own start; the range allows near-top-down
//                (0.35, useful for placement) down to just above level (0.98·π/2 — never below the
//                floor, and never exactly level where the floor is edge-on).
//   homeRadius — solved, not dialled: the smallest radius at which the shell's floor slab and
//                cornice line stay inside 0.92 of the viewport for EVERY (theta, phi) in these
//                limits, at 68 mm and the tightest stage aspect (~1.15). Re-solved against the
//                four-wall shell over a FULL turn (the solve no longer gets to assume a 90° arc):
//                the minimum is 9.80 and the 9.87 below holds at |ndc| 0.913. See scratchpad
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

// theta is deliberately NOT clamped: the shell is enclosed on all four sides and the walls between the camera and the room fade out (see ../core/wallCulling), so every azimuth reads as a room. phi and radius still are — those limits are about the floor reading as a floor and the room staying framed, which four walls do not change.
// theta is left to run unbounded rather than wrapped into (-pi, pi]. Wrapping would step raw.theta by 2*pi at the seam, and the smoothed value chases raw the short way in VALUE, not in angle — so one drag past the seam would spin the room a full turn backwards. Session state only, so the number never grows far.
export function clampOrbit(angles: OrbitAngles): OrbitAngles {
  return {
    // Zoom is expressed as homeRadius / zoom, so the radius limits derive from the zoom range.
    radius: Math.min(
      ORBIT.homeRadius / ORBIT.zoom.min,
      Math.max(ORBIT.homeRadius / ORBIT.zoom.max, angles.radius),
    ),
    phi: Math.min(ORBIT.phi.max, Math.max(ORBIT.phi.min, angles.phi)),
    theta: angles.theta,
  };
}

// The pose a double-tap on the scene returns to: the one the room opens in, on all three axes.
// theta is the delicate one. It is deliberately unbounded (see clampOrbit), so a player who has turned the room three times is sitting at restTheta - 6*pi, and resetting to the literal restTheta would spin the whole diorama three turns backwards — the smoothed value chases raw in VALUE, not in angle, so every one of those turns would be rendered. Snapping to the NEAREST azimuth that is a whole number of turns from rest gives the identical view by the shortest path, which is what a reset is supposed to look like.
export function restOrbit(fromTheta: number): OrbitAngles {
  const turns = Math.round((fromTheta - ORBIT.restTheta) / (2 * Math.PI));
  return {
    radius: ORBIT.homeRadius,
    phi: ORBIT.phi.rest,
    theta: ORBIT.restTheta + turns * 2 * Math.PI,
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
