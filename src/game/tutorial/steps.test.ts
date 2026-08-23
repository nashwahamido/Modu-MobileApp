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

test("every composed profile keeps the Settings walkthrough short and contextual", () => {
  // Visual is EXCLUDED because it no longer goes through this composition: Lumi runs
  // VISUAL_TUTORIAL_STEPS, a hand-written list whose Settings step is one merged step
  // ("visual-settings") rather than the background/instructions pair the others get. Its ordering is
  // asserted separately below, against the list itself.
  for (const profile of ["control", "momentum", "clearPath"] as const) {
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

test("Lumi's own run teaches Settings in the same place, and gates every step on a real action", () => {
  const steps = tutorialStepsFor(context("visual", false));

  // Settings sits after the part is placed and before the joystick step — the same contract the
  // composed profiles are held to above, checked here against Lumi's merged ids.
  const at = (id: string) => steps.findIndex((step) => step.id === id);
  assert.ok(at("visual-settings") > at("visual-pickup-and-place"));
  assert.ok(at("visual-settings") < at("view-under-table"));

  // The point of a tutorial: no step advances without the player doing something, and every step
  // has something on screen to ring. A step with neither is a card you tap past.
  for (const step of steps) {
    assert.ok(step.event, `${step.id} has no event to wait on`);
    assert.ok(step.targetId, `${step.id} has nothing to highlight`);
  }

  // No shortLabel on any step the player READS in the bubble: the visual profile renders it in
  // preference to `message`, so one there would silently replace the authored sentence with a stub.
  //
  // The grip step is exempt, and is the reason this is a filter rather than a blanket assertion —
  // its bubble copy comes from GripCoach, so its own `message` is never shown and the label is what
  // names it ("Get comfortable").
  for (const step of steps.filter((s) => s.id !== "hold-like-controller")) {
    assert.equal(step.shortLabel, undefined, `${step.id} would show its shortLabel instead`);
  }
  assert.equal(
    steps.find((s) => s.id === "hold-like-controller")?.shortLabel,
    "Get comfortable",
  );
});