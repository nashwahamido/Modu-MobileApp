export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number]; // xyzw

export function vec3Distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Rotate a vector by a unit quaternion. */
export function quatRotateVec3(q: Quat, v: Vec3): [number, number, number] {
  const [x, y, z, w] = q;
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  // v' = v + w*t + cross(q.xyz, t)
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
}

/**
 * Shortest rotation taking unit vector `from` onto unit vector `to`, as
 * axis-angle (the form filament's setEntityRotation wants). Antiparallel
 * inputs rotate pi about an arbitrary perpendicular axis.
 */
export function axisAngleBetween(from: Vec3, to: Vec3): { axis: [number, number, number]; angleRad: number } {
  const dot = from[0] * to[0] + from[1] * to[1] + from[2] * to[2];
  const cx = from[1] * to[2] - from[2] * to[1];
  const cy = from[2] * to[0] - from[0] * to[2];
  const cz = from[0] * to[1] - from[1] * to[0];
  const len = Math.hypot(cx, cy, cz);
  if (len < 1e-8) {
    if (dot > 0) return { axis: [0, 1, 0], angleRad: 0 };
    // antiparallel: any axis perpendicular to `from` works
    const perp: [number, number, number] =
      Math.abs(from[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const px = perp[1] * from[2] - perp[2] * from[1];
    const py = perp[2] * from[0] - perp[0] * from[2];
    const pz = perp[0] * from[1] - perp[1] * from[0];
    const pl = Math.hypot(px, py, pz);
    return { axis: [px / pl, py / pl, pz / pl], angleRad: Math.PI };
  }
  return { axis: [cx / len, cy / len, cz / len], angleRad: Math.atan2(len, dot) };
}

export interface LookAt {
  eye: Vec3;
  center: Vec3;
  up: Vec3;
}

/**
 * Unproject a screen point through the camera and intersect the horizontal
 * plane y = planeY. Returns the world point, or null when the ray runs
 * parallel to the plane or away from it (at/above the horizon).
 *
 * fovYDeg is the full vertical field of view; screen coords are in the same
 * units as the viewport size, origin top-left, y down.
 */
export function screenPointOnPlane(
  look: LookAt,
  fovYDeg: number,
  viewW: number,
  viewH: number,
  screenX: number,
  screenY: number,
  planeY: number,
): [number, number, number] | null {
  const { eye, center, up } = look;
  const f: Vec3 = [center[0] - eye[0], center[1] - eye[1], center[2] - eye[2]];
  const fl = Math.hypot(f[0], f[1], f[2]) || 1;
  const fwd: Vec3 = [f[0] / fl, f[1] / fl, f[2] / fl];
  const r: Vec3 = [
    fwd[1] * up[2] - fwd[2] * up[1],
    fwd[2] * up[0] - fwd[0] * up[2],
    fwd[0] * up[1] - fwd[1] * up[0],
  ];
  const rl = Math.hypot(r[0], r[1], r[2]) || 1;
  const right: Vec3 = [r[0] / rl, r[1] / rl, r[2] / rl];
  const u: Vec3 = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0],
  ];

  const tanV = Math.tan((fovYDeg * Math.PI) / 360);
  const tanH = tanV * (viewW / viewH);
  const ndcX = (2 * screenX) / viewW - 1;
  const ndcY = 1 - (2 * screenY) / viewH;
  const dir: Vec3 = [
    fwd[0] + ndcX * tanH * right[0] + ndcY * tanV * u[0],
    fwd[1] + ndcX * tanH * right[1] + ndcY * tanV * u[1],
    fwd[2] + ndcX * tanH * right[2] + ndcY * tanV * u[2],
  ];

  const t = (planeY - eye[1]) / dir[1];
  if (!Number.isFinite(t) || t <= 0) return null;
  return [eye[0] + t * dir[0], eye[1] + t * dir[1], eye[2] + t * dir[2]];
}

/** Smallest rotation angle between two unit quaternions, in degrees. */
export function quatAngleDeg(a: Quat, b: Quat): number {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI;
}
