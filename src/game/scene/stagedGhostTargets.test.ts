// The ghost layer resolves a socket by the type of the action IN HAND. Two EKET gestures have their
// own action type and their own target — the stabiliser rod's take-out (stagePart) and its coupling
// dowels' drop (placeFastener) — and while those types had no slot in buildPartActions both fell
// through to the part's placePart/insertFastener id: the rod ghosted nothing, and the dowel ghosted
// its assembled pose instead of the stage pose out on the canvas where the rod actually is.
import { test } from "node:test";
import assert from "node:assert/strict";

import { availableInMode } from "@/src/game/core/evaluation/availability";
import { stageShiftFor } from "@/src/game/core/model/staging";
import { buildPartActions, hintSlotFor, targetPositionForAction } from "@/src/game/core/scene/targets";
import { EKET_FIXTURE } from "@/src/game/content/furnitures/fixtures.testutil";
import type { ActionId, ClusterId, PartId } from "@/src/game/core/type";
import { deriveSceneState } from "./useSceneState";

const ROD = "stabilizerRod_1" as PartId;
const STAGE_ROD = "stage_stabilizerRod_1" as ActionId;
const DROP_DOWEL = "drop_dowel145572_1" as ActionId;
const CABINET = "cabinet" as ClusterId;
const DOWEL = "dowel145572_1" as PartId;
const SIBLING = "dowel145572_2" as PartId;

/** The smallest done-set that makes `id` itself complete: its requires, transitively, plus `id`. Cheaper and far steadier than playing the whole build forward, and it is the state the gesture under test is actually performed from. */
function completedThrough(id: ActionId): ActionId[] {
  const byId = new Map(EKET_FIXTURE.actions.map((a) => [a.actionId, a]));
  const done = new Set<ActionId>();
  const close = (target: ActionId): void => {
    const a = byId.get(target);
    if (!a) throw new Error(`no such action: ${target}`);
    for (const r of a.requires) {
      if (done.has(r)) continue;
      close(r);
      done.add(r);
    }
    // requiresAny is satisfied by ONE of its options — take the first, exactly as a player would.
    for (const r of a.requiresAny ?? []) {
      if (done.has(r)) break;
      close(r);
      done.add(r);
      break;
    }
  };
  close(id);
  done.add(id);
  return [...done];
}

test("every pickup type has its own action slot, so the gesture in hand names a matchable socket", () => {
  const acts = buildPartActions(EKET_FIXTURE.actions);
  assert.equal(acts[ROD].stage, "stage_stabilizerRod_1", "the rod's take-out must have a slot of its own");
  assert.equal(acts[ROD].snap, "place_stabilizerRod_1");
  assert.equal(acts[DOWEL].drop, "drop_dowel145572_1", "a 3-phase dowel's drop must have a slot of its own");
  assert.equal(acts[DOWEL].insert, "insert_dowel145572_1");

  // What the drag's matchedActionId will hold for each gesture — resolving any of these to a
  // different id leaves the ghost permanently unmatched, which is what hid the rod's.
  assert.equal(hintSlotFor(acts[ROD], "stagePart"), "stage_stabilizerRod_1");
  assert.equal(hintSlotFor(acts[ROD], "placePart"), "place_stabilizerRod_1");
  assert.equal(hintSlotFor(acts[DOWEL], "placeFastener"), "drop_dowel145572_1");
  assert.equal(hintSlotFor(acts[DOWEL], "insertFastener"), "insert_dowel145572_1");
  // Nothing in hand is Spot's "?" cue, which always marks the seat.
  assert.equal(hintSlotFor(acts[DOWEL], undefined), "insert_dowel145572_1");
});

test("holding a staged sub-assembly's dowel lights the other open dowel sockets", () => {
  const done = completedThrough(STAGE_ROD);
  assert.ok(
    availableInMode(EKET_FIXTURE, new Set(done), "free", CABINET).some(
      (a) => a.actionId === "drop_dowel145572_2",
    ),
    "guard: the sibling dowel's drop must be legal here, or the hint has nothing to point at",
  );

  const state = deriveSceneState(EKET_FIXTURE, done, DROP_DOWEL, CABINET, null, "free");
  assert.equal(state.modes[DOWEL], "held");
  assert.equal(
    state.modes[SIBLING],
    "socket_hint",
    "the other end of the rod is an open socket of the held group and must be ghosted",
  );
});

test("a dowel's drop target is the stage pose at the rod's staging offset, not its assembled pose", () => {
  const parts = EKET_FIXTURE.parts;
  const drop = EKET_FIXTURE.actions.find((a) => a.actionId === "drop_dowel145572_1")!;
  const target = targetPositionForAction(drop, parts, new Set<ActionId>());
  const baked = parts[DOWEL].pose.position;

  const shift = stageShiftFor(parts[DOWEL], parts);
  assert.deepEqual(shift, parts[ROD].stageOffset, "the dowel rides the rod's staging offset");
  // The ghost renders at pose + stageDelta + shift; anything that skips those terms sits at `baked`,
  // which is the hole in the runner frame the dowel does not reach until it is tightened home.
  assert.ok(
    Math.hypot(target[0] - baked[0], target[1] - baked[1], target[2] - baked[2]) > 0.02,
    "the drop target must be measurably away from the assembled pose",
  );
});
