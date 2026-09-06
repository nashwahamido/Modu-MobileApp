// Screen point → floor cell by analytic ray-vs-plane intersection, no physics raycaster: the camera is fully known, so a finger maps to a grid cell with plain algebra.
// Pure maths, testable by projecting a known cell centre to the screen and picking it back.
import { eyeFor, ORBIT, type OrbitAngles } from "./orbit";
import { floorPlacementBox, hostTopExtent, resolveHost, roomPointToFloorCell, roomPointToTopCell, roomPointToWallCell, surfaceExtent, topPlacementBox, wallPlacementBox, type Cell, type GridPlacement, type HostContext, type PlaceableItemDef, type SurfaceId } from "../core/grid";
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

// Where the ray through (px, py) meets the floor plane, or null when the finger points above the floor's horizon.
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

// The wall cell under a finger: the same analytic pick against the wall's inner-face plane. May be off-grid, and callers clamp or reject via canPlace as on the floor.
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

// The corner-hop, with HYSTERESIS: a ghost stays LOYAL to its current wall while the finger is anywhere over that wall's run, and hops only once the finger has left it AND points inside another's.
// A naive nearest-plane pick teleported the piece whenever the ray grazed a corner, where the finger is a pixel from being over either wall.
// Candidates are the walls the camera can SEE, never all four: every wall plane is infinite and a forward ray crosses the near ones from outside, so a hidden wall answers happily and would drop the piece behind the player.
// Best-facing first settles the rest in the player's favour. Null means the finger is over no candidate's run, which the caller reads as "leave the ghost where it is".
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

// The drag layer's OWNERSHIP question: while a piece is being placed, a finger on its surface moves the PIECE and a finger anywhere else orbits the CAMERA. Both used to be the piece, which left no way to look behind a wall mid-placement.
// "Where the piece can go" is the rule, so this tests the full grid on both axes rather than dragWallTarget's run-only loyalty: the sky above a wall's top row is backdrop, and the floor in front of it is not a wall.
// A wall ghost's candidates are its OWN wall plus the visible ones, because ownership is asked at touch-down before any hop — otherwise carrying a window round a corner would orbit instead.
// Only ever needed at touch-down: the drag latches its mode there, so a piece dragged to the room's edge keeps its finger even as that finger strays off the floor.
export function pointsAtSurface(
  px: number,
  py: number,
  viewport: { width: number; height: number },
  angles: OrbitAngles,
  surface: SurfaceId,
  // For a furniture-surface ghost: ITS host's top, resolved by the caller, since the store knows the layout and this module does not. Absent, a furniture surface owns nothing.
  topTarget?: TopTarget,
): boolean {
  if (surface.kind === "floor") {
    const cell = screenPointToFloorCell(px, py, viewport, angles);
    return cell !== null && onSurfaceGrid(cell, surface);
  }
  if (surface.kind === "furniture") {
    if (!topTarget) return false;
    const cell = screenPointToTopCell(px, py, viewport, angles, topTarget);
    const { w, d } = hostTopExtent(topTarget.host.def);
    return cell !== null && cell.x >= 0 && cell.x < w && cell.y >= 0 && cell.y < d;
  }
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

// Only the RUN decides which wall a finger is over, never the height: a finger above the cornice still points at that wall, and clamping the row is clampToSurface's job as on the floor.
function onWallRun(wall: WallId, cell: Cell): boolean {
  return cell.x >= 0 && cell.x < surfaceExtent({ kind: "wall", wall }).w;
}

// The floor cell under a finger. May be off-grid — callers run it through anchor/clamp/canPlace, which keeps the ghost inside the room.
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

// A host whose top a finger might target: the resolved host plus its rendered top height, computed by the caller who has the catalog.
export type TopTarget = { host: HostContext; topHeight: number };

// The host-frame cell under a finger on a host's TOP PLANE: the floor pick lifted to floor + topHeight, then turned into host frame. Null above the plane's horizon, and may be off-grid for callers to bound-check.
export function screenPointToTopCell(
  px: number,
  py: number,
  viewport: { width: number; height: number },
  angles: OrbitAngles,
  target: TopTarget,
): Cell | null {
  const { eye, dir } = screenRay(px, py, viewport, angles);
  const planeY = roomToScene({ x: 0, y: ROOM_SHELL.floor.y + target.topHeight, z: 0 }).y;
  const t = (planeY - eye.y) / dir.y;
  if (!Number.isFinite(t) || t <= 0) return null;
  const hit = sceneToRoom({ x: eye.x + dir.x * t, y: planeY, z: eye.z + dir.z * t });
  return roomPointToTopCell(target.host, hit);
}

// Which host's top the finger is over, current-host-first so a drag near a table edge does not flap between neighbours — the same hysteresis dragWallTarget uses.
export function dragTopTarget(
  current: string | null,
  px: number,
  py: number,
  viewport: { width: number; height: number },
  angles: OrbitAngles,
  targets: readonly TopTarget[],
): { hostInstanceId: string; cell: Cell } | null {
  const ordered = [...targets].sort((a, b) =>
    (a.host.placement.instanceId === current ? -1 : 0) - (b.host.placement.instanceId === current ? -1 : 0),
  );
  for (const target of ordered) {
    const cell = screenPointToTopCell(px, py, viewport, angles, target);
    if (!cell) continue;
    const { w, d } = hostTopExtent(target.host.def);
    if (cell.x >= 0 && cell.x < w && cell.y >= 0 && cell.y < d) {
      return { hostInstanceId: target.host.placement.instanceId, cell };
    }
  }
  return null;
}

// A pickable volume in authored room units — see floorPlacementBox in ../core/grid.
export type PickBox = { min: Vec3; max: Vec3 };

// Where the ray enters a scene-space box, or null on a miss. Standard slab test with tmin at 0, so a ray beginning INSIDE a box still counts as a hit rather than reporting an entry behind the eye.
function rayBoxEntry(eye: Vec3, dir: Vec3, min: Vec3, max: Vec3): number | null {
  let tmin = 0;
  let tmax = Infinity;
  for (const axis of ["x", "y", "z"] as const) {
    // A ray parallel to this pair of slabs either runs down the box forever or misses outright, and dividing by the near-zero component hands the slab test a NaN to swallow.
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

// The index of the NEAREST box the ray enters, or null. Nearest rather than first, so pressing a piece can never reach through it to something behind — the whole of the occlusion the room needs.
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
    // roomToScene is a positive uniform scale about a fixed centre, so min/max corners stay min/max — no re-sorting needed.
    const t = rayBoxEntry(eye, dir, roomToScene(box.min), roomToScene(box.max));
    if (t !== null && t < bestT) {
      bestT = t;
      best = index;
    }
  });
  return best;
}

