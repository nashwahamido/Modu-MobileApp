import assert from "node:assert/strict";
import test from "node:test";

import { avatarMotionPhase, TURN_IN_PLACE_THRESHOLD } from "./avatarMotion";

const situation = {
  editing: false,
  recovering: false,
  hasPath: false,
  turnError: 0,
  specialActive: false,
};

test("furniture editing and collision recovery force a safe idle", () => {
  assert.equal(avatarMotionPhase({ ...situation, editing: true, hasPath: true }), "idle");
  assert.equal(avatarMotionPhase({ ...situation, recovering: true, specialActive: true }), "idle");
});

test("a sharp route turn completes before walking starts", () => {
  assert.equal(
    avatarMotionPhase({ ...situation, hasPath: true, turnError: TURN_IN_PLACE_THRESHOLD + 0.01 }),
    "turning",
  );
  assert.equal(
    avatarMotionPhase({ ...situation, hasPath: true, turnError: TURN_IN_PLACE_THRESHOLD - 0.01 }),
    "walking",
  );
});

test("a one-shot action plays only when stopped and safe", () => {
  assert.equal(avatarMotionPhase({ ...situation, specialActive: true }), "special");
  assert.equal(
    avatarMotionPhase({ ...situation, hasPath: true, specialActive: true }),
    "walking",
  );
});
