import { test } from "node:test";
import assert from "node:assert/strict";
import { availableActions, nextAction } from "./availability";
import { LACK_FIXTURE, EKET_FIXTURE } from "@/src/game/content/furnitures/fixtures.testutil";
import type { ActionId, Furniture } from "@/src/game/core/type";

/** An action by its literal id string, typed as this fixture's own ActionId. */
function id(f: Furniture, actionId: string): ActionId {
  const found = f.actions.find((a) => (a.actionId as string) === actionId);
  assert.ok(found, `fixture must contain an action named ${actionId}`);
  return found.actionId;
}

function pick(f: Furniture, completed: string[]): string | undefined {
  const done = new Set(completed.map((c) => id(f, c)));
  return nextAction(f, availableActions(f, done), done)?.actionId as string | undefined;
}

// THE REPORTED BUG. LACK composes place_leg_1..4 before any bolt, so once the first tighten unlocks leg 1 the head of the offered list is that leg and stays there until it is placed — including while the player is halfway through the NEXT bolt.
const SECOND_BOLT_IN = ["place_tableTop", "insert_bolt115980_1", "tighten_bolt115980_1", "insert_bolt115980_2"];

test("a screw waiting to be turned outranks a leg still in the box", () => {
  const done = new Set(SECOND_BOLT_IN.map((c) => id(LACK_FIXTURE, c)));
  const offered = availableActions(LACK_FIXTURE, done);
  assert.equal(
    offered[0]?.actionId as string,
    "place_leg_1",
    "guard: the authored order must still put the leg first, or this test is not exercising the bug it was written for",
  );
  assert.equal(pick(LACK_FIXTURE, SECOND_BOLT_IN), "tighten_bolt115980_2");
});

test("with nothing started, the authored order still decides", () => {
  // The tie-break, and the reason this is a preference rather than a re-sort: a fresh build has no part in the scene to continue, so "first offered" is the honest reading of first.
  assert.equal(pick(LACK_FIXTURE, []), "place_tableTop");
  assert.equal(pick(LACK_FIXTURE, ["place_tableTop"]), "insert_bolt115980_1");
});

test("the freshly inserted bolt is preferred over an older leg that is also legal", () => {
  // Two continuations would be ambiguous; this state has exactly one part in the scene with work left (bolt 2) and one part not yet in it (leg 1), which is the shape the rule is about.
  const done = ["place_tableTop", "insert_bolt115980_1", "tighten_bolt115980_1", "insert_bolt115980_2"];
  const picked = pick(LACK_FIXTURE, done);
  assert.ok(picked?.startsWith("tighten_"), `expected the pending tighten, got ${picked}`);
});

test("an empty offering has no next action", () => {
  const all = LACK_FIXTURE.actions.map((a) => a.actionId as string);
  assert.equal(pick(LACK_FIXTURE, all), undefined);
});

test("EKET reaches the same state 21 times over one build, and the pick is right in every one", () => {
  // NOT A LACK-SHAPED FIX, and not a tutorial-shaped one. This walks the cabinet the way a player who always reaches for a NEW part does — which is legal, and is exactly what leaves a screw half-driven behind them — and asserts the pick at every state where the authored order puts a fresh part ahead of the pending one. Walking in composed order instead finds nothing: it finishes each continuation the moment it appears, which is the one order in which the bug cannot happen.
  const done = new Set<ActionId>();
  let mismatched = 0;
  for (let step = 0; step < 400; step++) {
    const offered = availableActions(EKET_FIXTURE, done);
    if (!offered.length) break;
    const inScene = new Set(
      EKET_FIXTURE.actions.filter((a) => a.partId && done.has(a.actionId)).map((a) => a.partId),
    );
    const continues = offered.find((a) => a.partId && inScene.has(a.partId));
    const starts = offered.find((a) => a.partId && !inScene.has(a.partId));
    if (continues && starts && offered.indexOf(starts) < offered.indexOf(continues)) {
      mismatched++;
      assert.equal(
        nextAction(EKET_FIXTURE, offered, done)?.actionId,
        continues.actionId,
        `${offered[0].actionId} was offered first, but ${continues.actionId} is the move already underway`,
      );
    }
    done.add((starts ?? offered[0]).actionId);
  }
  assert.ok(mismatched > 0, "the walk never reached the state this rule is for — the walk, not the rule, is what needs looking at");
});

// THE COMBINE-STAGE BUG. Combines carry the cluster they join (the CLUSTERS overlay), and the combine stage runs UNFOCUSED — so the cluster-less focus filter dropped both combines, the offered list went empty, and the objective bar fell back to "Switch focus" while the combine tray was asking for the real gesture (reported on DALFRED, 2026-08-25). The offered list at the combine stage must name the combine itself.
test("at the combine stage, unfocused focus filtering still offers the combine beat", async () => {
  const { fixture } = await import("@/src/game/content/furnitures/fixtures.testutil");
  const DALFRED = await import("@/src/game/content/furnitures/DALFRED/authored");
  const { PARTS } = await import("@/src/game/content/furnitures/DALFRED/parts.gen");
  const f = fixture("dalfred-stool", DALFRED as never, PARTS);
  const { actionsForClusterFocus } = await import("./clusters");
  // Everything except the combines is complete.
  const done = new Set(f.actions.filter((a) => a.type !== "combineClusters").map((a) => a.actionId));
  const legal = availableActions(f, done);
  assert.ok(legal.some((a) => a.type === "combineClusters"), "guard: the combine must be legal once both clusters are built");
  const offered = actionsForClusterFocus(f, legal, null);
  const next = nextAction(f, offered, done);
  assert.equal(next?.type, "combineClusters", "the combine stage must name the combine, not fall back to Switch focus");
  assert.equal(next?.actionId as string, "combine_base");
});
