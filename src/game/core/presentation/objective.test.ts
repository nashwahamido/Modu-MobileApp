import { test } from "node:test";
import assert from "node:assert/strict";
import { objectiveText, speaksSteps } from "./objective";

const BASE = { needsFocusChoice: false, stepText: "Place the leg", completedCount: 2, totalCount: 8 };

test("free mode shows no line at all", () => {
  assert.equal(objectiveText({ ...BASE, mode: "free" }), null);
});

test("free mode shows no line when a focus choice is pending", () => {
  // The gate is carried by MapButton and ClusterTray, which render whenever focus is needed.
  assert.equal(objectiveText({ ...BASE, mode: "free", needsFocusChoice: true }), null);
});

test("free mode shows no line on completion", () => {
  // The completion beat is BuildComplete's, not the bar's.
  assert.equal(objectiveText({ ...BASE, mode: "free", completedCount: 8 }), null);
});

test("guided mode still shows the step text", () => {
  assert.equal(objectiveText({ ...BASE, mode: "guide" }), "Place the leg");
});

test("guided mode still names a pending focus choice", () => {
  assert.equal(objectiveText({ ...BASE, mode: "guide", needsFocusChoice: true }), "Choose focus");
});

test("guided mode still celebrates completion", () => {
  assert.equal(objectiveText({ ...BASE, mode: "guide", completedCount: 8 }), "All done!");
});

test("guided mode with no step offered falls back to Switch focus", () => {
  assert.equal(objectiveText({ ...BASE, mode: "guide", stepText: null }), "Switch focus");
});

test("strict groups with guide, not with free", () => {
  assert.equal(objectiveText({ ...BASE, mode: "strict" }), "Place the leg");
});

test("free mode stays quiet for step audio, unchanged", () => {
  assert.equal(speaksSteps("free"), false);
  assert.equal(speaksSteps("guide"), true);
});
