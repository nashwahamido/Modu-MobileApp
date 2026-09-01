import assert from "node:assert/strict";
import test from "node:test";

import {
  GRIP_STEP_ID,
  SECONDARY_TARGET_BY_STEP,
  SHARED_HUD_TUTORIAL_STEPS,
  settingsTutorialStepsFor,
  tutorialStepsFor,
  type TutorialContext,
} from "./steps";

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

test("the grip step is dropped on a tablet and kept on a phone", () => {
  for (const profile of ["control", "visual", "momentum", "clearPath"] as const) {
    const phone = context(profile, profile === "control");
    assert.equal(
      tutorialStepsFor(phone).some((step) => step.id === GRIP_STEP_ID),
      true,
      `${profile} should open with the grip step on a phone`,
    );
    const tablet = tutorialStepsFor({ ...phone, tablet: true });
    assert.equal(
      tablet.some((step) => step.id === GRIP_STEP_ID),
      false,
      `${profile} should not teach a two-handed grip on a tablet`,
    );
    assert.deepEqual(
      tablet.map((step) => step.id),
      tutorialStepsFor(phone)
        .map((step) => step.id)
        .filter((id) => id !== GRIP_STEP_ID),
    );
  }
});

test("no profile teaches a tool step", () => {
  for (const profile of ["control", "visual", "momentum", "clearPath"] as const) {
    const ids = tutorialStepsFor(context(profile, profile === "control")).map(
      (step) => step.id,
    );
    assert.equal(ids.includes("select-allen-key"), false);
  }
});

test("Felix's own run is the ten steps in order, with the last one uncounted", () => {
  const steps = tutorialStepsFor(context("control", true));

  assert.deepEqual(
    steps.map((step) => step.id),
    [
      "hold-like-controller",
      "long-press-part",
      "visual-settings",
      "visual-undo-recenter",
      "hud-focus",
      "hud-stuck-help",
      "view-under-table",
      "place-connector",
      "tighten-connector",
      "control-hint",
      "install-four-legs",
    ],
  );

  for (const id of ["drag-and-snap", "hud-recenter", "hud-undo", "hud-spot"]) {
    assert.equal(steps.some((step) => step.id === id), false, `${id} should be gone`);
  }

  assert.equal(
    steps.find((step) => step.id === "long-press-part")?.event,
    "part_snapped",
  );
  assert.equal(
    steps.find((step) => step.id === "view-under-table")?.event,
    "joystick_moved",
  );

  const settingsSteps = steps.filter((step) => step.targetId === "settings");
  assert.equal(settingsSteps.length, 1);
  assert.equal(settingsSteps[0]?.event, "settings_browsed");

  const at = (id: string) => steps.findIndex((step) => step.id === id);
  assert.ok(at("control-hint") > at("tighten-connector"));
  assert.ok(at("control-hint") < at("install-four-legs"));
  assert.equal(steps.find((step) => step.id === "control-hint")?.targetId, "hint");

  const unnumbered = steps.filter((step) => step.unnumbered);
  assert.deepEqual(
    unnumbered.map((step) => step.id),
    ["install-four-legs"],
  );
  assert.equal(steps.at(-1)?.unnumbered, true);

  for (const step of steps) {
    assert.ok(step.event, `${step.id} has no event to wait on`);
    assert.ok(step.targetId, `${step.id} has nothing to highlight`);
  }
});

test("the HUD stuck-help step is shared by Felix and Sparky, and is not Lumi's", () => {
  const controlIds = tutorialStepsFor(context("control", true)).map((s) => s.id);
  const visualIds = tutorialStepsFor(context("visual", false)).map((s) => s.id);
  assert.ok(controlIds.includes("hud-stuck-help"));
  assert.equal(controlIds.includes("visual-stuck-help"), false);
  assert.ok(visualIds.includes("visual-stuck-help"));
  assert.equal(visualIds.includes("hud-stuck-help"), false);

  assert.equal(SECONDARY_TARGET_BY_STEP["hud-stuck-help"], "auto");
  assert.equal(SECONDARY_TARGET_BY_STEP["visual-stuck-help"], "auto");
});

test("Sparky's own run is the nine steps in order, and keeps its counter to the end", () => {
  const steps = tutorialStepsFor(context("momentum", false));

  assert.deepEqual(
    steps.map((step) => step.id),
    [
      "hold-like-controller",
      "long-press-part",
      "visual-settings",
      "visual-undo-recenter",
      "hud-focus",
      "hud-stuck-help",
      "view-under-table",
      "place-connector",
      "tighten-connector",
      "install-four-legs",
    ],
  );

  for (const id of [
    "drag-and-snap",
    "background-settings",
    "guided-instructions-settings",
    "hud-recenter",
    "hud-undo",
    "hud-spot",
  ]) {
    assert.equal(steps.some((step) => step.id === id), false, `${id} should be gone`);
  }

  assert.equal(steps.some((step) => step.id === "control-hint"), false);
  assert.equal(steps.some((step) => step.id === "select-allen-key"), false);

  assert.equal(
    steps.find((step) => step.id === "long-press-part")?.event,
    "part_snapped",
  );
  assert.equal(
    steps.find((step) => step.id === "view-under-table")?.event,
    "joystick_moved",
  );

  const settingsSteps = steps.filter((step) => step.targetId === "settings");
  assert.equal(settingsSteps.length, 1);
  assert.equal(settingsSteps[0]?.event, "settings_browsed");

  assert.equal(steps.some((step) => step.unnumbered), false);

  for (const step of steps) {
    assert.ok(step.event, `${step.id} has no event to wait on`);
    assert.ok(step.targetId, `${step.id} has nothing to highlight`);
  }
});

