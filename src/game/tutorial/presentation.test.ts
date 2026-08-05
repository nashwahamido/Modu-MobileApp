import assert from "node:assert/strict";
import test from "node:test";

import { tutorialPresentationForProfile } from "./presentation";

test("Clear Path enables structured tutorial presentation", () => {
  const presentation = tutorialPresentationForProfile("clearPath");

  assert.equal(presentation.showChecklist, true);
  assert.equal(presentation.showMilestoneConfirmation, true);
  assert.equal(presentation.emphasizeTarget, true);
});

test("Control keeps tutorial presentation minimal", () => {
  const presentation = tutorialPresentationForProfile("control");

  assert.equal(presentation.showChecklist, false);
  assert.equal(presentation.showMilestoneConfirmation, false);
  assert.equal(presentation.emphasizeTarget, false);
  assert.equal(presentation.showVisualDemo, false);
  assert.equal(presentation.reducedText, false);
});

test("Visual mode uses demonstrations and reduced text", () => {
  const presentation = tutorialPresentationForProfile("visual");

  assert.equal(presentation.emphasizeTarget, true);
  assert.equal(presentation.showVisualDemo, true);
  assert.equal(presentation.reducedText, true);
  assert.equal(presentation.showChecklist, false);
});
