import assert from "node:assert/strict";
import test from "node:test";

import { tutorialStepsFor, type TutorialContext } from "./steps";

function context(
  profile: TutorialContext["profile"],
  manualTools: boolean,
): TutorialContext {
  return {
    profile,
    mode: profile === "control" ? "free" : "guide",
    manualTools,
    softHints: true,
  };
}

test("no profile teaches a tool step", () => {
  // LACK's bolt is hand-tightened, so there is no toolbox step to teach. This asserts the ABSENCE
  // rather than being deleted, because the step was Control-only and a regression would show up on
  // exactly one profile.
  for (const profile of ["control", "visual", "momentum", "clearPath"] as const) {
    const ids = tutorialStepsFor(context(profile, profile === "control")).map(
      (step) => step.id,
    );
    assert.equal(ids.includes("select-allen-key"), false);
  }
});

test("Control teaches its user-directed HUD controls", () => {
  const steps = tutorialStepsFor(context("control", true));
  const ids = steps.map(
    (step) => step.id,
  );

  for (const id of [
    "hud-recenter",
    "control-hint",
    "hud-undo",
    "hud-focus",
    "hud-spot",
  ]) {
    assert.ok(ids.includes(id), `${id} should be included`);
  }

  assert.equal(ids.includes("hud-redo"), false);
  assert.ok(
    ids.indexOf("control-hint") > ids.indexOf("tighten-connector"),
    "Hint should be introduced only after the player has assembled something",
  );
  assert.ok(
    ids.indexOf("control-hint") < ids.indexOf("install-four-legs"),
    "Hint should remain available before the repeated assembly work",
  );
});

test("Momentum teaches shared HUD controls without Hint or the toolbox", () => {
  const ids = tutorialStepsFor(context("momentum", false)).map(
    (step) => step.id,
  );

  for (const id of [
    "hud-recenter",
    "hud-undo",
    "hud-focus",
    "hud-spot",
  ]) {
    assert.ok(ids.includes(id), `${id} should be included`);
  }
  assert.equal(ids.includes("control-hint"), false);
  assert.equal(ids.includes("hud-redo"), false);
  assert.equal(ids.includes("select-allen-key"), false);
});

test("every profile keeps the Settings walkthrough short and contextual", () => {
  for (const profile of ["control", "visual", "momentum", "clearPath"] as const) {
    const steps = tutorialStepsFor(context(profile, profile === "control"));
    const settingsSteps = steps.filter((step) => step.targetId === "settings");

    assert.ok(settingsSteps.some((step) => step.id === "release-behavior-settings"));
    assert.ok(
      steps.indexOf(settingsSteps[0]) > steps.findIndex((step) => step.id === "drag-and-snap"),
    );
    assert.ok(
      steps.indexOf(settingsSteps.at(-1)!) <
        steps.findIndex((step) => step.id === "view-under-table"),
    );
    assert.equal(
      settingsSteps.some((step) => step.id === "focus-mode-settings"),
      false,
    );
    assert.equal(
      settingsSteps.some((step) => step.id === "auto-view-settings"),
      false,
    );
  }
});
