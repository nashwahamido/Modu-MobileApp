import assert from "node:assert/strict";
import test from "node:test";

import { TIME_OF_DAY, TIME_OF_DAY_IDS, ceilingLightOn, poolLength, sunDirection, sunPreset } from "./timeOfDay";
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
