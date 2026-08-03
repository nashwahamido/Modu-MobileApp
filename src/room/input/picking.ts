// Screen point → floor cell, by analytic ray-vs-plane intersection — no physics raycaster.
// The camera is fully known (orbit state + the 68 mm lens + viewport), so a finger position maps
// to a grid cell with plain algebra. Pure math: testable by projecting a known cell centre to the
// screen and picking it back.
import { eyeFor, ORBIT, type OrbitAngles } from "./orbit";
import { roomPointToFloorCell, roomPointToWallCell, surfaceExtent, type Cell, type SurfaceId } from "../core/grid";
import { ROOM_SHELL, ROOM_TARGET, roomToScene, sceneToRoom, type Vec3, type WallId,
  isXWall,
} from "../core/roomShell";
import { visibleWalls } from "../core/wallCulling";

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
  const onX = isXWall(wall);
  const planeScene = onX
    ? roomToScene({ x: spec.innerFace, y: 0, z: 0 }).x
    : roomToScene({ x: 0, y: 0, z: spec.innerFace }).z;
  const along = onX ? dir.x : dir.z;
  const origin = onX ? eye.x : eye.z;
  const t = (planeScene - origin) / along;
  if (!Number.isFinite(t) || t <= 0) return null;
  const hit = { x: eye.x + dir.x * t, y: eye.y + dir.y * t, z: eye.z + dir.z * t };
  return roomPointToWallCell(wall, sceneToRoom(hit));
}

// Which wall a wall-ghost being dragged belongs on now, and the cell under the finger there — the corner-hop, with HYSTERESIS.
// The ghost stays LOYAL to the wall it is already on while the finger is anywhere over that wall's run, and hops only once the finger has left that run AND points inside another wall's run. A naive nearest-plane pick teleported the piece every time the ray grazed a corner, because at a corner the finger is a pixel away from being over either wall.
// The hop candidates are the walls the camera can actually SEE (visibleWalls, already sorted best-facing first), never all four. Every wall plane is infinite and a forward ray crosses the two walls BETWEEN the eye and the room from outside, so a hidden wall answers a pick perfectly happily — and would drop the piece on a surface the player is standing behind. Best-facing first settles the remaining ambiguity in the player's favour: with two walls visible and the finger over both runs, the piece lands on the one being looked at most squarely.
// Null means the finger is over no candidate's run at all, which the caller reads as "leave the ghost where it is" — the same answer the old two-wall code gave by falling off its second `if`.
export function dragWallTarget(
  here: WallId,
  px: number,
  py: number,
  viewport: { width: number; height: number },
  angles: OrbitAngles,
): { wall: WallId; cell: Cell } | null {
  const own = screenPointToWallCell(px, py, viewport, angles, here);
  if (own && onWallRun(here, own)) return { wall: here, cell: own };
  for (const wall of visibleWalls(angles.theta)) {
    if (wall === here) continue;
    const hop = screenPointToWallCell(px, py, viewport, angles, wall);
    if (hop && onWallRun(wall, hop)) return { wall, cell: hop };
  }
  return null;
}

// Does this finger point at the surface a ghost lives on? The drag layer's OWNERSHIP question: while a piece is being placed, a finger on its surface moves the PIECE and a finger anywhere else — another surface, the cornice, the backdrop past the diorama — orbits the CAMERA instead. Both used to be the piece, which left no way to look behind a wall mid-placement.
// "Where the piece can go" is the whole rule, so this tests the full grid on both axes rather than dragWallTarget's run-only loyalty test: the sky above a wall's top row is backdrop, and the floor in front of it is not a wall. The candidates for a wall ghost are its OWN wall plus the ones the camera can see, because ownership is asked at touch-down, before any hop — a drag aimed at the wall round the corner has to belong to the piece too, or carrying a window round that corner would orbit instead.
// The answer is only ever needed at touch-down: the drag latches its mode there and holds it, so a piece being dragged to the room's edge keeps its finger even as that finger strays off the floor.
export function pointsAtSurface(
  px: number,
  py: number,
  viewport: { width: number; height: number },
  angles: OrbitAngles,
  surface: SurfaceId,
): boolean {
  if (surface.kind === "floor") {
    const cell = screenPointToFloorCell(px, py, viewport, angles);
    return cell !== null && onSurfaceGrid(cell, surface);
  }
  // A furniture surface has no extent yet (surfaceExtent returns 0x0), so it owns nothing and every
  // drag orbits — the same conservative answer the rest of the grid gives such a placement.
  if (surface.kind !== "wall") return false;
  for (const wall of [surface.wall, ...visibleWalls(angles.theta)]) {
    const cell = screenPointToWallCell(px, py, viewport, angles, wall);
    if (cell && onSurfaceGrid(cell, { kind: "wall", wall })) return true;
  }
  return false;
}

function onSurfaceGrid(cell: Cell, surface: SurfaceId): boolean {
  const { w, h } = surfaceExtent(surface);
  return cell.x >= 0 && cell.x < w && cell.y >= 0 && cell.y < h;
}

// Only the RUN decides which wall a finger is over, never the height: a finger above the cornice or below the floor is still pointing at that wall, and clamping the row is the drag pipeline's job (clampToSurface) exactly as it is on the floor.
function onWallRun(wall: WallId, cell: Cell): boolean {
  return cell.x >= 0 && cell.x < surfaceExtent({ kind: "wall", wall }).w;
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

// A pickable volume in authored room units — see floorPlacementBox in ../core/grid.
export type PickBox = { min: Vec3; max: Vec3 };

// Where the ray enters a scene-space box, or null if it misses. Standard slab test, with tmin
// starting at 0 so a ray that begins INSIDE a box (the camera zoomed into a wardrobe) still counts
// as a hit rather than reporting the entry behind the eye.
function rayBoxEntry(eye: Vec3, dir: Vec3, min: Vec3, max: Vec3): number | null {
  let tmin = 0;
  let tmax = Infinity;
  for (const axis of ["x", "y", "z"] as const) {
    // A ray parallel to this pair of slabs either runs down the box forever or misses it outright;
    // dividing by the near-zero component would hand the slab test a NaN to swallow.
    if (Math.abs(dir[axis]) < 1e-12) {
      if (eye[axis] < min[axis] || eye[axis] > max[axis]) return null;
      continue;
    }
    const inv = 1 / dir[axis];
    const t0 = (min[axis] - eye[axis]) * inv;
    const t1 = (max[axis] - eye[axis]) * inv;
    tmin = Math.max(tmin, Math.min(t0, t1));
    tmax = Math.min(tmax, Math.max(t0, t1));
    if (tmax < tmin) return null;
  }
  return tmin;
}

// The index of the NEAREST box the finger's ray enters, or null when it points at none of them.
// Nearest rather than first, so pressing a piece can never reach through it to something standing
// behind: that is the whole of the occlusion the room needs, since the pieces are the only things
// a player can pick up.
export function pickBoxAt(
  px: number,
  py: number,
  viewport: { width: number; height: number },
  angles: OrbitAngles,
  boxes: readonly PickBox[],
): number | null {
  const { eye, dir } = screenRay(px, py, viewport, angles);
  let best: number | null = null;
  let bestT = Infinity;
  boxes.forEach((box, index) => {
    // roomToScene is a positive uniform scale about a fixed centre, so the box's min/max corners
    // stay its min/max corners — no re-sorting needed.
    const t = rayBoxEntry(eye, dir, roomToScene(box.min), roomToScene(box.max));
    if (t !== null && t < bestT) {
      bestT = t;
      best = index;
    }
  });
  return best;
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
