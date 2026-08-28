import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveSceneState } from "./useSceneState";
import { availableInMode } from "@/src/game/core/evaluation/availability";
import { EKET_FIXTURE } from "@/src/game/content/furnitures/fixtures.testutil";
import { ActionId, ClusterId } from "@/src/game/core/type";

// The state this pins: a 3-phase rod dowel is dropped at its STAGE pose, out on the canvas waiting for the PRESS that seats it, while an unrelated suspension cap in the same cluster is inserted and waiting to be tightened. Both are legal, both want the on-canvas pad, and only one can have it.
const CABINET = "cabinet" as ClusterId;
const stateWithBothPending = (): ActionId[] => {
  const done: string[] = [];
  // everything the rod's take-out needs, plus rod 1 finished so rod 2 is the live one
  for (const a of EKET_FIXTURE.actions) {
    if (a.actionId === "stage_stabilizerRod_2") break;
    done.push(a.actionId);
  }
  done.push("stage_stabilizerRod_2", "drop_dowel145572_3");
  // the suspension bracket is the unrelated tighten in contention: placing it opens tighten_suspBracket_1 with no insert of its own to wait on
  done.push("place_suspBracket_1");
  return done as ActionId[];
};

test("a pending insert press outranks a tighten — the staged dowel keeps the pad", () => {
  const done = stateWithBothPending();
  const available = availableInMode(EKET_FIXTURE, new Set(done), "free", CABINET);

  // GUARDS: without BOTH pending at once this test proves nothing.
  assert.ok(
    available.some((a) => a.actionId === "insert_dowel145572_3"),
    "guard: the staged dowel's press must be legal",
  );
  assert.ok(
    available.some((a) => a.type === "tightenFastener"),
    "guard: some tighten must also be legal, or there is no contest",
  );

  const state = deriveSceneState(EKET_FIXTURE, done, null, CABINET, null, "free", false);
  assert.equal(
    state.activeInsertPress?.actionId,
    "insert_dowel145572_3",
    "the dowel already out on the canvas owns the pad",
  );
  assert.equal(
    state.activeTighten,
    null,
    "the tighten sits behind it — a live activeTighten hides the press pad and drags its tool gate in with it",
  );
});

test("a tighten still takes the pad once no insert press is pending", () => {
  const done = [...stateWithBothPending(), "insert_dowel145572_3" as ActionId, "drop_dowel145572_4" as ActionId, "insert_dowel145572_4" as ActionId];
  const state = deriveSceneState(EKET_FIXTURE, done, null, CABINET, null, "free", false);

  assert.equal(state.activeInsertPress, null, "guard: no press may be pending for this half to mean anything");
  assert.equal(state.activeTighten?.type, "tightenFastener");
});
