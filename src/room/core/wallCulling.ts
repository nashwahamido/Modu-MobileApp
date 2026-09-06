// Control which of the four walls stand between the camera and the room, and how opaque each should be

import type { ShellWallId } from "./roomShell";
import { SHELL_WALL_IDS } from "./roomShell";

// Each wall's OUTWARD normal on the floor plane, in the camera orbit's own (x, z) axes
const OUTWARD: Record<ShellWallId, { x: number; z: number }> = {
  "x-min": { x: -1, z: 0 },
  "x-max": { x: 1, z: 0 },
  "z-min": { x: 0, z: -1 },
  "z-max": { x: 0, z: 1 },
};

// How far "in front" a wall must get before it is fully gone — about 7° of orbit past the moment it starts to block.
export const WALL_FADE_BAND = 0.12;

// Below this the alpha is not worth a JSI call
export const WALL_ALPHA_EPSILON = 1 / 255;

const smoothstep = (t: number): number => t * t * (3 - 2 * t);

// theta is the orbit azimuth from +Z, so the camera's direction from the room centre is (sin, cos) on the floor plane.
export function wallAlpha(wall: ShellWallId, theta: number): number {
  const n = OUTWARD[wall];
  // Positive when the camera sits on this wall's OUTSIDE. Zero or below is edge-on or behind, where the wall blocks nothing and stays solid.
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

// A cornice CORNER belongs to two walls and must be drawn while EITHER is: hidden with the x wall alone, the still-visible z wall ends in mid-air.
// Exactly one x and one z wall are hidden at a generic azimuth, so this leaves three of the four corner blocks standing.
const CORNER_MATERIAL = /^Trim_(xmin|xmax)_(zmin|zmax)$/;

export function cornerAlpha(
  materialName: string,
  theta: number,
): number | null {
  const walls = cornerWalls(materialName);
  return walls
    ? Math.max(wallAlpha(walls[0], theta), wallAlpha(walls[1], theta))
    : null;
}

// The two walls a cornice corner joins, or null if this is not a corner material.
export function cornerWalls(
  materialName: string,
): [ShellWallId, ShellWallId] | null {
  const match = CORNER_MATERIAL.exec(materialName);
  return match ? [BY_SUFFIX[match[1]], BY_SUFFIX[match[2]]] : null;
}

// Which wall a shell material belongs to. Null for surfaces that never cull, for corner blocks (they answer to two walls), for the Ceiling, and for any furniture material passing through.
// The Wall_ and Trim_ groups fade TOGETHER: a cornice hanging over a hidden wall is worse than no cornice at all.
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

// The material names each wall owns — also the export contract scripts/set-shell-blend-modes.mjs checks.
export function shellWallMaterials(wall: ShellWallId): [string, string] {
  const suffix = wall.replace("-", "");
  return [`Wall_${suffix}`, `Trim_${suffix}`];
}

// Wall-mounted furniture fades on its wall's OWN alpha, with no separate curve and no threshold: the moment an item has a schedule of its own it disagrees with the wall somewhere in the band, and a window emptying out of a wall still at half alpha is the glitch this replaced.
// It used to POP because furniture GLBs ship OPAQUE frame materials and alpha written to one is discarded — an ASSET fact, fixed in Modu-Portal, whose fix-catalog-blend-modes.mjs re-declares wall items' materials as BLEND.
// A GLB that has not been through that script holds full opacity and then vanishes: degraded, not broken, and recognisable because it looks like the old pop.
// The renderer drops a faded-out item at WALL_ALPHA_EPSILON rather than leaving it at alpha 0, and needs no hysteresis there — either side of the threshold the item is equally invisible.

// The walls a player can SEE right now, best-facing first. Placement uses it: a window dropped on a wall the camera stands outside of is invisible the moment it lands, which reads as the placement failing.
export function visibleWalls(theta: number): ShellWallId[] {
  return SHELL_WALL_IDS.filter((wall) => wallAlpha(wall, theta) > 0.5).sort(
    (a, b) => facing(a, theta) - facing(b, theta),
  );
}

// How much a wall's OUTWARD normal points along the view direction. Most negative = most square-on.
function facing(wall: ShellWallId, theta: number): number {
  const n = OUTWARD[wall];
  return n.x * Math.sin(theta) + n.z * Math.cos(theta);
}

// Two adjacent walls are hidden at a generic azimuth, exactly ONE when the camera lines up with an axis. Never three, and never an opposite pair — that would be looking through the room from both sides.
export function hiddenWalls(theta: number): ShellWallId[] {
  return SHELL_WALL_IDS.filter((wall) => wallAlpha(wall, theta) < 0.5);
}
