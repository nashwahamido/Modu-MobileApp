// Camera-facing wall culling: which of the shell's four walls are standing between the camera and the room, and how opaque each should therefore be.
//
// The diorama trick every isometric room game uses (Tiny Room Stories, The Sims, Two Point Hospital): all four walls exist in the geometry all the time, and the ones that would block the view are simply not drawn. Because they are still THERE they keep occluding light — Filament's shadow maps treat alpha-blended geometry as opaque, so a wall at alpha 0 casts exactly the shadow it did at alpha 1. That is the whole reason this fades alpha rather than removing entities from the scene: an entity out of the scene is out of the shadow pass too, and the room's interior would re-light every time the camera crossed a boundary.
//
// Pure math, no Filament and no React — the renderer maps the alphas onto material instances by name, and the tests pin the geometry here.
import type { ShellWallId } from "./roomShell";
import { SHELL_WALL_IDS } from "./roomShell";

// Each wall's OUTWARD normal projected onto the floor plane, in the same (x, z) axes the camera orbit uses. Scene space is an axis-preserving scale of room space (see roomToScene), so these need no conversion.
const OUTWARD: Record<ShellWallId, { x: number; z: number }> = {
  "x-min": { x: -1, z: 0 },
  "x-max": { x: 1, z: 0 },
  "z-min": { x: 0, z: -1 },
  "z-max": { x: 0, z: 1 },
};

// How much "in front" a wall must get before it is fully gone, as a dot-product width — about 7 degrees of orbit past the moment it starts to block. The band is ONE-SIDED on purpose. Centring it on the edge-on angle left both side walls sitting at half alpha whenever the camera lined up with an axis, which is wrong twice over: a wall seen edge-on blocks nothing, and the correct straight-on view of a room is a solid back wall between two solid slivers. So a wall is fully solid right up to the instant it begins to block, and fades only as it swings in front.
export const WALL_FADE_BAND = 0.12;

// Below this the alpha is not worth a JSI call — a byte of alpha is 1/255, so anything finer is invisible.
export const WALL_ALPHA_EPSILON = 1 / 255;

const smoothstep = (t: number): number => t * t * (3 - 2 * t);

// theta is the orbit azimuth measured from +Z (see ../input/orbit), so the camera's direction from the room centre is (sin, cos) on the floor plane.
export function wallAlpha(wall: ShellWallId, theta: number): number {
  const n = OUTWARD[wall];
  // Positive when the camera sits on this wall's OUTSIDE, i.e. the wall is between the eye and the room. Zero or below means edge-on or behind, where the wall blocks nothing and stays solid.
  const facing = n.x * Math.sin(theta) + n.z * Math.cos(theta);
  if (facing <= 0) return 1;
  if (facing >= WALL_FADE_BAND) return 0;
  return 1 - smoothstep(facing / WALL_FADE_BAND);
}

export function wallAlphas(theta: number): Record<ShellWallId, number> {
  return {
    "x-min": wallAlpha("x-min", theta),
    "x-max": wallAlpha("x-max", theta),
    "z-min": wallAlpha("z-min", theta),
    "z-max": wallAlpha("z-max", theta),
  };
}

// A cornice CORNER belongs to two walls at once, and must be drawn while EITHER of them is — hide it with the x wall alone and the still-visible z wall ends in mid-air. Since exactly one x wall and one z wall are hidden at a generic azimuth, this is what leaves three of the four corner blocks standing.
const CORNER_MATERIAL = /^Trim_(xmin|xmax)_(zmin|zmax)$/;

export function cornerAlpha(materialName: string, theta: number): number | null {
  const walls = cornerWalls(materialName);
  return walls ? Math.max(wallAlpha(walls[0], theta), wallAlpha(walls[1], theta)) : null;
}

