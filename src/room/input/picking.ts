// Screen point → floor cell, by analytic ray-vs-plane intersection — no physics raycaster.
// The camera is fully known (orbit state + the 68 mm lens + viewport), so a finger position maps
// to a grid cell with plain algebra. Pure math: testable by projecting a known cell centre to the
// screen and picking it back.
import { eyeFor, ORBIT, type OrbitAngles } from "./orbit";
import { roomPointToFloorCell, roomPointToWallCell, type Cell } from "../core/grid";
import { ROOM_SHELL, ROOM_TARGET, roomToScene, sceneToRoom, type Vec3, type WallId } from "../core/roomShell";

// Filament's setLensProjection uses a 35mm-equivalent sensor: vertical FOV = 2·atan(24 / 2f).
const TAN_HALF_V = 12 / ORBIT.focalLengthMm;

type Basis = { eye: Vec3; fwd: Vec3; right: Vec3; up: Vec3 };

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

function cameraBasis(angles: OrbitAngles): Basis {
  const eye = eyeFor(ROOM_TARGET, angles);
  const fwd = norm(sub(ROOM_TARGET, eye));
  // phi is clamped well away from 0, so fwd can never be parallel to world-up.
  const right = norm(cross(fwd, { x: 0, y: 1, z: 0 }));
  return { eye, fwd, right, up: cross(right, fwd) };
}

// The finger's ray in scene space — shared by every plane the room can be picked against.
function screenRay(
  px: number,
  py: number,
  viewport: { width: number; height: number },
  angles: OrbitAngles,
): { eye: Vec3; dir: Vec3 } {
  const { eye, fwd, right, up } = cameraBasis(angles);
  const aspect = viewport.width / viewport.height;
  const ndcX = (2 * px) / viewport.width - 1;
  const ndcY = 1 - (2 * py) / viewport.height;
  return {
    eye,
    dir: {
      x: fwd.x + right.x * ndcX * TAN_HALF_V * aspect + up.x * ndcY * TAN_HALF_V,
      y: fwd.y + right.y * ndcX * TAN_HALF_V * aspect + up.y * ndcY * TAN_HALF_V,
      z: fwd.z + right.z * ndcX * TAN_HALF_V * aspect + up.z * ndcY * TAN_HALF_V,
    },
  };
}

// The scene-space point where the ray through (px, py) meets the floor plane, or null when the
// finger points above the horizon of the floor.
export function screenPointToFloorScene(
  px: number,
  py: number,
  viewport: { width: number; height: number },
  angles: OrbitAngles,
): Vec3 | null {
  const { eye, dir } = screenRay(px, py, viewport, angles);
  const floorY = roomToScene({ x: 0, y: ROOM_SHELL.floor.y, z: 0 }).y;
  const t = (floorY - eye.y) / dir.y;
  if (!Number.isFinite(t) || t <= 0) return null;
  return { x: eye.x + dir.x * t, y: floorY, z: eye.z + dir.z * t };
}

// The wall cell under a finger — the same analytic pick against the wall's inner-face plane
// instead of the floor. May be off-grid (past the wall's run or above its top); callers clamp or
// reject via canPlace, exactly like the floor path.
export function screenPointToWallCell(
  px: number,
  py: number,
  viewport: { width: number; height: number },
  angles: OrbitAngles,
  wall: WallId,
): Cell | null {
  const { eye, dir } = screenRay(px, py, viewport, angles);
  const spec = ROOM_SHELL.walls[wall];
  const planeScene =
    wall === "x-min"
      ? roomToScene({ x: spec.innerFace, y: 0, z: 0 }).x
      : roomToScene({ x: 0, y: 0, z: spec.innerFace }).z;
  const along = wall === "x-min" ? dir.x : dir.z;
  const origin = wall === "x-min" ? eye.x : eye.z;
  const t = (planeScene - origin) / along;
  if (!Number.isFinite(t) || t <= 0) return null;
  const hit = { x: eye.x + dir.x * t, y: eye.y + dir.y * t, z: eye.z + dir.z * t };
  return roomPointToWallCell(wall, sceneToRoom(hit));
}

// The floor cell under a finger. May be off-grid — callers run it through anchor/clamp/canPlace,
// which is what keeps the ghost inside the room.
export function screenPointToFloorCell(
  px: number,
  py: number,
  viewport: { width: number; height: number },
  angles: OrbitAngles,
): Cell | null {
  const hit = screenPointToFloorScene(px, py, viewport, angles);
  if (!hit) return null;
  return roomPointToFloorCell(sceneToRoom(hit));
}

// Forward projection — room point to screen — used by tests to prove pick(project(cell)) round-trips,
// and by any UI that wants to badge a placement.
export function roomPointToScreen(
  point: Vec3,
  viewport: { width: number; height: number },
  angles: OrbitAngles,
): { x: number; y: number } | null {
  const { eye, fwd, right, up } = cameraBasis(angles);
  const scene = roomToScene(point);
  const d = sub(scene, eye);
  const zDepth = d.x * fwd.x + d.y * fwd.y + d.z * fwd.z;
  if (zDepth <= 0) return null;
  const aspect = viewport.width / viewport.height;
  const ndcX = (d.x * right.x + d.y * right.y + d.z * right.z) / (zDepth * TAN_HALF_V * aspect);
  const ndcY = (d.x * up.x + d.y * up.y + d.z * up.z) / (zDepth * TAN_HALF_V);
  return {
    x: ((ndcX + 1) / 2) * viewport.width,
    y: ((1 - ndcY) / 2) * viewport.height,
  };
}
