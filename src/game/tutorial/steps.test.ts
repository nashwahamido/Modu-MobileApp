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

test("every profile learns Focus on the chip, not in the settings panel", () => {
  // The in-build panel no longer carries a Focus row, so hud-focus is the ONLY place it is taught —
  // and ToggleChips renders for everyone, so every profile has to get that step.
  for (const profile of ["control", "visual", "momentum", "clearPath"] as const) {
    const ids = tutorialStepsFor(context(profile, profile === "control")).map(
      (step) => step.id,
    );
    assert.ok(ids.includes("hud-focus"), `${profile} should learn Focus`);
    assert.equal(ids.includes("focus-mode-settings"), false);
  }
});

test("every profile keeps the Settings walkthrough short and contextual", () => {
  for (const profile of ["control", "visual", "momentum", "clearPath"] as const) {
    const steps = tutorialStepsFor(context(profile, profile === "control"));
    const settingsSteps = steps.filter((step) => step.targetId === "settings");

    // Background is the one settings step EVERY profile gets — the others are gated on mode or filtered out for Control/Momentum, so without it Control would open the panel with nothing to teach.
    assert.ok(settingsSteps.some((step) => step.id === "background-settings"));
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
  }
});
