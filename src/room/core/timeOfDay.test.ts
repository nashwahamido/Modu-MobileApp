import assert from "node:assert/strict";
import test from "node:test";

import { TIME_OF_DAY, TIME_OF_DAY_IDS, poolLength, sunDirection, sunPreset } from "./timeOfDay";
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
  assert.ok(lengths.evening > lengths.afternoon, "evening sits lower than afternoon");
  // Nothing may throw so far it crosses the whole 4.5 m room and defeats the point.
  for (const [id, len] of Object.entries(lengths)) {
    assert.ok(len < 8, `${id}: pool of ${len.toFixed(2)} m is implausibly long`);
  }
});

test("the day warms and dims from midday to evening", () => {
  assert.ok(TIME_OF_DAY.evening.kelvin < TIME_OF_DAY.afternoon.kelvin);
  assert.ok(TIME_OF_DAY.afternoon.kelvin < TIME_OF_DAY.midday.kelvin);
  assert.ok(TIME_OF_DAY.evening.intensity < TIME_OF_DAY.midday.intensity);
  assert.ok(TIME_OF_DAY.evening.ambient < TIME_OF_DAY.midday.ambient);
});

test("an unknown id falls back rather than throwing", () => {
  assert.equal(sunPreset("nonsense" as never), TIME_OF_DAY.afternoon);
});
