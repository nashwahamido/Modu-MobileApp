import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveSceneState } from "./useSceneState";
import { availableInMode } from "@/src/game/core/evaluation/availability";
import { LACK_FIXTURE } from "@/src/game/content/furnitures/fixtures.testutil";
import { ActionId } from "@/src/game/core/type";

// After the tabletop is placed, free mode's grab-anything rule makes every leg card `enabled` (its cluster is "started"), even though no leg action is legal — the only available actions are the four bolt inserts. Focus mode's single card must be the actually-available bolt, not the enabled-but-illegal leg.
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

// Guided mode leads the player, so the tray should list actionable cards (an available action) before non-actionable ones — the leg card has no legal action once only the tabletop is done, but the bolt card does.
test("guided mode lists the actionable bolt card before the non-actionable leg card", () => {
  const done: ActionId[] = [LACK_FIXTURE.actions.find((a) => a.actionId === "place_tableTop")!.actionId];

  const state = deriveSceneState(LACK_FIXTURE, done, null, null, null, "guide", false);

  // GUARD: prove the unsorted order actually has a non-actionable card first, otherwise this test cannot demonstrate anything.
  assert.equal(
    state.allTrayItems[0].kind,
    "structural",
    "guard: authored order must start with the non-actionable leg card for this test to mean anything",
  );

  assert.equal(state.trayItems[0].kind, "fastener", "the actionable bolt card should be sorted first in guided mode");
  assert.equal(state.trayItems[0].group, "bolt115980");
});

// Free mode is "build it your way" — reordering its tray would railroad the player, so it must keep authored order even though the same actionable/non-actionable split exists underneath.
test("free mode tray keeps authored order (not reordered by actionability)", () => {
  const done: ActionId[] = [LACK_FIXTURE.actions.find((a) => a.actionId === "place_tableTop")!.actionId];

  const state = deriveSceneState(LACK_FIXTURE, done, null, null, null, "free", false);

  assert.deepEqual(
    state.trayItems.map((t) => t.group),
    state.allTrayItems.map((t) => t.group),
    "free mode must not reorder the tray relative to authored order",
  );
});
