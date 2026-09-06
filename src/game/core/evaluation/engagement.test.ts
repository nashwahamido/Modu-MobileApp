// The park a placement DELIVERS to (engagement.parkOffsetFor) — the one point the release animation
// and the drag's visibility gate both have to agree on. They disagreed for as long as the gate could
// only read the AUTHORED placeDir/parkBackoff: every derived park was invisible to it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LACK_FIXTURE } from "@/src/game/content/furnitures/fixtures.testutil";
import { SWEEP } from "@/src/game/content/furnitures/LACK/sweep.gen";
import { availableActions } from "./availability";
import { parkOffsetFor, placeEngagement, SCREW_BACKOFF_M } from "./engagement";
import type { ActionId, Furniture, PartId } from "@/src/game/core/type";

test("a LACK leg's park is DERIVED: nothing is authored, and it still screws up from 45mm below its seat", () => {
  const f = { ...LACK_FIXTURE, sweep: SWEEP } as Furniture;
  const leg = f.parts["leg_1" as PartId];
  // The premise. LACK authors no STRUCTURE beyond `tableTop: { seed: true }`, so a gate reading authored fields alone has nothing to offer this part and judges its flush seat — which lies exactly ON the tabletop's underside plane, visible only from an eye below that plane.
  assert.equal(leg.placeDir, undefined);
  assert.equal(leg.parkBackoff, undefined);

  const action = f.actions.find((a) => a.type === "placePart" && a.partId === "leg_1")!;
  // The state the player actually drags a leg in: the leg is gated behind its own bolt being driven into the tabletop AND tightened — it screws onto the standing bolt, it does not drop onto bare wood.
  const done = new Set<ActionId>(["place_tableTop", "insert_bolt115980_1"] as ActionId[]);
  assert.ok(
    !availableActions(f, done).some((a) => a.actionId === action.actionId),
    "a leg must not be draggable before its bolt is tightened",
  );
  done.add("tighten_bolt115980_1" as ActionId);
  assert.ok(
    availableActions(f, done).some((a) => a.actionId === action.actionId),
    "the leg is draggable once its bolt is tightened",
  );

  assert.equal(placeEngagement(f, action, done), "screw");
  const off = parkOffsetFor(f, action, done);
  assert.ok(off, "a screw placement parks; null here is the bug the gate inherited");
  // Straight DOWN, the bolt's engage axis: the leg hangs a screw's back-off under the tabletop and spins up into it.
  assert.ok(Math.abs(off![0]) < 1e-9 && Math.abs(off![2]) < 1e-9);
  assert.ok(Math.abs(off![1] + SCREW_BACKOFF_M) < 1e-9);
});
