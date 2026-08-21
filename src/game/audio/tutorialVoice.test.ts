import { strict as assert } from "node:assert";
import { test } from "node:test";

import { recordedTutorialStepIds, tutorialVoicePath } from "./tutorialVoice";
import { VISUAL_TUTORIAL_STEPS } from "@/src/game/tutorial/steps";

// The grip step is presented by GripCoach's own card and has never been spoken — there is no step0
// clip in the bucket, and the overlay passes undefined rather than its id.
const GRIP_STEP_ID = "hold-like-controller";

test("every spoken step of Lumi's run has a clip", () => {
  // Against the REAL list, not a copy of it. A step added to VISUAL_TUTORIAL_STEPS without a
  // recording is the failure this exists to catch: it would not throw, it would simply drop to
  // synthesis on one step of the run built around being read to, which nobody would notice from
  // the code.
  const missing = VISUAL_TUTORIAL_STEPS.filter(
    (step) => step.id !== GRIP_STEP_ID && tutorialVoicePath(step.id) === null,
  ).map((step) => step.id);

  assert.deepEqual(missing, [], `no recorded clip for: ${missing.join(", ")}`);
});

test("the table names no step the run does not have", () => {
  // The other direction, and the one a rename breaks. Renaming a step id leaves the old key sitting
  // here matching nothing — the clip goes unplayed and the step silently falls back, which looks
  // exactly like a storage problem from the device.
  const stepIds = new Set(VISUAL_TUTORIAL_STEPS.map((step) => step.id));
  const orphans = recordedTutorialStepIds().filter((id) => !stepIds.has(id));

  assert.deepEqual(orphans, [], `clip mapped to unknown step: ${orphans.join(", ")}`);
});

test("the grip step is silent, not merely unmapped", () => {
  // Pinned rather than left implicit: it is the one step where null is the ANSWER and not a gap, so
  // a future pass that "fills in the missing clip" has to argue with this test first.
  assert.equal(tutorialVoicePath(GRIP_STEP_ID), null);
  assert.ok(VISUAL_TUTORIAL_STEPS.some((step) => step.id === GRIP_STEP_ID));
});

test("clip paths are the names uploaded to storage", () => {
  // Verified against the bucket on 2026-08-21. Transcribed, not derived: the file names describe the
  // action a step teaches while the ids describe the step, and nothing connects the two vocabularies
  // except this table. Capital L in Lumi-tutorial — storage is case-sensitive.
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
  // Lumi-tutorial is the visual run only. hud-recenter and hud-undo belong to Control and Momentum,
  // and asking for them here must be null rather than a guessed path into a folder that has none.
  assert.equal(tutorialVoicePath("hud-recenter"), null);
  assert.equal(tutorialVoicePath("hud-undo"), null);
  assert.equal(tutorialVoicePath("background-settings"), null);
});

test("an absent step id is null, not a malformed path", () => {
  assert.equal(tutorialVoicePath(undefined), null);
  assert.equal(tutorialVoicePath(""), null);
  assert.equal(tutorialVoicePath("no-such-step"), null);
});