test("every profile learns Focus on the chip, not in the settings panel", () => {
  for (const profile of ["control", "visual", "momentum", "clearPath"] as const) {
    const ids = tutorialStepsFor(context(profile, profile === "control")).map(
      (step) => step.id,
    );
    assert.ok(ids.includes("hud-focus"), `${profile} should learn Focus`);
    assert.equal(ids.includes("focus-mode-settings"), false);
  }
});

test("nothing composes any more, and no run gets a second Settings walkthrough", () => {
  for (const profile of ["control", "visual", "momentum", "clearPath"] as const) {
    const steps = tutorialStepsFor(context(profile, profile === "control"));
    const settingsSteps = steps.filter((step) => step.targetId === "settings");
    assert.equal(settingsSteps.length, 1, `${profile} should teach Settings exactly once`);
    assert.equal(settingsSteps[0]?.event, "settings_browsed", `${profile} should browse, not change`);
    assert.deepEqual(
      settingsTutorialStepsFor(context(profile, profile === "control")),
      [],
      `${profile} should not run a second Settings walkthrough after the build`,
    );
  }
});

test("Pebble's own run is the nine steps in order, and teaches Settings exactly once", () => {
  const steps = tutorialStepsFor(context("clearPath", false));

  assert.deepEqual(
    steps.map((step) => step.id),
    [
      "hold-like-controller",
      "long-press-part",
      "visual-settings",
      "hud-focus",
      "view-under-table",
      "visual-undo-recenter",
      "visual-stuck-help",
      "place-connector",
      "tighten-connector",
      "install-four-legs",
    ],
  );

  assert.equal(
    steps.find((step) => step.id === "long-press-part")?.event,
    "part_snapped",
  );
  assert.equal(
    steps.some((step) => step.id === "drag-and-snap"),
    false,
  );

  const settingsSteps = steps.filter((step) => step.targetId === "settings");
  assert.equal(settingsSteps.length, 1);
  assert.equal(settingsSteps[0]?.event, "settings_browsed");
  assert.deepEqual(settingsTutorialStepsFor(context("clearPath", false)), []);

  const focusStep = steps.find((step) => step.id === "hud-focus");
  const sharedFocus = SHARED_HUD_TUTORIAL_STEPS.find(
    (step) => step.id === "hud-focus",
  );
  assert.ok(focusStep && sharedFocus);
  assert.notEqual(focusStep.message, sharedFocus.message);

  const at = (id: string) => steps.findIndex((step) => step.id === id);
  assert.ok(at("visual-undo-recenter") < at("place-connector"));
  assert.ok(at("visual-stuck-help") < at("place-connector"));

  assert.equal(
    steps.find((step) => step.id === "view-under-table")?.event,
    "joystick_moved",
  );
  for (const profile of ["visual"] as const) {
    assert.equal(
      tutorialStepsFor(context(profile, false)).find(
        (step) => step.id === "view-under-table",
      )?.event,
      "underside_view_reached",
      `${profile} should still have to reach the underside`,
    );
  }

  for (const step of steps) {
    assert.ok(step.event, `${step.id} has no event to wait on`);
    assert.ok(step.targetId, `${step.id} has nothing to highlight`);
  }
});

test("the stuck-help step rings a second control, and it is one a step list actually contains", () => {
  const allIds = new Set(
    (["control", "visual", "momentum", "clearPath"] as const).flatMap((profile) =>
      tutorialStepsFor(context(profile, profile === "control")).map((step) => step.id),
    ),
  );
  for (const stepId of Object.keys(SECONDARY_TARGET_BY_STEP)) {
    assert.ok(allIds.has(stepId), `${stepId} is not in any profile's run`);
  }

  assert.equal(SECONDARY_TARGET_BY_STEP["visual-stuck-help"], "auto");
  for (const profile of ["visual", "clearPath"] as const) {
    const stuckStep = tutorialStepsFor(context(profile, false)).find(
      (step) => step.id === "visual-stuck-help",
    );
    assert.ok(stuckStep, `${profile} should teach the stuck-help step`);
    assert.equal(stuckStep.targetId, "spot");
  }
});

test("Lumi's own run teaches Settings in the same place, and gates every step on a real action", () => {
  const steps = tutorialStepsFor(context("visual", false));

  const at = (id: string) => steps.findIndex((step) => step.id === id);
  assert.ok(at("visual-settings") > at("visual-pickup-and-place"));
  assert.ok(at("visual-settings") < at("view-under-table"));

  for (const step of steps) {
    assert.ok(step.event, `${step.id} has no event to wait on`);
    assert.ok(step.targetId, `${step.id} has nothing to highlight`);
  }

  for (const step of steps.filter((s) => s.id !== "hold-like-controller")) {
    assert.equal(step.shortLabel, undefined, `${step.id} would show its shortLabel instead`);
  }
  assert.equal(
    steps.find((s) => s.id === "hold-like-controller")?.shortLabel,
    "Get comfortable",
  );
});