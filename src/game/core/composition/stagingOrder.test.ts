import assert from "node:assert/strict";
import test from "node:test";

import { AUTHORED_ACTIONS, CLUSTERS, FASTENERS } from "@/src/game/content/furnitures/EKET/authored";
import { STRUCTURE_COMPOSED } from "@/src/game/content/furnitures/EKET/structure.gen";
import { PARTS } from "@/src/game/content/furnitures/EKET/parts.gen";
import { HARDWARE } from "@/src/game/content/hardware";
import { applyStructure } from "@/src/game/core/model/liaisons";
import { composeFurnitureActions } from "./composeActions";

// the staged-sub-assembly choreography is "take out, fit hardware, carry in"
// withStaging promises strict-mode order follows the spliced sequence, so a carrier's hardware must sit INSIDE its stage→place window
// regression: with the dowels 80 slots after the rods, strict mode walked stage_rod_1 → stage_rod_2 back to back (device, 2026-08-10)
test("a staged carrier's hardware fits between its stage and place beats, so rod 1 completes before rod 2 begins", () => {
  const actions = composeFurnitureActions(AUTHORED_ACTIONS, FASTENERS, applyStructure(PARTS, STRUCTURE_COMPOSED), HARDWARE, CLUSTERS);
  const at = (id: string) => actions.findIndex((a) => a.actionId === id);
  for (const [rod, dowels] of [["stabilizerRod_1", ["dowel145572_1", "dowel145572_2"]], ["stabilizerRod_2", ["dowel145572_3", "dowel145572_4"]]] as const) {
    for (const d of dowels) {
      assert.ok(at(`stage_${rod}`) < at(`drop_${d}`), `drop_${d} must come after stage_${rod}`);
      assert.ok(at(`drop_${d}`) < at(`insert_${d}`), `insert_${d} must follow its drop`);
      assert.ok(at(`insert_${d}`) < at(`place_${rod}`), `insert_${d} must come before place_${rod} (fit hardware while staged)`);
      assert.ok(at(`place_${rod}`) < at(`tighten_${d}`), `tighten_${d} must come after place_${rod} (its requires demand it)`);
    }
  }
  assert.ok(at("tighten_dowel145572_2") < at("stage_stabilizerRod_2"), "rod 1 must be fully done before rod 2's window opens in the order");
});

// same-group staged carriers must serialize as a REQUIRES constraint, not an ordering hint — free mode ignores order
// without it a player can stage rod 2 while rod 1 dangles half-built
// derived at compose time from the parts alone, so any platform-generated recipe gets it without a question
test("staging the second rod is locked until the first is fully settled, in every mode", () => {
  const actions = composeFurnitureActions(AUTHORED_ACTIONS, FASTENERS, applyStructure(PARTS, STRUCTURE_COMPOSED), HARDWARE, CLUSTERS);
  const stage2 = actions.find((a) => a.actionId === "stage_stabilizerRod_2")!;
  assert.ok(stage2.requires.includes("tighten_dowel145572_1" as never) && stage2.requires.includes("tighten_dowel145572_2" as never), `stage_stabilizerRod_2 must require rod 1's dowels tightened, got req:[${stage2.requires.join(",")}]`);
  const stage1 = actions.find((a) => a.actionId === "stage_stabilizerRod_1")!;
  assert.ok(!stage1.requires.some((r) => r.includes("dowel145572_3") || r.includes("dowel145572_4")), "the chain is one-directional — rod 1 must not require rod 2");
});
