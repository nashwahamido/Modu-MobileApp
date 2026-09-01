import { strict as assert } from "node:assert";
import { test } from "node:test";

import { questions } from "./questionnaire";
import { avatarPath, introPath, optionPath, promptPath, VOICEOVER_BUCKET } from "./voiceAssets";
import { avatarModes } from "./avatarModes";

test("the intro is one clip at the onboarding root", () => {
  assert.equal(introPath(), "onboarding/Intro-hey.mp3");
});

test("prompts are one-based and nested under their own question folder", () => {
  assert.equal(promptPath(0), "onboarding/Q1/Q1.mp3");
  assert.equal(promptPath(4), "onboarding/Q5/Q5.mp3");
});

test("options are one-based on BOTH axes", () => {
  assert.equal(optionPath(0, 0), "onboarding/Q1/Q1-Opt1.mp3");
  assert.equal(optionPath(2, 1), "onboarding/Q3/Q3-Opt2.mp3");
  assert.equal(optionPath(4, 2), "onboarding/Q5/Q5-Opt3.mp3");
});

test("the bucket name is capitalised, as storage has it", () => {
  assert.equal(VOICEOVER_BUCKET, "Voiceover");
});

test("every question and answer in the questionnaire has a path, and they are all distinct", () => {
  const paths = [introPath()];
  questions.forEach((q, i) => {
    paths.push(promptPath(i));
    q.options.forEach((_, oi) => paths.push(optionPath(i, oi)));
  });
  assert.equal(paths.length, 21);
  assert.equal(new Set(paths).size, 21);
});
test("every companion on the recommendation screen has a clip path", () => {
  const paths = avatarModes.map((mode) => avatarPath(mode.avatarName));
  assert.deepEqual(paths, [
    "avatars/Lumi.mp3",
    "avatars/Sparky.mp3",
    "avatars/Pebble.mp3",
    "avatars/Felix.mp3",
  ]);
  assert.equal(new Set(paths).size, 4);
});

test("companion clips keep the capital the bucket has", () => {
  assert.equal(avatarPath("Lumi"), "avatars/Lumi.mp3");
  assert.notEqual(avatarPath("Lumi"), avatarPath("lumi"));
});