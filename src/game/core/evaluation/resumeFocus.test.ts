// resumeFocusCluster — a resumed mid-build lands in the section where its next available action lives, instead of the section chooser re-asking a question the save already answers. The device finding that forced this (2026-08-25): the autosave never carried activeCluster, so relaunching a 24%-built EKET greeted the player with "choose a section" mid-cabinet. Real EKET fixture throughout: the derivation must hold on the furniture that exposed it.
import { test } from "node:test";
import assert from "node:assert/strict";

import { composeFurnitureActions } from "@/src/game/core/composition/composeActions";
import { applyStructure, buildLiaisons } from "@/src/game/core/model/liaisons";
import { buildComponents, memberPlaceIdsForLead } from "@/src/game/core/model/components";
import { availableInMode, resumeFocusCluster } from "./availability";
import { actionCluster } from "./clusters";
import { HARDWARE } from "@/src/game/content/hardware";
import * as EKET from "@/src/game/content/furnitures/EKET/authored";
import { PARTS } from "@/src/game/content/furnitures/EKET/parts.gen";
import type { ActionId, ClusterId, Furniture } from "@/src/game/core/type";
import { STRUCTURE_COMPOSED as EKET_COMPOSED } from "@/src/game/content/furnitures/EKET/structure.gen";

const parts = applyStructure(PARTS, EKET_COMPOSED);
const f = {
  meta: { id: "eket-cabinet" },
  parts,
  actions: composeFurnitureActions(EKET.AUTHORED_ACTIONS, EKET.FASTENER_RULES, parts, HARDWARE, EKET.CLUSTERS),
  gates: EKET.GATES,
  liaisons: buildLiaisons(parts),
  components: buildComponents(EKET.COMPONENTS, parts),
  clusters: EKET.CLUSTERS,
} as unknown as Furniture;

/** Play `steps` legal actions focused on `cluster` (guide mode, member cascade like the store), returning the completed set. */
function play(cluster: ClusterId, steps: number, done = new Set<ActionId>()): Set<ActionId> {
  for (let i = 0; i < steps; i++) {
    const next = availableInMode(f, done, "guide", cluster).find((a) => actionCluster(f, a) === cluster);
    if (!next) break;
    done.add(next.actionId);
    for (const m of memberPlaceIdsForLead(f.components, next.actionId)) done.add(m);
  }
  return done;
}

test("a fresh build keeps the chooser — no focus is derived from an empty save", () => {
  assert.equal(resumeFocusCluster(f, new Set()), null);
});

test("a mid-cabinet save resumes into the cabinet — the 24%-built relaunch case", () => {
  const done = play("cabinet" as ClusterId, 12);
  assert.ok(done.size > 6, "fixture underbuilt");
  assert.equal(resumeFocusCluster(f, done), "cabinet");
});

test("a save parked mid-drawer resumes into that drawer", () => {
  const done = play("cabinet" as ClusterId, 400);
  play("drawerA" as ClusterId, 3, done);
  assert.equal(resumeFocusCluster(f, done), "drawerA");
});

test("with every section built, no focus is derived — unfocused IS the combine stage", () => {
  const done = play("cabinet" as ClusterId, 400);
  play("drawerA" as ClusterId, 400, done);
  play("drawerB" as ClusterId, 400, done);
  assert.equal(resumeFocusCluster(f, done), null);
});