// The two walls a cornice corner joins, or null if this is not a corner material.
export function cornerWalls(materialName: string): [ShellWallId, ShellWallId] | null {
  const match = CORNER_MATERIAL.exec(materialName);
  return match ? [BY_SUFFIX[match[1]], BY_SUFFIX[match[2]]] : null;
}

// Which wall a shell material belongs to, or null for the surfaces that never cull (Floor, FloorEdge), for the corner blocks (they answer to two walls — see cornerAlpha), for the Ceiling (pinned invisible forever), and for any furniture material that happens through here. The Wall_ and Trim_ groups fade TOGETHER: a cornice left hanging over a hidden wall is worse than no cornice at all.
const SHELL_MATERIAL = /^(?:Wall|Trim)_(xmin|xmax|zmin|zmax)$/;

const BY_SUFFIX: Record<string, ShellWallId> = {
  xmin: "x-min",
  xmax: "x-max",
  zmin: "z-min",
  zmax: "z-max",
};

export function shellWallOfMaterial(materialName: string): ShellWallId | null {
  const match = SHELL_MATERIAL.exec(materialName);
  return match ? BY_SUFFIX[match[1]] : null;
}

// The material names each wall owns, which is also the export contract scripts/set-shell-blend-modes.mjs checks for.
export function shellWallMaterials(wall: ShellWallId): [string, string] {
  const suffix = wall.replace("-", "");
  return [`Wall_${suffix}`, `Trim_${suffix}`];
}

// Wall-mounted furniture (windows, photo frames) fades on its wall's OWN alpha — wallAlpha(wall, theta), no separate curve and no threshold. There is nothing to export for it, and that is the point: the moment an item has a schedule of its own, it disagrees with the wall somewhere in the band, and a window that empties out of a wall still standing at half alpha is exactly the glitch this replaced. It used to POP, at the fade midpoint with hysteresis, because furniture GLBs ship OPAQUE frame materials and alpha written to an opaque material is discarded — only the glass would have dimmed while the frame hung solid in mid-air. That is an ASSET fact, not a renderer one, and it is now fixed where it lives: the Modu-Portal repo, which owns catalogue asset processing and uploads — scripts/fix-catalog-blend-modes.mjs sweeps the catalogue and re-declares every wall item's materials as BLEND, which is what makes a frame fadeable at all. A wall item whose GLB has not been through that script holds full opacity through its wall's fade and then vanishes with it — degraded, not broken, and the way to recognise it is that it looks like the old pop. The renderer drops a faded-out item from the scene at WALL_ALPHA_EPSILON rather than leaving it in at alpha 0. No hysteresis is needed on that boundary any more, and its absence is the proof the fade works: on either side of the threshold the item is equally invisible, so a camera parked exactly on it can flicker between the two states all it likes and there is nothing to see.

// The walls a player can actually SEE right now, best-facing first. Placement uses this: a window dropped on a wall the camera is standing outside of is invisible the moment it lands, which reads as the placement having failed. Sorting by how square-on each wall is puts the wall the player is looking at most directly at the head of the list.
export function visibleWalls(theta: number): ShellWallId[] {
  return SHELL_WALL_IDS.filter((wall) => wallAlpha(wall, theta) > 0.5).sort((a, b) => facing(a, theta) - facing(b, theta));
}

// How much a wall's OUTWARD normal points along the view direction. Most negative = most square-on to the camera.
function facing(wall: ShellWallId, theta: number): number {
  const n = OUTWARD[wall];
  return n.x * Math.sin(theta) + n.z * Math.cos(theta);
}

// Two adjacent walls are hidden at a generic azimuth, and exactly ONE when the camera lines up with an axis and the other two go edge-on. Never three, and never an opposite pair — that would be looking through the room from both sides at once. Handy as an invariant for tests and as a cheap assertion that the normals above have not been mis-signed.
export function hiddenWalls(theta: number): ShellWallId[] {
  return SHELL_WALL_IDS.filter((wall) => wallAlpha(wall, theta) < 0.5);
}
