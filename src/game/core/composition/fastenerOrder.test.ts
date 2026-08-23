import assert from "node:assert/strict";
import test from "node:test";

import * as EKET from "@/src/game/content/furnitures/EKET/authored";
import { PARTS as EKET_PARTS } from "@/src/game/content/furnitures/EKET/parts.gen";
import * as DALFRED from "@/src/game/content/furnitures/DALFRED/authored";
import { PARTS as DALFRED_PARTS } from "@/src/game/content/furnitures/DALFRED/parts.gen";
import { HARDWARE } from "@/src/game/content/hardware";
import { applyStructure } from "@/src/game/core/model/liaisons";
import type { DraftAction, PartDef, PartId } from "@/src/game/core/type";
import { composeFurnitureActions, withFastenersBeforeCombines } from "./composeActions";

// A cluster's own hardware must be asked for while the cluster is still loose on the bench. The fastener appendix used to land after every combine, so EKET asked for the drawer-back screws with the drawer already inside the finished cabinet (box-blocked from all 72 sweep cameras) and DALFRED asked for the pole's end cap after the pole had been threaded down over the support pin. The authored stage said otherwise both times and never got a say against array position.
test("EKET: a drawer's screws sit after that drawer's last placement and before any combine", () => {
  const actions = composeFurnitureActions(EKET.AUTHORED_ACTIONS, EKET.FASTENER_RULES, applyStructure(EKET_PARTS, EKET.STRUCTURE), HARDWARE, EKET.CLUSTERS);
  const at = (id: string) => actions.findIndex((a) => a.actionId === id);
  const firstCombine = actions.findIndex((a) => a.type === "combineClusters");
  for (const s of ["screw110519_1", "screw110519_8", "screw109041_1", "screw109041_8"]) {
    assert.ok(at(`insert_${s}`) < firstCombine, `insert_${s} must precede the first combine`);
    assert.ok(at(`insert_${s}`) < at(`tighten_${s}`), `insert_${s} must precede its tighten`);
  }
  // Drawer A's hardware follows drawer A's last placement and precedes drawer B's first — build one drawer, screw it, build the next.
  assert.ok(at("place_runnerBracketR_1") < at("insert_screw110519_1"), "drawer A's screws come after its last placement");
  assert.ok(at("tighten_screw109041_4") < at("place_drawerSideL_2"), "drawer A's screws are done before drawer B begins");
  // The cabinet's own runner screws follow the cabinet's last placement, not the drawers'.
  assert.ok(at("insert_screw100349_1") < at("place_drawerSideL_1"), "cabinet screws come before the drawers are built");
});

test("DALFRED: the pole's cap is fitted before the seat assembly is combined onto the base", () => {
  const actions = composeFurnitureActions(DALFRED.AUTHORED_ACTIONS, DALFRED.FASTENER_RULES, applyStructure(DALFRED_PARTS, DALFRED.STRUCTURE), HARDWARE, DALFRED.CLUSTERS);
  const at = (id: string) => actions.findIndex((a) => a.actionId === id);
  assert.ok(at("place_pole") < at("insert_cap107675_1"), "the cap needs the pole placed");
  assert.ok(at("tighten_cap107675_1") < at("combine_base"), "the cap must be on before the seat threads onto the base");
  assert.ok(at("tighten_screw105251_8") < at("place_seat"), "the base's leg screws are done before the seat cluster begins");
});

// Synthetic: a fastener bridging two clusters realizes the combine joint and must NOT be pulled ahead of it; one that explicitly requires a combine stays put too.
test("a cross-cluster fastener, or one requiring a combine, keeps its place after the combine", () => {
  const pid = (s: string) => s as PartId;
  const parts: Record<PartId, PartDef> = {
    [pid("a")]: { partId: pid("a"), group: "a", type: "structural", cluster: "x", pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] } } as unknown as PartDef,
    [pid("b")]: { partId: pid("b"), group: "b", type: "structural", cluster: "y", pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] } } as unknown as PartDef,
    [pid("bridge")]: { partId: pid("bridge"), group: "bridge", type: "fastener", attached: [pid("a"), pid("b")], pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] } } as unknown as PartDef,
    [pid("own")]: { partId: pid("own"), group: "own", type: "fastener", attached: [pid("a")], pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] } } as unknown as PartDef,
    [pid("gated")]: { partId: pid("gated"), group: "gated", type: "fastener", attached: [pid("a")], pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] } } as unknown as PartDef,
  };
  const d = (actionId: string, type: DraftAction["type"], partId?: string, requires: string[] = [], cluster?: string): DraftAction =>
    ({ actionId, type, stage: 1, partId, cluster, requires } as unknown as DraftAction);
  const drafts = [
    d("place_a", "placePart", "a"),
    d("place_b", "placePart", "b"),
    d("combine_x", "combineClusters", undefined, [], "x"),
    d("insert_bridge", "insertFastener", "bridge", ["combine_x"]),
    d("insert_own", "insertFastener", "own", ["place_a"]),
    d("insert_gated", "insertFastener", "gated", ["combine_x"]),
  ];
  const ids = withFastenersBeforeCombines(drafts, parts).map((a) => a.actionId);
  assert.deepEqual(ids, ["place_a", "insert_own", "place_b", "combine_x", "insert_bridge", "insert_gated"]);
});
