// The room's own ceiling fitting, as pure geometry. Where it hangs, how wide it throws, and how the key/fill pair splits — all facts about the ROOM. How bright and how warm it burns is a fact about the HOUR and lives on SunPreset in ./timeOfDay. That split is the renderer's own and it is why this module knows nothing about the time of day.
//
// WHY TWO LIGHTS. A single wide point — what shipped until 2026-08-18 — spreads evenly and reads as the inside of a lightbox. That matters more here than in most scenes because the fitting is INVISIBLE and always will be: ORBIT.phi is clamped below PI/2, so the camera is always above the room looking down, which puts the ceiling plane between the eye and the room and is why CEILING_MATERIAL is pinned to alpha 0. Nothing can ever be drawn up there. So the only cue that a bulb hangs overhead is the SHAPE OF THE FALLOFF on the floor and walls, and a light with no falloff has no shape — which is also why it read as dim no matter how many lumens it carried. A lone spot gives the shape but leaves the corners black in a room players arrange furniture in. Hence: a spot for the mood, a dim point beneath it for the corners.
//
// Pure data and pure functions: no Filament, no React. ./ceilingLight.test.ts pins the invariants, and the one that carries the design is that the outer cone must NOT reach the floor corners.
import { ROOM_SHELL, type Vec3 } from "./roomShell";

const DEG = Math.PI / 180;

/** Where the fitting hangs, in ROOM space. Derived from ROOM_SHELL rather than written out, because nothing in this codebase carries its own copy of a shell measurement: re-export the shell and this follows it. */
export const CEILING_LIGHT_AT: Vec3 = {
  x: (ROOM_SHELL.floor.minX + ROOM_SHELL.floor.maxX) / 2,
  z: (ROOM_SHELL.floor.minZ + ROOM_SHELL.floor.maxZ) / 2,
  // Just under the wall band's top, so the source sits inside the room rather than buried in the ceiling slab.
  y: ROOM_SHELL.walls["x-min"].top - 0.1,
};

/** How far the fitting hangs above the floor, in metres. Every cone-to-floor sum below is built on it. */
export const CEILING_LIGHT_DROP = CEILING_LIGHT_AT.y - ROOM_SHELL.floor.y;

/** Half the floor's x extent — the nearest a wall gets to the fitting, and the distance the key cone must clear. */
export const FLOOR_HALF_WIDTH = (ROOM_SHELL.floor.maxX - ROOM_SHELL.floor.minX) / 2;

/** Plan distance from the fitting to the farthest floor corner — the distance the key cone must NOT reach, and the one the fill must. */
export const FLOOR_CORNER_DISTANCE = Math.hypot(
  FLOOR_HALF_WIDTH,
  (ROOM_SHELL.floor.maxZ - ROOM_SHELL.floor.minZ) / 2,
);

export const CEILING_LIGHT_RIG = {
  /** The key's outer cone as a HALF-ANGLE in degrees, measured from straight down. 45 puts the beam's floor edge just past the walls and well short of the corners — see the test. Widening toward 50 is the full adjustment range if the corners prove too dark to place furniture into; past that the gradient is gone and this rig has no reason to exist. */
  outerDeg: 45,
  /** Inner cone as a fraction of outer, so the beam feathers instead of cutting. The same 70% RoomLit applies to bought lamps — one rule for cone softness across every light in the room, not two. */
  innerRatio: 0.7,
  /** The fill's share of the key's lumens. Global policy rather than per-hour authoring, per YAGNI. Raised from 0.25 on first device check: the corners sit outside the key's cone by design, so the fill is the ONLY light on them, and a quarter of the key could not carry that on its own. Raise this before widening the cone — widening spends the gradient the key exists to create. */
  fillRatio: 0.6,
  /** The key's falloff radius in metres. NOT the distance the beam travels — Filament's falloff window is (1 - (d/r)^4)^2, which is already eating 85% of the light at d/r = 0.89, so a radius set to "just past the farthest lit thing" darkens the whole periphery. It was briefly 4.5 on that mistaken reasoning and the outer pool went black. 6 is the figure the single-light rig used, for this exact reason, and the beam is bounded by the CONE rather than by this. */
  keyReachMetres: 6,
  /** The fill's falloff radius in metres, carried over unchanged from the single-light rig: the farthest thing it must light is a floor corner at 4.25 m of slant distance, and 6 keeps it comfortably inside. */
  fillReachMetres: 6,
};

/** The cone Filament wants: [inner, outer] as HALF-ANGLES IN RADIANS. Deliberately not the form item_lights.cone_deg uses for bought lamps — that column stores the FULL outer angle in degrees and RoomLit halves it on the way in. The room's own fitting authors no DB row, so it states half-angles directly and never performs that halving. */
export function ceilingCone(): [number, number] {
  const outer = CEILING_LIGHT_RIG.outerDeg * DEG;
  return [outer * CEILING_LIGHT_RIG.innerRatio, outer];
}

/** How far across the floor a given half-angle reaches, in metres. Purely diagnostic — the number to check when someone re-angles the cone, exactly as poolLength is for the sun. */
export function poolRadius(halfAngleDeg: number): number {
  return CEILING_LIGHT_DROP * Math.tan(halfAngleDeg * DEG);
}

/** The fill's lumens for a key of this many. One place to apply the ratio, so the renderer never carries its own copy of it. */
export function fillLumens(keyLumens: number): number {
  return keyLumens * CEILING_LIGHT_RIG.fillRatio;
}
