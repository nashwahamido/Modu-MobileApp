import assert from "node:assert/strict";
import test from "node:test";

import {
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

  // The steps that used to demand a press and now explain instead. `hud-undo` in particular asked
  // the player to undo work they had just done correctly.
  for (const id of ["drag-and-snap", "hud-recenter", "hud-undo", "hud-spot"]) {
    assert.equal(steps.some((step) => step.id === id), false, `${id} should be gone`);
  }

  // Merged opening and one-rotation joystick, same as Pebble's run.
  assert.equal(
    steps.find((step) => step.id === "long-press-part")?.event,
    "part_snapped",
  );
  assert.equal(
    steps.find((step) => step.id === "view-under-table")?.event,
    "joystick_moved",
  );

  // ONE settings step, and it browses rather than demanding a backdrop change.
  const settingsSteps = steps.filter((step) => step.targetId === "settings");
  assert.equal(settingsSteps.length, 1);
  assert.equal(settingsSteps[0]?.event, "settings_browsed");

  // Hint is still Control's own affordance and still lands after the first full bolt-and-tighten —
  // the earliest moment the player has been stuck at something real.
  const at = (id: string) => steps.findIndex((step) => step.id === id);
  assert.ok(at("control-hint") > at("tighten-connector"));
  assert.ok(at("control-hint") < at("install-four-legs"));
  assert.equal(steps.find((step) => step.id === "control-hint")?.targetId, "hint");

  // The last step is out of the counter, and it is the ONLY one — the numbering in
  // MascotGuideOverlay treats `unnumbered` as a trailing flag, so one in the middle would misnumber
  // everything after it.
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
  // tutorial.tsx puts the "Tap Focus again to return to the tutorial" prompt on `hud-stuck-help`
  // and `hud-spot`. Lumi's `visual-stuck-help` is deliberately excluded — she toggles focus on and
  // stays there, which her remaining steps all survive. Sharing one id would have handed her a
  // prompt nobody asked for, so this pins that the two runs use different ids for the same card.
  const controlIds = tutorialStepsFor(context("control", true)).map((s) => s.id);
  const visualIds = tutorialStepsFor(context("visual", false)).map((s) => s.id);
  assert.ok(controlIds.includes("hud-stuck-help"));
  assert.equal(controlIds.includes("visual-stuck-help"), false);
  assert.ok(visualIds.includes("visual-stuck-help"));
  assert.equal(visualIds.includes("hud-stuck-help"), false);

  // Both still ring Auto as their second control.
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

  // The steps that used to demand a press, and the second settings card behind the first.
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

  // No Hint step: the "?" button is gated on free mode and momentum pins guide, so a step ringing it
  // would point at nothing on screen.
  assert.equal(steps.some((step) => step.id === "control-hint"), false);
  assert.equal(steps.some((step) => step.id === "select-allen-key"), false);

  // Merged opening and one-rotation joystick, as in the other hand-written runs.
  assert.equal(
    steps.find((step) => step.id === "long-press-part")?.event,
    "part_snapped",
  );
  assert.equal(
    steps.find((step) => step.id === "view-under-table")?.event,
    "joystick_moved",
  );

  // ONE settings step, and it browses.
  const settingsSteps = steps.filter((step) => step.targetId === "settings");
  assert.equal(settingsSteps.length, 1);
  assert.equal(settingsSteps[0]?.event, "settings_browsed");

  // NUMBERED to the end, unlike Felix's — Sparky's loop is visible progress and the counter is part
  // of it. This is the assertion that would catch `unnumbered` being copied across by habit.
  assert.equal(steps.some((step) => step.unnumbered), false);

  for (const step of steps) {
    assert.ok(step.event, `${step.id} has no event to wait on`);
    assert.ok(step.targetId, `${step.id} has nothing to highlight`);
  }
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

test("nothing composes any more, and no run gets a second Settings walkthrough", () => {
  // All four profiles return hand-written lists, so `tutorialStepsFor`'s slicing is unreachable and
  // the background/instructions pair it used to emit reaches nobody. This asserts the OUTCOME rather
  // than the absence of the machinery: the tables are still exported (TUTORIAL_VOICE_OVER_SCRIPT is
  // derived from one of them) and a future profile could compose again, but no profile may end up
  // with two settings steps or with a post-build settings phase.
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

  // THE WHOLE ORDER, pinned. This run is hand-written, so its sequence is content rather than a
  // consequence of the composition — nothing else in the codebase would notice a step moving.
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

  // The merged opening: the pick-up card closes on the SNAP. Advancing on `part_picked_up` would
  // put the Settings card up while the player is still holding the tabletop.
  assert.equal(
    steps.find((step) => step.id === "long-press-part")?.event,
    "part_snapped",
  );
  assert.equal(
    steps.some((step) => step.id === "drag-and-snap"),
    false,
  );

  // ONE settings step, and it browses. The pair this run used to compose is gone from it, and the
  // post-build walkthrough is empty so the same pair cannot come back after the last leg.
  const settingsSteps = steps.filter((step) => step.targetId === "settings");
  assert.equal(settingsSteps.length, 1);
  assert.equal(settingsSteps[0]?.event, "settings_browsed");
  assert.deepEqual(settingsTutorialStepsFor(context("clearPath", false)), []);

  // Focus is taught BACKWARDS here on purpose — clearPath pins focusMode on, so its player starts
  // inside focus mode and the first press reveals the HUD. This asserts the sentence differs from
  // the shared one rather than pinning the wording, so a copy edit does not fail the test but a
  // silent fall-back to the composed step would.
  const focusStep = steps.find((step) => step.id === "hud-focus");
  const sharedFocus = SHARED_HUD_TUTORIAL_STEPS.find(
    (step) => step.id === "hud-focus",
  );
  assert.ok(focusStep && sharedFocus);
  assert.notEqual(focusStep.message, sharedFocus.message);

  // The safety net lands BEFORE the fiddly part, not after the table is built.
  const at = (id: string) => steps.findIndex((step) => step.id === id);
  assert.ok(at("visual-undo-recenter") < at("place-connector"));
  assert.ok(at("visual-stuck-help") < at("place-connector"));

  // ONE ROTATION, not "steer all the way under the tabletop". Lumi still
  // waits on `underside_view_reached`; this one lets go as soon as the stick has been meaningfully
  // pushed. Asserted against the other profiles rather than in isolation so the difference stays
  // visible if the shared step is ever re-worded.
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

  // The point of a tutorial: no step advances without the player doing something, and every step has
  // something on screen to ring.
  for (const step of steps) {
    assert.ok(step.event, `${step.id} has no event to wait on`);
    assert.ok(step.targetId, `${step.id} has nothing to highlight`);
  }
});

test("the stuck-help step rings a second control, and it is one a step list actually contains", () => {
  // The table is keyed by step ID and the overlay reads it by step ID, so a rename on either side
  // fails silently — the second ring simply stops drawing, which is exactly how it behaved for
  // months while nothing measured the frame it needed. This is the check that makes that loud.
  const allIds = new Set(
    (["control", "visual", "momentum", "clearPath"] as const).flatMap((profile) =>
      tutorialStepsFor(context(profile, profile === "control")).map((step) => step.id),
    ),
  );
  for (const stepId of Object.keys(SECONDARY_TARGET_BY_STEP)) {
    assert.ok(allIds.has(stepId), `${stepId} is not in any profile's run`);
  }

  // Spot is the step's own target, Auto is the second ring. Focus sits between them in the toggles
  // row, which is why this is two rectangles and not one around the pair.
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