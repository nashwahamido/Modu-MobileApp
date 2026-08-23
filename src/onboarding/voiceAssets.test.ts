import { strict as assert } from "node:assert";
import { test } from "node:test";

import { questions } from "./questionnaire";
import { avatarPath, introPath, optionPath, promptPath, VOICEOVER_BUCKET } from "./voiceAssets";
import { avatarModes } from "./avatarModes";

// These assertions are transcribed from the bucket listing. If a clip is ever renamed in storage,
// this file is what fails — rather than a voice button going quietly dead on a player's device.

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
  // Storage paths and bucket names are case-sensitive; this is transcribed, not tidied.
  assert.equal(VOICEOVER_BUCKET, "Voiceover");
});

test("every question and answer in the questionnaire has a path, and they are all distinct", () => {
  const paths = [introPath()];
  questions.forEach((q, i) => {
    paths.push(promptPath(i));
    q.options.forEach((_, oi) => paths.push(optionPath(i, oi)));
  });
  // 1 intro + 5 prompts + 15 options. If a question or an option is ever added, this number moves
  // and someone has to go and record the clip — which is the point of asserting it.
  assert.equal(paths.length, 21);
  assert.equal(new Set(paths).size, 21);
});
test("every companion on the recommendation screen has a clip path", () => {
  // Against avatarModes itself, not a copy of its names. The four clips are named for the four
  // companions exactly — a fifth mode added without a recording shows up here rather than as a
  // voice button that quietly reads the synthesised description instead.
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
  // "avatars/Lumi.mp3", never "avatars/lumi.mp3" — the folder is lowercase and the files are not,
  // which is exactly the sort of split a derived path gets wrong in one direction or the other.
  assert.equal(avatarPath("Lumi"), "avatars/Lumi.mp3");
  assert.notEqual(avatarPath("Lumi"), avatarPath("lumi"));
});