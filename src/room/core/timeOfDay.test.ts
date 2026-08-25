import assert from "node:assert/strict";
import test from "node:test";

import {
  TIME_OF_DAY,
  TIME_OF_DAY_IDS,
  WALL_FILL_DIRECTIONS,
  ceilingLightOn,
  poolLength,
  sunDirection,
  sunPreset,
} from "./timeOfDay";
import { wallAlpha } from "./wallCulling";
import { ORBIT } from "../input/orbit";

// THE invariant of this file. A sun outside the +x/-z quadrant enters through the two walls the resting camera stands outside of, which culling has faded away — the pool still lands but its window is not drawn, and it reads as light from nowhere. Every preset must stream in through walls the player can see.
test("every daylight preset enters through the walls the resting camera can see", () => {
  const theta = ORBIT.restTheta;
  // Sanity: the resting camera really does see x-min and z-max, and not the other two.
  assert.equal(wallAlpha("x-min", theta), 1);
  assert.equal(wallAlpha("z-max", theta), 1);
  assert.equal(wallAlpha("x-max", theta), 0);
  assert.equal(wallAlpha("z-min", theta), 0);

  for (const id of TIME_OF_DAY_IDS) {
    const { direction } = TIME_OF_DAY[id];
    if (!direction) continue; // night has no sun
    // Light enters a wall when it travels AGAINST that wall's outward normal.
    assert.ok(direction.x > 0, `${id}: must travel +x to enter x-min`);
    assert.ok(direction.z < 0, `${id}: must travel -z to enter z-max`);
    assert.ok(direction.y < 0, `${id}: the sun is above the room`);
  }
});

test("night has no sun but still lights the room", () => {
  const night = TIME_OF_DAY.night;
  assert.equal(night.direction, null);
  assert.equal(night.intensity, 0);
  // The room is the screen a player arranges furniture on; it must never go black.
  assert.ok(night.ambient > 0, "night still needs ambient or the room is unusable");
  assert.deepEqual(sunDirection(night), [0, -1, 0]);
  assert.equal(poolLength(night), 0);
});

test("pool length tracks elevation, and midday is the shortest of the day", () => {
  const lengths = Object.fromEntries(
    TIME_OF_DAY_IDS.filter((id) => TIME_OF_DAY[id].direction).map((id) => [id, poolLength(TIME_OF_DAY[id])]),
  );
  // A high sun drops a short patch at the sill; a low one rakes across the floor.
  assert.ok(lengths.midday < lengths.morning, "midday sun is the highest, so its pool is the shortest");
  assert.ok(lengths.sunset > lengths.afternoon, "sunset sits lower than afternoon");
  // Nothing may throw so far it crosses the whole 4.5 m room and defeats the point.
  for (const [id, len] of Object.entries(lengths)) {
    assert.ok(len < 8, `${id}: pool of ${len.toFixed(2)} m is implausibly long`);
  }
});

test("the day warms and dims from midday to sunset", () => {
  assert.ok(TIME_OF_DAY.sunset.kelvin < TIME_OF_DAY.afternoon.kelvin);
  assert.ok(TIME_OF_DAY.afternoon.kelvin < TIME_OF_DAY.midday.kelvin);
  assert.ok(TIME_OF_DAY.sunset.intensity < TIME_OF_DAY.midday.intensity);
  assert.ok(TIME_OF_DAY.sunset.ambient < TIME_OF_DAY.midday.ambient);
  // Sunset must stay the dimmest hour that still has a sun. "Dim enough that a lamp would start to matter" is the preset's identity, and it is the one this file is most likely to lose: a low raking sun looks better the harder you push it, right up to the point where sunset is just afternoon with an orange filter.
  assert.ok(
    TIME_OF_DAY.sunset.intensity < TIME_OF_DAY.afternoon.intensity,
    "sunset brighter than afternoon is not a sunset",
  );
});

test("an unknown id falls back rather than throwing", () => {
  assert.equal(sunPreset("nonsense" as never), TIME_OF_DAY.afternoon);
});

// The five values, pinned LITERALLY and deliberately not as `defaultOn === (backdrop === "night")`. That rule holds today, and asserting it would cement the exact coupling the separate field exists to avoid: the day an overcast preset wants its light on by default, that test fails and has to be deleted. A test you must delete to do the thing the design anticipated is a bad test.
test("the ceiling light is on by default exactly once it is dark outside", () => {
  assert.equal(TIME_OF_DAY.morning.interiorLight.defaultOn, false);
  assert.equal(TIME_OF_DAY.midday.interiorLight.defaultOn, false);
  assert.equal(TIME_OF_DAY.afternoon.interiorLight.defaultOn, false);
  assert.equal(TIME_OF_DAY.sunset.interiorLight.defaultOn, true);
  assert.equal(TIME_OF_DAY.night.interiorLight.defaultOn, true);
});

