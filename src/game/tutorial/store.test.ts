import assert from "node:assert/strict";
import test from "node:test";

import { useTutorialStore } from "./store";

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

test("a fast pick-up and snap skips the already-satisfied card without flashing it", async () => {
  const tutorial = useTutorialStore.getState();
  tutorial.configureTutorial({
    profile: "visual",
    mode: "guide",
    manualTools: false,
    softHints: true,
  });

  useTutorialStore.setState({ currentIndex: 1 });

  useTutorialStore.getState().completeEvent("part_picked_up");
  useTutorialStore.getState().completeEvent("part_snapped");

  assert.deepEqual(useTutorialStore.getState().latchedEvents, ["part_snapped"]);
  await wait(1250);

  const state = useTutorialStore.getState();
  assert.equal(state.steps[state.currentIndex]?.id, "background-settings");
  assert.equal(state.stepRewardsClaimed, 20);
  assert.equal(state.latchedEvents.length, 0);
  state.resetTutorial();
});

test("tightening completion waits for the physical animation to settle", async () => {
  const tutorial = useTutorialStore.getState();
  tutorial.configureTutorial({
    profile: "control",
    mode: "free",
    manualTools: true,
    softHints: true,
  });
  const tightenStep = tutorial.steps.find(
    (step) => step.id === "tighten-connector",
  );
  assert.ok(tightenStep);

  useTutorialStore.setState({
    steps: [tightenStep],
    currentIndex: 0,
    acceptsEventsAfter: 0,
    pendingCompletionStepId: null,
    pendingAdvanceStepId: null,
  });
  useTutorialStore.getState().completeEvent("connector_tightened");

  assert.equal(
    useTutorialStore.getState().pendingCompletionStepId,
    "tighten-connector",
  );
  assert.equal(useTutorialStore.getState().pendingAdvanceStepId, null);
  await wait(500);
  assert.equal(
    useTutorialStore.getState().pendingAdvanceStepId,
    "tighten-connector",
  );
  useTutorialStore.getState().resetTutorial();
});

test("the completion card waits for the final step to settle", async () => {
  const tutorial = useTutorialStore.getState();
  tutorial.configureTutorial({
    profile: "momentum",
    mode: "guide",
    manualTools: false,
    softHints: true,
  });
  const finalStep = tutorial.steps.find(
    (step) => step.id === "install-four-legs",
  );
  assert.ok(finalStep);

  useTutorialStore.setState({
    steps: [finalStep],
    currentIndex: 0,
    acceptsEventsAfter: 0,
    pendingCompletionStepId: null,
    pendingAdvanceStepId: null,
  });
  useTutorialStore.getState().completeEvent("all_legs_installed");

  assert.equal(useTutorialStore.getState().settingsReady, false);
  assert.equal(
    useTutorialStore.getState().pendingCompletionStepId,
    "install-four-legs",
  );
  await wait(550);
  assert.equal(useTutorialStore.getState().settingsReady, false);
  assert.equal(
    useTutorialStore.getState().pendingAdvanceStepId,
    "install-four-legs",
  );
  useTutorialStore.getState().resetTutorial();
});