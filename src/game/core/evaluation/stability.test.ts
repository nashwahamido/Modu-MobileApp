// Preload-lock semantics per connector, keyed on the fact that decides them: `preload.completesOn`.
import assert from "node:assert/strict";

import { insertId, placeId, tightenId, asPartId } from "@/src/game/core/ids";
import { stabilityAllows, stabilityNextSteps } from "./stability";
import type {
  ActionId,
  AssemblyAction,
  FastenerPreload,
  Furniture,
} from "@/src/game/core/type";

const A = asPartId("hostA");
const B = asPartId("hostB");
const PIN = asPartId("gizmo_1");

// Two structural hosts + one two-attached connector between them, preload per test. Minimal on purpose: preloadConnectorLocks reads type/role/preload/attached/cluster off the parts and place/insert/tighten off the actions.
const furn = (
  completesOn: FastenerPreload["completesOn"],
  counterpartMountsBy: FastenerPreload["counterpartMountsBy"] = "press",
): Furniture =>
  ({
    parts: {
      [A]: { partId: A, group: "hostA", type: "structural" },
      [B]: { partId: B, group: "hostB", type: "structural" },
      [PIN]: {
        partId: PIN,
        group: "gizmo",
        type: "fastener",
        fastenerRole: "connector",
        preload: { completesOn, counterpartMountsBy },
        attached: [A, B],
      },
    },
    actions: [
      { actionId: placeId(A), type: "placePart", partId: A, requires: [] },
      { actionId: placeId(B), type: "placePart", partId: B, requires: [] },
      {
        actionId: insertId(PIN),
        type: "insertFastener",
        partId: PIN,
        requires: [],
      },
      {
        actionId: tightenId(PIN),
        type: "tightenFastener",
        partId: PIN,
        requires: [insertId(PIN)],
      },
    ],
  }) as unknown as Furniture;

const placeB = (f: Furniture): AssemblyAction =>
  f.actions.find((a) => a.actionId === placeId(B))!;
const done = (...ids: ActionId[]): ReadonlySet<ActionId> => new Set(ids);

test("completesOn: tighten holds the cluster until TIGHTENED, whichever way the counterpart mounts", () => {
  for (const mountsBy of ["press", "screw"] as const) {
    const f = furn("tighten", mountsBy);
    // half-made joint, connector merely inserted: the counterpart may NOT mount, and the way forward is the tighten
    assert.equal(
      stabilityAllows(f, placeB(f), done(placeId(A), insertId(PIN))),
      false,
      mountsBy,
    );
    assert.deepEqual(
      stabilityNextSteps(f, placeB(f), done(placeId(A), insertId(PIN))),
      new Set([tightenId(PIN)]),
      mountsBy,
    );
    // driven home: the joint is preloaded, the counterpart mounts
    assert.equal(
      stabilityAllows(
        f,
        placeB(f),
        done(placeId(A), insertId(PIN), tightenId(PIN)),
      ),
      true,
      mountsBy,
    );
  }
});

test("completesOn: insert frees the cluster on INSERT — it must not regress to the tighten-hold", () => {
  const f = furn("insert");
  assert.equal(
    stabilityAllows(f, placeB(f), done(placeId(A), insertId(PIN))),
    true,
  );
  // and before the insert, every preload blocks the counterpart alike
  assert.equal(stabilityAllows(f, placeB(f), done(placeId(A))), false);
});

test("a connector's tighten never waits on its own counterpart — the deadlock the retired cam kind encoded", () => {
  // The old defaultTightenRequires made a "cam" tighten require BOTH endpoints placed, while this lock holds place(B) until that tighten happens: place(B) → tighten → place(B). Unreachable only because nothing ever lowered to "cam".
  const f = furn("tighten");
  const tighten = f.actions.find((a) => a.actionId === tightenId(PIN))!;
  assert.deepEqual(tighten.requires, [insertId(PIN)]);
  assert.equal(
    stabilityAllows(f, tighten, done(placeId(A), insertId(PIN))),
    true,
  );
});
