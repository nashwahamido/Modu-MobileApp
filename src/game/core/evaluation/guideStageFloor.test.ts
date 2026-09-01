// Guide's stage offering must follow legally AVAILABLE work, not merely incomplete work — the bottom-first EKET deadlock (2026-08-25): built in free mode bottom-first (a legal order through the symmetric groove gates), then viewed in guide, topPanel (stage 1) gate-waits for backPanel (stage 2) while the old clusterCurrentStage pin kept guide at stage 1 — an empty offering forever ("Switch focus", bare tray, dimmed Top panel card at 24%). Real EKET fixture; the trap state is built by replay, not hand-listed, so it stays honest against composition changes.
import { test } from "node:test";
import assert from "node:assert/strict";

import { composeFurnitureActions } from "@/src/game/core/composition/composeActions";
import { composeLabels } from "@/src/game/core/composition/composeLabels";
import { applyStructure, buildLiaisons } from "@/src/game/core/model/liaisons";
import { buildComponents, memberPlaceIdsForLead } from "@/src/game/core/model/components";
import { availableInMode } from "./availability";
import { actionCluster } from "./clusters";
import { deriveSceneState } from "@/src/game/scene/useSceneState";
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
  labels: composeLabels(EKET.LABELS, parts, HARDWARE),
} as unknown as Furniture;

const CABINET = "cabinet" as ClusterId;
const doAction = (done: Set<ActionId>, id: ActionId) => {
  done.add(id);
  for (const m of memberPlaceIdsForLead(f.components, id)) done.add(m);
};

/** The trap state, replayed: bottom-first in FREE mode — bottom seed, both sides prepped over it, everything legal at each step. */
function bottomFirstTrap(): Set<ActionId> {
  const done = new Set<ActionId>();
  // deterministic bottom-first walk: always take the first legal cabinet action, seeded by placing the bottom before anything else
  doAction(done, "place_bottomPanel" as ActionId);
  for (let i = 0; i < 60; i++) {
    const avail = availableInMode(f, done, "free", CABINET).filter(
      (a) => actionCluster(f, a) === CABINET && a.actionId !== "place_backPanel" && a.actionId !== "place_topPanel",
    );
    if (!avail.length) break;
    doAction(done, avail[0].actionId);
  }
  assert.ok(done.has("place_sidePanelL" as ActionId) && done.has("place_sidePanelR" as ActionId), "trap fixture must reach both sides placed");
  assert.ok(!done.has("place_backPanel" as ActionId) && !done.has("place_topPanel" as ActionId), "trap fixture must leave back + top pending");
  return done;
}

test("bottom-first EKET in guide offers the back panel instead of deadlocking", () => {
  const done = bottomFirstTrap();
  const guide = availableInMode(f, done, "guide", CABINET);
  assert.ok(guide.length > 0, "guide offering must never be empty while legal cabinet work exists");
  assert.ok(guide.some((a) => a.actionId === "place_backPanel"), "the gate-mandated stage-2 back panel is the way forward");
});

test("the TRAY follows the offering: the trapped state shows an enabled Back panel card", () => {
  // The second half of the same deadlock: after the offering was fixed, the tray still filtered cards by its own incomplete-work stage (1), so the objective named the back panel while the tray showed nothing to grab.
  const done = bottomFirstTrap();
  const scene = deriveSceneState(f, [...done], null, "cabinet" as never, null, "guide");
  const back = scene.trayItems.find((t) => (t.group as string) === "backPanel");
  assert.ok(back, `expected a backPanel card, tray has: ${scene.trayItems.map((t) => t.group).join(", ") || "(none)"}`);
  assert.ok(back!.enabled, "the back panel card must be grabbable, not locked");
});

test("the stage floor never skips ahead of available same-stage work", () => {
  // fresh build: stage-1 work is available, so nothing beyond stage 1 may be offered — the floor equals the old behaviour whenever the current stage is workable
  const guide = availableInMode(f, new Set(), "guide", CABINET);
  assert.ok(guide.length > 0);
  assert.ok(guide.every((a) => a.stage === 1), `expected only stage-1 offerings, got ${guide.map((a) => `${a.actionId}(s${a.stage})`).join(", ")}`);
});
