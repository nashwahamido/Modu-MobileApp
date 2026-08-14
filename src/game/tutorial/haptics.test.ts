import assert from "node:assert/strict";
import test from "node:test";

import {
  hapticCueForTutorialCompletion,
  hapticCueForTutorialStep,
} from "./haptics";

test("physical tutorial actions do not receive a duplicate vibration", () => {
  for (const event of [
    "part_picked_up",
    "part_snapped",
    "connector_placed",
    "connector_tightened",
    "all_legs_installed",
    "assembly_reoriented",
    "tool_used",
  ] as const) {
    assert.equal(hapticCueForTutorialStep(event, "visual"), "none");
  }
});

test("non-physical steps receive light profile-appropriate confirmation", () => {
  assert.equal(
    hapticCueForTutorialStep("instruction_preferences_changed", "control"),
    "selection",
  );
  assert.equal(
    hapticCueForTutorialStep("instruction_preferences_changed", "momentum"),
    "light",
  );
});

test("core tutorial completion receives a success notification", () => {
  assert.equal(hapticCueForTutorialCompletion(), "success");
});
