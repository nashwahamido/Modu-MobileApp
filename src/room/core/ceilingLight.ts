// The room's ceiling fitting as pure geometry: where it hangs, how wide it throws, how the key/fill pair splits. How bright and warm it burns is a fact about the HOUR and lives on SunPreset.
// WHY TWO LIGHTS: the fitting is INVISIBLE and always will be — the camera is clamped above the room, so the ceiling plane sits between eye and room and CEILING_MATERIAL is pinned to alpha 0.
// The only cue a bulb hangs overhead is the SHAPE OF THE FALLOFF, and a single wide point has none, which is why it read as dim however many lumens it carried. A lone spot gives the shape but leaves the corners black in a room players arrange furniture in.
// The invariant that carries the design, pinned in the test: the outer cone must NOT reach the floor corners.
import { ROOM_SHELL, type Vec3 } from "./roomShell";

const DEG = Math.PI / 180;

// Where the fitting hangs, in ROOM space. Derived from ROOM_SHELL rather than written out, so a re-export carries it.
export const CEILING_LIGHT_AT: Vec3 = {
  x: (ROOM_SHELL.floor.minX + ROOM_SHELL.floor.maxX) / 2,
  z: (ROOM_SHELL.floor.minZ + ROOM_SHELL.floor.maxZ) / 2,
  // Just under the wall band's top, so the source sits inside the room rather than buried in the slab.
  y: ROOM_SHELL.walls["x-min"].top - 0.1,
};

// How far the fitting hangs above the floor, in metres. Every cone-to-floor sum below is built on it.
export const CEILING_LIGHT_DROP = CEILING_LIGHT_AT.y - ROOM_SHELL.floor.y;

// Half the floor's x extent: the nearest a wall gets, and the distance the key cone must clear.
export const FLOOR_HALF_WIDTH = (ROOM_SHELL.floor.maxX - ROOM_SHELL.floor.minX) / 2;

// Plan distance to the farthest floor corner: what the key cone must NOT reach, and the fill must.
export const FLOOR_CORNER_DISTANCE = Math.hypot(
  FLOOR_HALF_WIDTH,
  (ROOM_SHELL.floor.maxZ - ROOM_SHELL.floor.minZ) / 2,
);

export const CEILING_LIGHT_RIG = {
  // The key's outer cone as a HALF-ANGLE from straight down. 45 puts the beam's floor edge just past the walls and short of the corners.
  // Widening toward 50 is the full adjustment range if the corners prove too dark; past that the gradient is gone and this rig has no reason to exist.
  outerDeg: 45,
  // Inner cone as a fraction of outer, so the beam feathers instead of cutting. The same 70% RoomLit applies to bought lamps — one rule across every light in the room.
  innerRatio: 0.7,
  // The fill's share of the key's lumens, global rather than per-hour. The corners sit outside the key's cone by design, so the fill is the ONLY light on them and a quarter of the key could not carry it.
  // Raise this before widening the cone — widening spends the gradient the key exists to create.
  fillRatio: 0.6,
  // The key's falloff radius, NOT the distance the beam travels: Filament's window is (1 - (d/r)^4)^2, already eating 85% of the light at d/r = 0.89, so a radius set "just past the farthest lit thing" darkens the whole periphery.
  // It was briefly 4.5 on that reasoning and the outer pool went black. The beam is bounded by the CONE, not by this.
  keyReachMetres: 6,
  // The fill's falloff radius: the farthest thing it must light is a floor corner at 4.25m slant, and 6 keeps it comfortably inside.
  fillReachMetres: 6,
};

// The cone Filament wants: [inner, outer] as HALF-ANGLES IN RADIANS. Not the form item_lights.cone_deg uses for bought lamps, which stores the FULL outer angle and is halved by RoomLit on the way in.
export function ceilingCone(): [number, number] {
  const outer = CEILING_LIGHT_RIG.outerDeg * DEG;
  return [outer * CEILING_LIGHT_RIG.innerRatio, outer];
}

// How far across the floor a half-angle reaches. Purely diagnostic — the number to check when re-angling the cone, as poolLength is for the sun.
export function poolRadius(halfAngleDeg: number): number {
  return CEILING_LIGHT_DROP * Math.tan(halfAngleDeg * DEG);
}

// The fill's lumens for a key of this many, so the renderer never carries its own copy of the ratio.
export function fillLumens(keyLumens: number): number {
  return keyLumens * CEILING_LIGHT_RIG.fillRatio;
}
