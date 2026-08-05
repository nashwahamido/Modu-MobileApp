// Turn a lighting item's authored aim angles into the direction vector Filament wants.
//
// THIS FILE IS ONE HALF OF A CROSS-REPO CONTRACT. The workshop portal (Modu-Portal) writes aim_pitch_deg / aim_yaw_deg; this repo reads them. Nothing at compile time connects the two, so the failure that matters is not a wrong number but a disagreement about what the numbers MEAN — if the portal takes pitch 0 as "up" and this takes it as "down", every lamp aims backwards, both sides look individually correct, and the uploader approves a preview that is not what ships.
//
// The convention is defined in supabase/migrations/014_light_aim.sql, which is the one file both repos share, and it is defined there as worked examples rather than prose. ./lightAim.test.ts asserts those same pairs; the portal carries the same fixture. If either side flips a sign, its own test fails.
//
//   pitch  0 = straight down (the resting case for nearly every lamp)
//   pitch 90 = horizontal
//   pitch 180 = straight up
//   yaw    0 = toward -Z (the model's own forward), increasing toward +X
//
// Angles are in the PIECE'S OWN SPACE at rotSteps 0, so they turn with the furniture — the renderer applies the placement's rotation on top of this.
import type { Vec3 } from "./roomShell";

/** Straight down. The aim a lamp falls back to when it has none of its own, and the resting case the whole convention is built around. */
export const AIM_DOWN: Vec3 = { x: 0, y: -1, z: 0 };

const DEG = Math.PI / 180;

/**
 * Unit direction for an authored aim.
 *
 * Both angles are nullable because item_lights stores them NULL for a point light, which has no direction at all — a point ignores whatever this returns, and straight down is the honest answer to
 * "which way does an omnidirectional bulb face".
 *
 * Out-of-range values fall back rather than throw. The DB constrains them, but the catalog arrives over
 * the network and a stale cache or a hand-edited row must not take the room down: a lamp aimed the
 * wrong way is a visible bug someone reports, a crash on entering the room is not.
 */
export function aimToDirection(pitchDeg: number | null, yawDeg: number | null): Vec3 {
  if (pitchDeg == null || yawDeg == null) return AIM_DOWN;
  if (!Number.isFinite(pitchDeg) || !Number.isFinite(yawDeg)) return AIM_DOWN;
  if (pitchDeg < 0 || pitchDeg > 180) return AIM_DOWN;

  const pitch = pitchDeg * DEG;
  // Yaw is taken modulo a turn rather than rejected: 360 and 0 are the same aim, and the DB's end-exclusive range exists to stop two rows LOOKING different, not to make 360 meaningless.
  const yaw = (((yawDeg % 360) + 360) % 360) * DEG;

  const horizontal = Math.sin(pitch);
  return {
    x: horizontal * Math.sin(yaw),
    y: -Math.cos(pitch),
    z: -horizontal * Math.cos(yaw),
  };
}

/** The renderer takes a tuple; the rest of this codebase passes Vec3. One place to convert, so neither shape leaks into the other. */
export function aimTuple(direction: Vec3): [number, number, number] {
  return [direction.x, direction.y, direction.z];
}
