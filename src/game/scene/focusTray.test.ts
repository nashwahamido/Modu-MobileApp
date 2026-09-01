import { test } from "node:test";
import assert from "node:assert/strict";
import { actionableFirst, deriveSceneState } from "./useSceneState";
import { availableInMode } from "@/src/game/core/evaluation/availability";
import { LACK_FIXTURE } from "@/src/game/content/furnitures/fixtures.testutil";
import { ActionId } from "@/src/game/core/type";

test("focus mode picks the available bolt, not the merely-enabled leg, once the tabletop is placed", () => {
  const done: ActionId[] = [LACK_FIXTURE.actions.find((a) => a.actionId === "place_tableTop")!.actionId];

  const available = availableInMode(LACK_FIXTURE, new Set(done), "free", null);
  assert.equal(
    available.some((a) => a.type === "placePart" && a.partId?.startsWith("leg")),
    false,
    "guard: no leg placement should be a legal action once only the tabletop is done",
  );
  assert.ok(
    available.length > 0 && available.every((a) => a.type === "insertFastener"),
    "guard: the only legal actions should be the bolt inserts",
  );

  const state = deriveSceneState(LACK_FIXTURE, done, null, null, null, "free", false);
  const legCard = state.allTrayItems.find((t) => t.kind === "structural");
  assert.ok(legCard, "guard: a leg card must exist in allTrayItems");
  assert.equal(legCard!.enabled, true, "guard: the leg card must be `enabled` (grab-anything) for this test to mean anything");

  const focusState = deriveSceneState(LACK_FIXTURE, done, null, null, null, "free", true);
  assert.equal(focusState.trayItems.length, 1);
  assert.equal(focusState.trayItems[0].kind, "fastener");
  assert.equal(focusState.trayItems[0].group, "bolt115980");
});

test("guided mode lists the actionable bolt card before the non-actionable leg card", () => {
  const done: ActionId[] = [LACK_FIXTURE.actions.find((a) => a.actionId === "place_tableTop")!.actionId];

  const state = deriveSceneState(LACK_FIXTURE, done, null, null, null, "guide", false);

  assert.equal(
    state.allTrayItems[0].kind,
    "structural",
    "guard: authored order must start with the non-actionable leg card for this test to mean anything",
  );

  assert.equal(state.trayItems[0].kind, "fastener", "the actionable bolt card should be sorted first in guided mode");
  assert.equal(state.trayItems[0].group, "bolt115980");
});

test("free mode tray keeps authored order (not reordered by actionability)", () => {
  const done: ActionId[] = [LACK_FIXTURE.actions.find((a) => a.actionId === "place_tableTop")!.actionId];

  const state = deriveSceneState(LACK_FIXTURE, done, null, null, null, "free", false);

  assert.deepEqual(
    state.trayItems.map((t) => t.group),
    state.allTrayItems.map((t) => t.group),
    "free mode must not reorder the tray relative to authored order",
  );
});

test("actionableFirst puts the bolt under the tutorial's spotlight after a leg is finished", () => {
  const done: ActionId[] = [
    "place_tableTop",
    "insert_bolt115980_1",
    "tighten_bolt115980_1",
    "place_leg_1",
  ].map((id) => LACK_FIXTURE.actions.find((a) => (a.actionId as string) === id)!.actionId);

  const available = availableInMode(LACK_FIXTURE, new Set(done), "free", null);
  assert.ok(
    available.length > 0 && available.every((a) => a.type === "insertFastener"),
    "guard: with one leg on, the only legal moves must be the remaining bolt inserts",
  );

  const state = deriveSceneState(LACK_FIXTURE, done, null, null, null, "free", false);
  assert.equal(
    state.trayItems[0].kind,
    "structural",
    "guard: free mode must still hand the tutorial a leg-first tray, or this test is not exercising the bug",
  );

  const sorted = actionableFirst(state.trayItems, new Set(available.map((a) => a.actionId)));
  assert.equal(sorted[0].group, "bolt115980", "the spotlight's card must be the one the player can actually use");
  assert.deepEqual([...sorted].map((t) => t.group).sort(), [...state.trayItems].map((t) => t.group).sort());
});
