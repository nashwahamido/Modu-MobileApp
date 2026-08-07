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

test("only Control teaches the toolbox", () => {
  const controlIds = tutorialStepsFor(context("control", true)).map(
    (step) => step.id,
  );
  assert.ok(controlIds.includes("select-allen-key"));

  for (const profile of ["visual", "momentum", "clearPath"] as const) {
    const ids = tutorialStepsFor(context(profile, false)).map(
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
    "hud-redo",
    "hud-focus",
    "hud-auto-view",
  ]) {
    assert.ok(ids.includes(id), `${id} should be included`);
  }

  const firstHudIndex = ids.indexOf("hud-recenter");
  assert.deepEqual(
    ids.slice(firstHudIndex, firstHudIndex + 6),
    [
      "hud-recenter",
      "hud-undo",
      "hud-redo",
      "control-hint",
      "hud-focus",
      "hud-auto-view",
    ],
  );
});

test("Momentum teaches shared HUD controls without Hint or the toolbox", () => {
  const ids = tutorialStepsFor(context("momentum", false)).map(
    (step) => step.id,
  );

  for (const id of [
    "hud-recenter",
    "hud-undo",
    "hud-redo",
    "hud-focus",
    "hud-auto-view",
  ]) {
    assert.ok(ids.includes(id), `${id} should be included`);
  }
  assert.equal(ids.includes("control-hint"), false);
  assert.equal(ids.includes("select-allen-key"), false);
});

test("every profile teaches preferences through the real Settings panel", () => {
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
    if (profile !== "control" && profile !== "momentum") {
      assert.ok(settingsSteps.some((step) => step.id === "focus-mode-settings"));
      assert.ok(settingsSteps.some((step) => step.id === "auto-view-settings"));
    }
  }
});