// What a piece is picked against: its def and its real-world size, already scaled by fitScale. Null for an id the catalog cannot resolve yet, which cannot be picked up.
export type PickResolver = (
  itemId: string,
) => { def: PlaceableItemDef; size: Vec3 } | null;

// EVERY PIECE IN THE ROOM AS A PICKABLE VOLUME, whatever surface it stands on.
// A piece is picked against its VOLUME, never the plane it sits on: it stands up out of its cells, so the ray through the body the player sees meets that plane one to three cells BEHIND it.
// Plane-picking therefore leaves only a sliver at the base live, and for a wall item with real depth (the eket cabinet, nearly two cells) nothing reachable at all. Worse, the offset's DIRECTION follows the azimuth, so the live band slides as the room turns and reads as an unreliable long-press.
// ONE array is what makes pickBoxAt's nearest-wins reach across surface kinds: a chair in front of a wall painting is genuinely nearer, so it wins on distance rather than a "floor beats wall" rule that would be wrong exactly when the two overlap.
// Extracted from RoomScene's pickUpAt so it can be tested directly — a merge once reverted the wall arm to plane-picking and every test passed, because they exercised the pieces this assembles rather than the assembly.
export function placementPickBoxes(
  layout: readonly GridPlacement[],
  resolve: PickResolver,
  // Only walls the camera can SEE — picking a hidden wall hands the player a piece they cannot look at.
  wallVisible: (wall: WallId) => boolean,
): { placement: GridPlacement; box: PickBox }[] {
  const defs = new Map<string, PlaceableItemDef>();
  for (const p of layout) {
    const resolved = resolve(p.itemId);
    if (resolved) defs.set(p.itemId, resolved.def);
  }

  const out: { placement: GridPlacement; box: PickBox }[] = [];
  for (const placement of layout) {
    const resolved = resolve(placement.itemId);
    if (!resolved) continue;
    const { def, size } = resolved;
    if (placement.surface.kind === "floor") {
      out.push({ placement, box: floorPlacementBox(placement, def, size.y) });
    } else if (placement.surface.kind === "wall") {
      if (!wallVisible(placement.surface.wall)) continue;
      out.push({
        placement,
        box: wallPlacementBox(placement.surface.wall, placement, def, size.z),
      });
    } else {
      // A stacked piece's box stands on its host's top, which lets the ray hit IT before the larger host box beneath — geometry, not priority code.
      const host = resolveHost(placement.surface.hostInstanceId, layout, defs);
      const hostSize = host ? resolve(host.placement.itemId) : null;
      if (!host || !hostSize) continue;
      out.push({
        placement,
        box: topPlacementBox(host, placement, def, hostSize.size.y, size.y),
      });
    }
  }
  return out;
}

// Forward projection, room point to screen: used by tests to prove pick(project(cell)) round-trips, and by any UI badging a placement.
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
