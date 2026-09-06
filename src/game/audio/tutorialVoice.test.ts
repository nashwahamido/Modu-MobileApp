import { strict as assert } from "node:assert";
import { test } from "node:test";

import { recordedTutorialStepIds, tutorialVoicePath } from "./tutorialVoice";
import { VISUAL_TUTORIAL_STEPS } from "@/src/game/tutorial/steps";

const GRIP_STEP_ID = "hold-like-controller";

test("every spoken step of Lumi's run has a clip", () => {
  const missing = VISUAL_TUTORIAL_STEPS.filter(
    (step) => step.id !== GRIP_STEP_ID && tutorialVoicePath(step.id) === null,
  ).map((step) => step.id);

  assert.deepEqual(missing, [], `no recorded clip for: ${missing.join(", ")}`);
});

test("the table names no step the run does not have", () => {
  const stepIds = new Set(VISUAL_TUTORIAL_STEPS.map((step) => step.id));
  const orphans = recordedTutorialStepIds().filter((id) => !stepIds.has(id));

  assert.deepEqual(orphans, [], `clip mapped to unknown step: ${orphans.join(", ")}`);
});

test("the grip step is silent, not merely unmapped", () => {
  assert.equal(tutorialVoicePath(GRIP_STEP_ID), null);
  assert.ok(VISUAL_TUTORIAL_STEPS.some((step) => step.id === GRIP_STEP_ID));
});

test("clip paths are the names uploaded to storage", () => {
  assert.equal(
    tutorialVoicePath("visual-pickup-and-place"),
    "Lumi-tutorial/step1-long-press.mp3",
  );
  assert.equal(tutorialVoicePath("visual-settings"), "Lumi-tutorial/step2-settings.mp3");
  assert.equal(tutorialVoicePath("hud-focus"), "Lumi-tutorial/step3-focus.mp3");
  assert.equal(tutorialVoicePath("view-under-table"), "Lumi-tutorial/step4-joystick.mp3");
  assert.equal(tutorialVoicePath("place-connector"), "Lumi-tutorial/step5-bolt.mp3");
  assert.equal(
    tutorialVoicePath("tighten-connector"),
    "Lumi-tutorial/step6-turn-clockwise.mp3",
  );
  assert.equal(
    tutorialVoicePath("visual-undo-recenter"),
    "Lumi-tutorial/step7-undo-and-recenter.mp3",
  );
  assert.equal(
    tutorialVoicePath("visual-stuck-help"),
    "Lumi-tutorial/step8-spot-and-auto.mp3",
  );
  assert.equal(tutorialVoicePath("install-four-legs"), "Lumi-tutorial/step9-continue.mp3");
});

test("a step from another profile's run has no Lumi clip", () => {
  assert.equal(tutorialVoicePath("hud-recenter"), null);
  assert.equal(tutorialVoicePath("hud-undo"), null);
  assert.equal(tutorialVoicePath("background-settings"), null);
});

test("an absent step id is null, not a malformed path", () => {
  assert.equal(tutorialVoicePath(undefined), null);
  assert.equal(tutorialVoicePath(""), null);
  assert.equal(tutorialVoicePath("no-such-step"), null);
});