// Cheap guards against a fat-fingered zero. The kelvin range is the one item_lights already constrains bought lamps to (migration 012), reused here so the room's own light cannot be authored somewhere a purchasable one could not.
test("every hour's ceiling light is a usable bulb", () => {
  for (const id of TIME_OF_DAY_IDS) {
    const { lumens, kelvin } = TIME_OF_DAY[id].interiorLight;
    assert.ok(lumens > 0, `${id}: a light with no lumens is an off light, not a tuned one`);
    assert.ok(kelvin >= 1000 && kelvin <= 12000, `${id}: kelvin ${kelvin} is outside the range item_lights allows`);
  }
});

// The SHAPE of the ladder is the designed part, not the values: a light has to be brighter to register against midday's 135k lux sun than against a black room, and warmer after dark, where a cool bulb reads as clinical and a warm one as inviting.
test("the ceiling light brightens against the sun it competes with, and warms after dark", () => {
  assert.ok(
    TIME_OF_DAY.midday.interiorLight.lumens > TIME_OF_DAY.night.interiorLight.lumens,
    "midday must out-shout its own sun; night has none to out-shout",
  );
  assert.ok(
    TIME_OF_DAY.night.interiorLight.kelvin < TIME_OF_DAY.midday.interiorLight.kelvin,
    "a 2800 K bulb in daylight reads as a yellow stain rather than as a light",
  );
});

// The counter-fill burns at EVERY hour, unlike the sun — which makes it the one light that can quietly wreck a preset it was never tuned for. It ran at a constant 4000 lux / 6800 K until 2026-08-18, and at night (sun 0, ambient 200) that made it the second-largest contributor in the scene and by far its coldest: every warm bulb in the room was fighting it, and the BULB looked like the thing that was wrong. These assertions are what stop that returning.
test("the counter-fill stays cool, stays lit, and backs off after dark", () => {
  for (const id of TIME_OF_DAY_IDS) {
    const { counterFill, interiorLight } = TIME_OF_DAY[id];
    // Zeroing it is the tempting move for "make night warmer" and it is the wrong one: warm reads as warm only against something cool, so a flat-warm room is the same failure as a flat-cold one in a different hue.
    assert.ok(counterFill.intensity > 0, `${id}: a counter-fill at zero leaves the warmth nothing to read against`);
    assert.ok(
      counterFill.kelvin > interiorLight.kelvin,
      `${id}: a fill warmer than the bulb it counters has stopped being a counter-fill`,
    );
  }
  // Asserted only from afternoon onward, deliberately. Midday is the brightest hour and may one day want MORE cool fill than morning; an invariant that forbids a reasonable future edit is a nuisance rather than a guard.
  assert.ok(
    TIME_OF_DAY.sunset.counterFill.intensity < TIME_OF_DAY.afternoon.counterFill.intensity,
    "sunset is dimmer than afternoon, so its fill must be too",
  );
  assert.ok(
    TIME_OF_DAY.night.counterFill.intensity <= TIME_OF_DAY.sunset.counterFill.intensity,
    "night must never wash colder than sunset",
  );
});

// The SHAPE of the ladder, not the values. The test above pins night cooler than midday; this pins the rungs between, so a retune cannot leave sunset cooler than afternoon and call it warming.
test("the ceiling bulb warms monotonically as the day ends", () => {
  assert.ok(TIME_OF_DAY.afternoon.interiorLight.kelvin < TIME_OF_DAY.midday.interiorLight.kelvin);
  assert.ok(TIME_OF_DAY.sunset.interiorLight.kelvin < TIME_OF_DAY.afternoon.interiorLight.kelvin);
  assert.ok(TIME_OF_DAY.night.interiorLight.kelvin < TIME_OF_DAY.sunset.interiorLight.kelvin);
  // Warm-incandescent, near candlelight. Night is the hour this fitting exists for, and a bulb that is merely warmish there reads as clinical.
  assert.ok(TIME_OF_DAY.night.interiorLight.kelvin <= 2_500, "night must be genuinely warm, not merely warmish");
});

// Warming a bulb COSTS apparent brightness — amber reads as dimmer than neutral white at equal lumens — so the two dark hours have to carry enough output to pay for their own warmth. These are floors against a future retune that warms them further without paying the bill, which is how "atmospheric" quietly becomes "cannot see the furniture".
test("the hours that default the light ON are bright enough to justify it", () => {
  for (const id of ["sunset", "night"] as const) {
    const { defaultOn, lumens } = TIME_OF_DAY[id].interiorLight;
    assert.equal(defaultOn, true, `${id}: this test is about the hours the light comes on by itself`);
    assert.ok(lumens >= 150_000, `${id}: ${lumens} lm cannot carry a room whose ambient probe is deliberately starved`);
  }
});

