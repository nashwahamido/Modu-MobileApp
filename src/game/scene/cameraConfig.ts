/** Explicit lens setting shared by the render camera and the gesture layer's screen→world unprojection — both must agree or held parts drift off the finger. 28mm is react-native-filament's default 35mm-equivalent lens. */
export const FOCAL_LENGTH_MM = 28;

/** Full vertical field of view: filament derives it from a 24mm sensor height. */
export const FOV_Y_DEG = (2 * Math.atan(12 / FOCAL_LENGTH_MM) * 180) / Math.PI;

/**
 * Closest the orbit eye may dolly to its pivot, in metres.
 *
 * Filament's ORBIT-mode scroll is an unclamped multiplicative dolly (mapMinDistance is MAP-mode
 * only), so nothing native stops a pinch from carrying the eye THROUGH a drag work plane that hangs
 * above the pivot — DALFRED's seat plane (y≈0.5, pivot y≈0.29) is crossed at ~0.28× the home
 * distance, and past it every finger ray points up at a plane the camera is under, so the held part
 * is flung to the leash. 0.65 m clears that crossing with margin on every current furniture while
 * still allowing a close look (the 28mm lens fills the frame with a drawer at this range); an
 * absolute floor rather than a home-distance fraction because home.eye re-captures the CURRENT eye
 * on every pivot change, so a fraction of it would ratchet downward while zoomed in.
 */
export const MIN_ORBIT_DISTANCE_M = 0.65;

/** Whether an incoming pinch delta must be dropped: inward at or under the floor. Outward always passes — it is the only way back out. */
export function blocksZoomIn(scaleDelta: number, eyeDistM: number): boolean {
  return scaleDelta > 0 && eyeDistM <= MIN_ORBIT_DISTANCE_M;
}
