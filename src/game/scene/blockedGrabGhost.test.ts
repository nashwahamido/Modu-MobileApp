// Free mode lets a part of a STARTED cluster lift even when its step is illegal (store.beginPickup) and answers with the avatar's error chip (store.noteBlocked). The scene must not contradict that chip by ghosting the socket: reported on DALFRED's ring-rail screws, which glowed a target while the chip said the step was blocked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveSceneState } from "./useSceneState";
import { availableActions } from "@/src/game/core/evaluation/availability";
import { DALFRED_FIXTURE } from "@/src/game/content/furnitures/fixtures.testutil";
import { ActionId } from "@/src/game/core/type";

const F = DALFRED_FIXTURE;
// Everything stage 1 places without prerequisites, so this is the earliest state a player can reach the ring-rail screws from — and the ring rail itself is still out (it waits on all eight screw105251 tightens).
const PLATES_AND_LEGS = [
  "place_circleUpp",
  "place_leg_1",
  "place_leg_2",
  "place_leg_3",
  "place_leg_4",
  "place_circleDown",
] as ActionId[];

test("a ring-rail screw grabbed before its step is legal ghosts nothing", () => {
  const held = "insert_screw100212_1" as ActionId;
  const legal = availableActions(F, new Set(PLATES_AND_LEGS));
  assert.equal(
    legal.some((a) => a.actionId === held),
    false,
    "guard: the ring-rail screw must be illegal here (its rail is not placed) for this test to mean anything",
  );

  const s = deriveSceneState(F, PLATES_AND_LEGS, held, "base" as never, null, "free", false, null);
  assert.equal(s.heldBlocked, true);
  assert.equal(
    Object.values(s.modes).filter((m) => m === "socket_hint").length,
    0,
    "no sibling socket may glow either — the whole group is blocked",
  );
});

test("a legal grab still ghosts its group's open sockets", () => {
  const held = "insert_screw105251_1" as ActionId;
  const s = deriveSceneState(F, PLATES_AND_LEGS, held, "base" as never, null, "free", false, null);
  assert.equal(s.heldBlocked, false);
  assert.ok(
    Object.values(s.modes).filter((m) => m === "socket_hint").length > 0,
    "the fastener field must still show its open sockets",
  );
});