// The wall fill's whole value is in HOW it is aimed, and both halves of that are easy to lose in a retune that only looks at intensities. Every wall inner face must be reached by exactly one of the pair — one light, or two on the same side, leaves black walls and is the problem this rig exists to fix — and the pair must stay near-horizontal, because a fill tilted down at the floor is an ambient probe by another name and washes out the sun pool the presets are built around.
test("the wall fill reaches every wall exactly once, and lands on walls rather than the floor", () => {
  // A wall's inner face normal points INTO the room, and a directional lights a surface only when it travels against that normal.
  const walls = { "x-min": [1, 0, 0], "x-max": [-1, 0, 0], "z-min": [0, 0, 1], "z-max": [0, 0, -1] } as const;
  for (const [wall, n] of Object.entries(walls)) {
    const lit = WALL_FILL_DIRECTIONS.filter((d) => d[0] * n[0] + d[1] * n[1] + d[2] * n[2] < 0);
    assert.equal(lit.length, 1, `${wall}: lit by ${lit.length} of the pair — the fill must be even across all four`);
  }
  for (const d of WALL_FILL_DIRECTIONS) {
    const horizontal = Math.hypot(d[0], d[2]);
    assert.ok(Math.abs(d[1]) < horizontal / 2, `${d.join()}: too steep — this is a wall fill, not a second ambient`);
    // Not perfectly flat either: a horizontal fill grazes the wall bottoms and leaves a dark seam at the floor line.
    assert.ok(d[1] < 0, `${d.join()}: must tilt slightly down`);
  }
});

// The ladder, not the numbers. The fill exists for the two hours the walls read darkest — full sun, where the eye adapts to the floor pool, and after dark, where the probe is deliberately starved — but the DARK hours must stay dark: a night fill that rivals its daylight setting has turned the hour back into an overcast afternoon, which is the failure the ambient probe already recorded once.
test("the wall fill is strongest in full sun and stays modest after dark", () => {
  for (const id of TIME_OF_DAY_IDS) {
    const { wallFill, interiorLight } = TIME_OF_DAY[id];
    assert.ok(wallFill.intensity >= 0, `${id}: intensity cannot be negative`);
    assert.ok(
      wallFill.kelvin >= 1000 && wallFill.kelvin <= 12000,
      `${id}: kelvin ${wallFill.kelvin} is outside any usable range`,
    );
    // It fills what the sun cannot reach; it is not there to be noticed as its own light, and the sun and the bulb must both out-shout it.
    assert.ok(
      TIME_OF_DAY[id].intensity === 0 || wallFill.intensity < TIME_OF_DAY[id].intensity,
      `${id}: a fill brighter than its own sun is a sun`,
    );
    assert.ok(interiorLight.lumens > 0, `${id}: unchanged precondition — every hour authors a bulb`);
  }
  assert.ok(TIME_OF_DAY.midday.wallFill.intensity > TIME_OF_DAY.morning.wallFill.intensity);
  assert.ok(TIME_OF_DAY.sunset.wallFill.intensity < TIME_OF_DAY.afternoon.wallFill.intensity);
  assert.ok(TIME_OF_DAY.night.wallFill.intensity <= TIME_OF_DAY.sunset.wallFill.intensity);
  assert.ok(
    TIME_OF_DAY.night.wallFill.intensity < TIME_OF_DAY.midday.wallFill.intensity / 4,
    "a night fill anywhere near the daylight one is an overcast afternoon, not a night",
  );
  // Warm after dark, cool in daylight — same reason the bulb is: a 5000 K fill at night reads as moonlight through the walls.
  assert.ok(TIME_OF_DAY.night.wallFill.kelvin < TIME_OF_DAY.midday.wallFill.kelvin);
});

test("the switch defaults to the hour, and an override only counts at the hour it was made", () => {
  assert.equal(ceilingLightOn("night", null), true);
  assert.equal(ceilingLightOn("midday", null), false);
  // Same hour: the player wins, in both directions.
  assert.equal(ceilingLightOn("night", { hour: "night", on: false }), false);
  assert.equal(ceilingLightOn("midday", { hour: "midday", on: true }), true);
  // Different hour: the override is stale and the new hour's default takes over. THIS IS THE RESET, and the point of stamping the override with its hour is that the reset is a derivation and never an effect — there is no frame where the light is wrong.
  assert.equal(ceilingLightOn("night", { hour: "midday", on: false }), true);
  assert.equal(ceilingLightOn("midday", { hour: "night", on: true }), false);
});
