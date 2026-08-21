import assert from "node:assert/strict";
import test from "node:test";

import {
  avatarMotionPhase,
  chooseDistinctSpecialAction,
  POST_PATH_STANDING_MS,
  TURN_IN_PLACE_THRESHOLD,
} from "./avatarMotion";

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

test("a character stands for at least five seconds after completing a path", () => {
  assert.equal(POST_PATH_STANDING_MS, 5_000);
});

test("the next one-shot action differs from the previous action", () => {
  const actions = [
    { index: 1, duration: 2 },
    { index: 3, duration: 3 },
    { index: 5, duration: 4 },
  ] as const;

  assert.deepEqual(chooseDistinctSpecialAction(actions, 3, 0), actions[0]);
  assert.deepEqual(chooseDistinctSpecialAction(actions, 3, 0.99), actions[2]);
  assert.equal(chooseDistinctSpecialAction([actions[0]], 1, 0.5), null);
});
