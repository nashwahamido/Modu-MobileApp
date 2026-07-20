// Headless engine playthrough of a furniture — drives the REAL game store in strict mode to completion and prints each step's instruction text.
//   node --import tsx src/game/helper-scripts/engine-test.ts <ID>
(globalThis as never as Record<string, unknown>).__DEV__ = false;
import { applyStructure, buildLiaisons } from "@/src/game/core/model/liaisons";
import { buildComponents } from "@/src/game/core/model/components";
import { buildInstructions } from "@/src/game/core/presentation/instructions";
import { instructionText } from "@/src/game/core/presentation/instructions";
import { composeLabels } from "@/src/game/core/composition/composeLabels";
import { composeFurnitureActions } from "@/src/game/core/composition/composeActions";
import { labelFor } from "@/src/game/core/presentation/labels";
import { HARDWARE } from "@/src/game/data/hardware";
import { ActionId, Furniture, PartDef, PartId } from "@/src/game/core/type";

async function main() {
  const ID = process.argv[2];
  if (!ID) {
    console.error("usage: engine-test <ID>");
    process.exit(2);
  }

  const { useGameStore } = await import("@/src/game/core/store");
  const { PARTS } = await import(`@/src/game/data/furnitures/${ID}/parts.gen`);
  const authored = await import(`@/src/game/data/furnitures/${ID}/authored`);
  const { AUTHORED_ACTIONS, FASTENER_RULES, STRUCTURE, LABELS, CLUSTERS, BEATS } = authored;
  const GATES = authored.GATES ?? {};

  const P = applyStructure(PARTS, STRUCTURE);
  const ACTIONS = composeFurnitureActions(AUTHORED_ACTIONS, FASTENER_RULES, P, HARDWARE);
  const LIAISONS = buildLiaisons(P);
  const COMPONENTS = authored.COMPONENTS;
  const COMPONENTS_IDX = buildComponents(COMPONENTS, P);
  const LABELS_ALL = composeLabels(LABELS, P, HARDWARE);
  const INSTRUCTIONS = buildInstructions(ACTIONS, P as Record<string, PartDef>, LABELS_ALL, BEATS, CLUSTERS);

  const f = {
    meta: { id: ID }, parts: P, actions: ACTIONS, gates: GATES, liaisons: LIAISONS, components: COMPONENTS_IDX,
    clusters: CLUSTERS, instructions: INSTRUCTIONS,
  } as unknown as Furniture;

  const s = () => useGameStore.getState();
  s().loadFurniture(f);
  s().setMode("strict");

  const partLabel = (pid: PartId) => labelFor(LABELS_ALL, P[pid]!.group);

  // `completeAction` is guarded by `available()`, so an action the engine offers but refuses to complete would spin the loop on the same step forever — cap it well above any legitimate playthrough.
  const limit = ACTIONS.length * 3;
  let step = 0;
  let lastCluster = "";
  while (s().completed.length < ACTIONS.length && step < limit) {
    const a = s().availableForMode()[0];
    if (!a) break;
    const cl = a.partId ? P[a.partId]?.cluster : (a as { cluster?: string }).cluster;
    if (cl && cl !== lastCluster) { console.log(`\n── ${cl} ──`); lastCluster = cl; }
    step++;
    const txt = instructionText(INSTRUCTIONS, a.actionId, "standard") || a.actionId;
    console.log(`${String(step).padStart(3)}. [${a.type.replace("Fastener", "").replace("Part", "")}] ${txt}`);

    if (a.type === "placePart") {
      // the real interactive path: pickup → fit → release
      s().beginPickup(a.actionId as ActionId);
      s().setDragFit("nearCorrect", null);
      s().releaseHeld();
      if (!s().completed.includes(a.actionId as ActionId)) s().completeAction(a.actionId as ActionId);
    } else {
      s().completeAction(a.actionId as ActionId);
    }
  }
  const doneCount = s().completed.length;
  const built = doneCount === ACTIONS.length;
  console.log(`\nplayed ${step} steps, ${doneCount}/${ACTIONS.length} actions — ${built ? "BUILT ✓" : "STUCK ✗"}`);
  if (!built) {
    // what the engine never offered — the authored gate/liaison that stalled the build is almost always on one of these parts
    const done = new Set(s().completed);
    const blocked = ACTIONS.filter((x) => !done.has(x.actionId));
    console.log(`blocked=[${blocked.map((x) => (x.partId ? partLabel(x.partId) : x.actionId)).join(", ")}]`);
  }
  process.exit(built ? 0 : 1);
}
main();
