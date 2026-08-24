import { test } from "node:test";
import assert from "node:assert/strict";
import { hintText } from "./hintText";
import type { BlockReason } from "@/src/game/core/evaluation/blockReason";
import type { Furniture } from "@/src/game/core/type";

const F = {
  labels: {
    bottomPanel: { standard: "bottom panel", simple: "bottom" },
    camScrew: { standard: "cam screw" },
  },
} as unknown as Furniture;

const PLACE: BlockReason = { kind: "place", target: "bottomPanel" };
const INSERT: BlockReason = { kind: "insert", target: "camScrew" };

test("one way open names the blocker", () => {
  assert.equal(hintText(PLACE, F, "standard", 1), "Maybe place the bottom panel first.");
});

test("several ways open go generic", () => {
  assert.equal(hintText(PLACE, F, "standard", 4), "Something else comes first.");
});

test("the generic line is identical at the simple text level", () => {
  assert.equal(hintText(PLACE, F, "simple", 4), "Something else comes first.");
});

test("one way open at the simple text level keeps the simple specific form", () => {
  assert.equal(hintText(PLACE, F, "simple", 1), "Place the bottom first.");
});

test("zero ways open still names the blocker rather than going generic", () => {
  // blockReason has fallen through to its candidates[0] backstop; that guess is all we have, and it beats the generic line.
  assert.equal(hintText(INSERT, F, "standard", 0), "Maybe insert the cam screw first.");
});

test("omitting openWays keeps the specific text", () => {
  assert.equal(hintText(INSERT, F), "Maybe insert the cam screw first.");
});
