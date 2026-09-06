// Turn a lighting item's authored aim angles into the direction vector Filament wants.
// ONE HALF OF A CROSS-REPO CONTRACT: the workshop portal writes aim_pitch_deg / aim_yaw_deg, this repo reads them, and nothing at compile time connects the two.
// The failure that matters is not a wrong number but a disagreement about what the numbers MEAN — swap "up" for "down" and every lamp aims backwards while both sides look individually correct.
// The convention lives in migration 014_light_aim.sql, the one file both repos share, as worked examples. lightAim.test.ts asserts those pairs and the portal carries the same fixture, so a flipped sign fails its own side's test.
//   pitch 0 = straight down, 90 = horizontal, 180 = straight up. yaw 0 = toward -Z (the model's forward), increasing toward +X.
// Angles are in the PIECE'S OWN SPACE at rotSteps 0, so they turn with the furniture — the renderer applies the placement's rotation on top.
import type { Vec3 } from "./roomShell";

// Straight down: the fallback aim, and the resting case the convention is built around.
export const AIM_DOWN: Vec3 = { x: 0, y: -1, z: 0 };

const DEG = Math.PI / 180;

// Unit direction for an authored aim. Both angles are nullable because item_lights stores NULL for a point light, which ignores whatever this returns.
// Out-of-range values fall back rather than throw: the DB constrains them, but the catalog arrives over the network, and a lamp aimed wrong is a bug someone reports while a crash on entering the room is not.
export function aimToDirection(pitchDeg: number | null, yawDeg: number | null): Vec3 {
  if (pitchDeg == null || yawDeg == null) return AIM_DOWN;
  if (!Number.isFinite(pitchDeg) || !Number.isFinite(yawDeg)) return AIM_DOWN;
  if (pitchDeg < 0 || pitchDeg > 180) return AIM_DOWN;

  const pitch = pitchDeg * DEG;
  // Yaw is taken modulo a turn rather than rejected: 360 and 0 are the same aim, and the DB's end-exclusive range exists to stop two rows LOOKING different.
  const yaw = (((yawDeg % 360) + 360) % 360) * DEG;

  const horizontal = Math.sin(pitch);
  return {
    x: horizontal * Math.sin(yaw),
    y: -Math.cos(pitch),
    z: -horizontal * Math.cos(yaw),
  };
}

// The renderer takes a tuple, the rest of the codebase passes Vec3 — one place to convert, so neither shape leaks.
export function aimTuple(direction: Vec3): [number, number, number] {
  return [direction.x, direction.y, direction.z];
}
