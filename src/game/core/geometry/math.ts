import { Quat, Vec3 } from "@/src/game/core/type";

export function vec3Distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function quatRotateVec3(q: Quat, v: Vec3): [number, number, number] {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
}

export function quatFromAxisAngle(axis: Vec3, rad: number): Quat {
  const l = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const s = Math.sin(rad / 2);
  return [
    (axis[0] / l) * s,
    (axis[1] / l) * s,
    (axis[2] / l) * s,
    Math.cos(rad / 2),
  ];
}

export function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function quatAngleDeg(a: Quat, b: Quat): number {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI;
}

/**
 * Spherical-linear interpolation between two unit quaternions (xyzw). t=0 → a,
 * t=1 → b, taking the shortest arc. Used to ease a held part's rotation toward
 * the socket it's approaching so the drop has no orientation pop.
 */
export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bx = b[0],
    by = b[1],
    bz = b[2],
    bw = b[3];
  if (dot < 0) {
    dot = -dot;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (dot > 0.9995) {
    const x = a[0] + (bx - a[0]) * t;
    const y = a[1] + (by - a[1]) * t;
    const z = a[2] + (bz - a[2]) * t;
    const w = a[3] + (bw - a[3]) * t;
    const l = Math.hypot(x, y, z, w) || 1;
    return [x / l, y / l, z / l, w / l];
  }
  const theta = Math.acos(Math.min(1, dot));
  const sin = Math.sin(theta);
  const ka = Math.sin((1 - t) * theta) / sin;
  const kb = Math.sin(t * theta) / sin;
  return [
    a[0] * ka + bx * kb,
    a[1] * ka + by * kb,
    a[2] * ka + bz * kb,
    a[3] * ka + bw * kb,
  ];
}

/**
 * Unit quaternion (xyzw) as axis-angle — the form filament's setEntityRotation
 * wants. Returns null for the identity (no rotation needed).
 */
export function quatToAxisAngle(
  q: Quat,
): { angleRad: number; axis: [number, number, number] } | null {
  const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  const qw = Math.max(-1, Math.min(1, q[3] / len));
  const angleRad = 2 * Math.acos(qw);
  const s = Math.sqrt(Math.max(0, 1 - qw * qw));
  if (angleRad < 1e-6 || s < 1e-6) return null;
  return {
    angleRad,
    axis: [q[0] / len / s, q[1] / len / s, q[2] / len / s],
  };
}

/**
 * Shortest rotation taking unit vector `from` onto unit vector `to`, as
 * axis-angle (the form filament's setEntityRotation wants). Antiparallel
 * inputs rotate pi about an arbitrary perpendicular axis.
 */
export function axisAngleBetween(
  from: Vec3,
  to: Vec3,
): { axis: [number, number, number]; angleRad: number } {
  const dot = from[0] * to[0] + from[1] * to[1] + from[2] * to[2];
  const cx = from[1] * to[2] - from[2] * to[1];
  const cy = from[2] * to[0] - from[0] * to[2];
  const cz = from[0] * to[1] - from[1] * to[0];
  const len = Math.hypot(cx, cy, cz);
  if (len < 1e-8) {
    if (dot > 0) return { axis: [0, 1, 0], angleRad: 0 };
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
 * plane y = planeY. Returns the world point, or null when the ray runs parallel
 * to the plane or away from it. fovYDeg is the full vertical field of view;
 * screen coords share the viewport's units, origin top-left, y down.
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
