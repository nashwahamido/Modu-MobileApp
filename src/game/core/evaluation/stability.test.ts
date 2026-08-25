// Preload-lock semantics per connector kind — the fastener-model-v2 completesOn axis as the runtime enforces it. The cam case is the load-bearing one: kind "cam" is the {completesOn: tighten, counterpartMountsBy: press} cell (a Minifix bolt) and has ZERO corpus users, so this test is its only exerciser until a real fitting arrives — without it the lock's tighten-hold regresses silently (it shipped releasing on insert for two months and nothing noticed).
import { test } from "node:test";
import assert from "node:assert/strict";

import { insertId, placeId, tightenId, asPartId } from "@/src/game/core/ids";
import { stabilityAllows, stabilityNextSteps } from "./stability";
import type { ActionId, AssemblyAction, FastenerKind, Furniture } from "@/src/game/core/type";

const A = asPartId("hostA");
const B = asPartId("hostB");
const PIN = asPartId("gizmo_1");

// Two structural hosts + one two-attached connector between them, kind per test. Minimal on purpose: preloadConnectorLocks reads type/kind/attached/cluster off the parts and place/insert/tighten off the actions, nothing else.
const furn = (kind: FastenerKind): Furniture =>
  ({
    parts: {
      [A]: { partId: A, group: "hostA", type: "structural" },
      [B]: { partId: B, group: "hostB", type: "structural" },
      [PIN]: { partId: PIN, group: "gizmo", type: "fastener", fastenerKind: kind, attached: [A, B] },
    },
    actions: [
      { actionId: placeId(A), type: "placePart", partId: A, requires: [] },
      { actionId: placeId(B), type: "placePart", partId: B, requires: [] },
      { actionId: insertId(PIN), type: "insertFastener", partId: PIN, requires: [] },
      { actionId: tightenId(PIN), type: "tightenFastener", partId: PIN, requires: [insertId(PIN)] },
    ],
  }) as unknown as Furniture;

const placeB = (f: Furniture): AssemblyAction => f.actions.find((a) => a.actionId === placeId(B))!;
const done = (...ids: ActionId[]): ReadonlySet<ActionId> => new Set(ids);

test("a cam connector holds the cluster until TIGHTENED — the {tighten, press} preload cell", () => {
  const f = furn("cam");
  // half-made joint, connector merely inserted: the counterpart may NOT mount, and the way forward is the tighten
  assert.equal(stabilityAllows(f, placeB(f), done(placeId(A), insertId(PIN))), false);
  assert.deepEqual(stabilityNextSteps(f, placeB(f), done(placeId(A), insertId(PIN))), new Set([tightenId(PIN)]));
  // driven home: the joint is preloaded, the counterpart mounts
  assert.equal(stabilityAllows(f, placeB(f), done(placeId(A), insertId(PIN), tightenId(PIN))), true);
});

test("a threaded connector holds identically — cam is its behavioural twin on this axis", () => {
  const f = furn("threaded");
  assert.equal(stabilityAllows(f, placeB(f), done(placeId(A), insertId(PIN))), false);
  assert.equal(stabilityAllows(f, placeB(f), done(placeId(A), insertId(PIN), tightenId(PIN))), true);
});

test("a pin connector frees the cluster on INSERT — completesOn: insert must not regress to the tighten-hold", () => {
  const f = furn("pin");
  assert.equal(stabilityAllows(f, placeB(f), done(placeId(A), insertId(PIN))), true);
  // and before the insert, every kind blocks the counterpart alike
  assert.equal(stabilityAllows(f, placeB(f), done(placeId(A))), false);
});
