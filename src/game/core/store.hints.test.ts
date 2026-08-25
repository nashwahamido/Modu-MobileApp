import { test } from "node:test";
import assert from "node:assert/strict";
import { useGameStore } from "./store";
import { availableActions, openWayCount } from "./evaluation/availability";
import { LACK_FIXTURE, EKET_FIXTURE } from "@/src/game/content/furnitures/fixtures.testutil";
import { buildInstructions } from "@/src/game/core/presentation/instructions";
import { LABELS as LACK_LABELS, BEATS as LACK_BEATS, CLUSTERS as LACK_CLUSTERS } from "@/src/game/content/furnitures/LACK/authored";
import type { ActionId, ClusterId, Furniture } from "@/src/game/core/type";

// fixtures.testutil.ts hard-codes `instructions: {}` on every fixture (it exists to drive availability/evaluation tests, not step wording), so instructionText([]) is always "" against LACK_FIXTURE/EKET_FIXTURE as-is. Spot's text path has real content to exercise, so this builds instructions over the fixture's own composed actions/parts using the raw authored LABELS map — unlike LACK/index.ts, which first runs LABELS through composeLabels() to add hardware/part-derived entries before calling buildInstructions; the raw map is enough here only because tableTop, the action this file exercises, already has an entry in it.
const LACK_WITH_TEXT: Furniture = {
  ...LACK_FIXTURE,
  instructions: buildInstructions(LACK_FIXTURE.actions, LACK_FIXTURE.parts, LACK_LABELS, LACK_BEATS, LACK_CLUSTERS),
};

/** Put the store in free mode on a fresh furniture with the given steps done. */
function setup(f: Furniture, completed: ActionId[] = [], patch: Record<string, unknown> = {}): void {
  useGameStore.setState({
    furniture: f,
    completed,
    mode: "free",
    hint: null,
    hintTone: "info",
    hintGroup: null,
    hintPartId: null,
    settings: { ...useGameStore.getState().settings, softHints: true, focusMode: false, textLevel: "standard" },
    ...patch,
  } as never);
}

/** Any action that is NOT currently available — the thing a blocked grab reaches for. */
function firstBlocked(f: Furniture, completed: ActionId[]): ActionId {
  const open = new Set(availableActions(f, new Set(completed)).map((a) => a.actionId));
  const blocked = f.actions.find(
    (a) => !open.has(a.actionId) && !completed.includes(a.actionId),
  );
  assert.ok(blocked, "fixture should have at least one blocked action at the start");
  return blocked.actionId;
}

test("a blocked grab goes generic when several ways are open (EKET, 5 open)", () => {
  assert.ok(
    openWayCount(EKET_FIXTURE, new Set<ActionId>()) > 1,
    "EKET must offer several ways at the start for this test to mean anything",
  );
  setup(EKET_FIXTURE);
  useGameStore.getState().noteBlocked(firstBlocked(EKET_FIXTURE, []));
  assert.equal(useGameStore.getState().hint, "Something else comes first.");
  assert.equal(useGameStore.getState().hintTone, "error");
});

test("a blocked grab NAMES the blocker when only one way is open (LACK, 1 open)", () => {
  assert.equal(
    openWayCount(LACK_FIXTURE, new Set<ActionId>()),
    1,
    "LACK must offer exactly one way at the start for this test to mean anything",
  );
  setup(LACK_FIXTURE);
  useGameStore.getState().noteBlocked(firstBlocked(LACK_FIXTURE, []));
  const hint = useGameStore.getState().hint;
  assert.ok(hint && hint !== "Something else comes first.", `expected a named blocker, got ${hint}`);
  assert.match(hint!, /first\.$/);
  assert.equal(useGameStore.getState().hintTone, "error");
});

test("focus mode silences the blocked hint entirely", () => {
  setup(LACK_FIXTURE, [], {
    settings: { ...useGameStore.getState().settings, softHints: true, focusMode: true },
  });
  useGameStore.getState().noteBlocked(firstBlocked(LACK_FIXTURE, []));
  assert.equal(useGameStore.getState().hint, null);
});

test("softHints off still silences the blocked hint", () => {
  setup(LACK_FIXTURE, [], {
    settings: { ...useGameStore.getState().settings, softHints: false, focusMode: false },
  });
  useGameStore.getState().noteBlocked(firstBlocked(LACK_FIXTURE, []));
  assert.equal(useGameStore.getState().hint, null);
});

test("an available action sets no hint at all", () => {
  setup(LACK_FIXTURE);
  const open = availableActions(LACK_FIXTURE, new Set())[0];
  useGameStore.getState().noteBlocked(open.actionId);
  assert.equal(useGameStore.getState().hint, null);
});

test("? with several targets goes plural and names no step", () => {
  assert.ok(openWayCount(EKET_FIXTURE, new Set<ActionId>()) > 1, "EKET must offer several ways at the start for this test to mean anything");
  // EKET requires an active cluster focus before availableForMode surfaces anything; "cabinet" is the cluster with three open ways at the start (sidePanelL, topPanel, bottomPanel).
  setup(EKET_FIXTURE, [], { activeCluster: "cabinet" });
  useGameStore.getState().suggestNext("hint");
  const s = useGameStore.getState();
  assert.equal(s.hint, "Try one of the highlighted parts.");
  assert.equal(s.hintTone, "info");
  assert.ok(s.hintGroups.length + s.hintParts.length > 0, "something must be highlighted");
  // The concrete instruction text is gone: no step name survives anywhere in the toast.
  assert.ok(!s.hint!.startsWith("Try: "));
});

test("? with one target goes singular and names no step", () => {
  assert.equal(openWayCount(LACK_FIXTURE, new Set<ActionId>()), 1, "LACK must offer exactly one way at the start for this test to mean anything");
  setup(LACK_FIXTURE);
  useGameStore.getState().suggestNext("hint");
  const s = useGameStore.getState();
  assert.equal(s.hint, "Try the highlighted part.");
  assert.equal(s.hintTone, "info");
  assert.ok(!s.hint!.startsWith("Try: "));
});

test("? marks the screw waiting to be tightened even while its group still has a card in the tray", () => {
  // THE TUTORIAL'S OWN STATE, and the one the group-wide rule got wrong: one bolt inserted, three still in the box. The tighten of bolt 1 is available and card-less, and the inserts of bolts 2-4 are available and carded — all four in group bolt115980. Marking the scene only when NO action of a group has a card left the one move actually in front of the player, the screw in its hole, as the single unlit thing on the screen.
  const done = [actionNamed(LACK_FIXTURE, "place_tableTop"), actionNamed(LACK_FIXTURE, "insert_bolt115980_1")];
  setup(LACK_FIXTURE, done);
  const avail = useGameStore.getState().availableForMode();
  const tighten = avail.find((a) => a.actionId === actionNamed(LACK_FIXTURE, "tighten_bolt115980_1"));
  const insert = avail.find((a) => a.actionId === actionNamed(LACK_FIXTURE, "insert_bolt115980_2"));
  assert.ok(tighten && insert, "this state must offer BOTH a card-less tighten and a carded insert of the same group, or the test is not exercising the collision it claims to");
  assert.equal(LACK_FIXTURE.parts[tighten.partId!].group, LACK_FIXTURE.parts[insert.partId!].group, "guard: the two actions must share a group — that sharing is the whole bug");
  useGameStore.getState().suggestNext("hint");
  const s = useGameStore.getState();
  assert.ok(s.hintParts.includes(tighten.partId!), `the screw to tighten must be marked in the scene, got ${JSON.stringify(s.hintParts)}`);
  assert.ok(s.hintGroups.includes(LACK_FIXTURE.parts[insert.partId!].group!), "the tray card for the bolts still in the box stays lit — both moves are legal");
});

test("a group whose every available action is carded marks nothing in the scene", () => {
  // The other side of the per-action rule: at the start LACK offers one carded placePart and nothing card-less, so a per-action split must not start marking parts that already have a card to point at.
  setup(LACK_FIXTURE);
  useGameStore.setState({ hintParts: ["seedPart"] } as never);
  useGameStore.getState().suggestNext("hint");
  assert.deepEqual(useGameStore.getState().hintParts, []);
});

test("? still works in focus mode — the tutorial's hint button depends on it", () => {
  setup(LACK_FIXTURE, [], {
    settings: { ...useGameStore.getState().settings, focusMode: true },
  });
  useGameStore.getState().suggestNext("hint");
  assert.ok(useGameStore.getState().hint);
});

test("? with nothing available reports the area is done", () => {
  const all = LACK_FIXTURE.actions.map((a) => a.actionId);
  setup(LACK_FIXTURE, all);
  useGameStore.getState().suggestNext("hint");
  assert.equal(useGameStore.getState().hint, "This area is done — switch focus.");
});

test("? bumps hintPulse so a repeat press re-flashes", () => {
  setup(LACK_FIXTURE);
  const before = useGameStore.getState().hintPulse;
  useGameStore.getState().suggestNext("hint");
  assert.equal(useGameStore.getState().hintPulse, before + 1);
});

test("Spot is untouched — it still names the step and sets the single-part fields", () => {
  setup(LACK_WITH_TEXT, [], { profile: "momentum" });
  // Seed a fake scene-part highlight directly: this test also checks Spot CLEARS hintParts, and hintParts is already [] straight out of setup, so asserting it stays [] afterward would prove nothing without a genuine non-empty starting point.
  useGameStore.setState({ hintParts: ["seedPart"] } as never);
  assert.ok(useGameStore.getState().hintParts.length > 0, "must be non-empty before Spot runs for this test to bite");
  useGameStore.getState().suggestNext("spot");
  const s = useGameStore.getState();
  assert.ok(s.hint?.startsWith("Try: "), `expected concrete Spot text, got ${s.hint}`);
  assert.ok(s.hintPartId, "Spot sets the single-part spotlight");
  assert.deepEqual(s.hintGroups, [], "Spot does not use the ? highlight list");
  assert.deepEqual(s.hintParts, []);
});

test("Spot demonstrates the screw already in the hole, not a leg still in the box", () => {
  // Spot took avail[0], which on LACK is a leg from the first tighten onwards — so a player halfway through the next bolt was shown a ghost fetching a different part entirely. See nextAction.test.ts for the ordering underneath.
  const done = ["place_tableTop", "insert_bolt115980_1", "tighten_bolt115980_1", "insert_bolt115980_2"].map(
    (a) => actionNamed(LACK_WITH_TEXT, a),
  );
  setup(LACK_WITH_TEXT, done, { profile: "momentum" });
  useGameStore.getState().suggestNext("spot");
  const s = useGameStore.getState();
  assert.equal(s.hintPartId, "bolt115980_2", `expected the pending screw, got ${s.hintPartId}`);
  // A tighten is not a pickup, so there is no card to flash — the demonstration is entirely in the scene.
  assert.equal(s.hintGroup, null);
});

test("clearHint drops the ? highlight groups", () => {
  setup(LACK_FIXTURE);
  useGameStore.getState().suggestNext("hint");
  useGameStore.getState().clearHint();
  assert.deepEqual(useGameStore.getState().hintGroups, []);
});

test("clearSpot drops the Spot spotlight", () => {
  setup(LACK_FIXTURE);
  useGameStore.getState().suggestNext("spot");
  assert.ok(useGameStore.getState().hintPartId, "Spot must set hintPartId for this test to mean anything");
  useGameStore.getState().clearSpot();
  assert.equal(useGameStore.getState().hintPartId, null);
});

/** Every action except the cluster combines — the state where the build is assembled and only the combine stage is left. */
function allButCombines(f: Furniture): ActionId[] {
  return f.actions.filter((a) => a.type !== "combineClusters").map((a) => a.actionId);
}

test("? at the combine stage highlights SECTIONS, not parts", () => {
  const done = allButCombines(EKET_FIXTURE);
  setup(EKET_FIXTURE, done);
  const avail = useGameStore.getState().availableForMode();
  assert.ok(avail.length > 0, "the combine stage must offer something for this test to mean anything");
  assert.ok(avail.every((a) => !a.partId), "every combine action must be partless — that is what makes this case special");
  // Seed fake tray-card and scene-part highlights directly: this test also checks the combine-stage hint clears both lists, and they are already [] straight out of setup, so asserting they stay [] afterward would prove nothing without a genuine non-empty starting point.
  useGameStore.setState({ hintGroups: ["seedGroup"], hintParts: ["seedPart"] } as never);
  useGameStore.getState().suggestNext("hint");
  const s = useGameStore.getState();
  assert.ok(s.hintClusters.length > 0, "the combinable clusters must be highlighted");
  assert.match(s.hint!, /highlighted section/);
  assert.deepEqual(s.hintGroups, [], "no tray-card groups exist at the combine stage");
  assert.deepEqual(s.hintParts, [], "no scene parts exist at the combine stage");
  assert.equal(s.hintTone, "info");
});

test("? never claims a highlight when nothing at all can be highlighted", () => {
  const done = allButCombines(EKET_FIXTURE);
  setup(EKET_FIXTURE, done);
  useGameStore.getState().suggestNext("hint");
  const s = useGameStore.getState();
  const highlighted = s.hintGroups.length + s.hintParts.length + s.hintClusters.length;
  // The invariant that finding #1 was about: the word "highlighted" may only appear when something actually is.
  if (s.hint?.includes("highlighted")) {
    assert.ok(highlighted > 0, `hint claimed a highlight but nothing was highlighted: ${s.hint}`);
  }
});

test("clearHint drops the cluster highlights too", () => {
  setup(EKET_FIXTURE, allButCombines(EKET_FIXTURE));
  useGameStore.getState().suggestNext("hint");
  assert.ok(useGameStore.getState().hintClusters.length > 0, "must be non-empty before the clear for this test to bite");
  useGameStore.getState().clearHint();
  assert.deepEqual(useGameStore.getState().hintClusters, []);
});

test("Spot does not use the cluster highlight list", () => {
  setup(EKET_FIXTURE, allButCombines(EKET_FIXTURE));
  // Seed a real cluster highlight first: this test is about Spot CLEARING the ? lists, so starting from an already-empty state would assert nothing.
  useGameStore.getState().suggestNext("hint");
  assert.ok(useGameStore.getState().hintClusters.length > 0, "must be non-empty before Spot runs for this test to bite");
  useGameStore.getState().suggestNext("spot");
  assert.deepEqual(useGameStore.getState().hintClusters, []);
});

/** The state where the build is fully assembled except for its tighten steps — the tool-using stretch at the end. */
function onlyTightensLeft(f: Furniture): ActionId[] {
  return f.actions.filter((a) => a.type !== "tightenFastener").map((a) => a.actionId);
}

/** setup() with manual tools forced on or off — the toolbox only exists in manual mode. */
function setupTools(f: Furniture, completed: ActionId[], manualTools: boolean): void {
  setup(f, completed, {
    settings: { ...useGameStore.getState().settings, manualTools },
  });
}

test("? names the tool the next step needs", () => {
  const done = onlyTightensLeft(EKET_FIXTURE);
  setupTools(EKET_FIXTURE, done, true);
  const avail = useGameStore.getState().availableForMode();
  const wanted = avail.find((a) => a.tool && a.tool !== "hand")?.tool;
  assert.ok(wanted, "this fixture state must offer a tool-using step for the test to mean anything");
  useGameStore.getState().suggestNext("hint");
  assert.equal(useGameStore.getState().hintTool, wanted);
});

test("? never names a tool when manual tools are off — there is no bar to light", () => {
  setupTools(EKET_FIXTURE, onlyTightensLeft(EKET_FIXTURE), false);
  useGameStore.getState().suggestNext("hint");
  assert.equal(useGameStore.getState().hintTool, null);
});

test("? names no tool during ordinary pickup steps", () => {
  setupTools(LACK_FIXTURE, [], true);
  // Seed a stale tool hint: without this the assertion is already true before the call and proves nothing — three earlier rounds in this file were spent removing exactly that shape of test.
  useGameStore.setState({ hintTool: "screwdriver" } as never);
  useGameStore.getState().suggestNext("hint");
  assert.equal(useGameStore.getState().hintTool, null);
});

test("clearHint drops the tool highlight", () => {
  setupTools(EKET_FIXTURE, onlyTightensLeft(EKET_FIXTURE), true);
  useGameStore.getState().suggestNext("hint");
  assert.ok(useGameStore.getState().hintTool, "must be set before the clear for this test to bite");
  useGameStore.getState().clearHint();
  assert.equal(useGameStore.getState().hintTool, null);
});

test("Spot does not use the tool highlight", () => {
  setupTools(EKET_FIXTURE, onlyTightensLeft(EKET_FIXTURE), true);
  useGameStore.getState().suggestNext("hint");
  assert.ok(useGameStore.getState().hintTool, "must be set before Spot runs for this test to bite");
  useGameStore.getState().suggestNext("spot");
  assert.equal(useGameStore.getState().hintTool, null);
});

test("finishing a tool-using step clears the equipped tool so the next one is chosen again", () => {
  setupTools(EKET_FIXTURE, onlyTightensLeft(EKET_FIXTURE), true);
  const step = useGameStore.getState().availableForMode().find((a) => a.tool && a.tool !== "hand");
  assert.ok(step, "this fixture state must offer a tool-using step for the test to mean anything");
  useGameStore.setState({ selectedTool: step.tool! } as never);
  assert.equal(useGameStore.getState().selectedTool, step.tool, "must be equipped before the call for this test to bite");
  useGameStore.getState().completeAction(step.actionId);
  assert.equal(useGameStore.getState().selectedTool, null);
});

test("auto mode leaves the equipped tool alone — the player never picked it", () => {
  setupTools(EKET_FIXTURE, onlyTightensLeft(EKET_FIXTURE), false);
  const step = useGameStore.getState().availableForMode().find((a) => a.tool && a.tool !== "hand");
  assert.ok(step, "this fixture state must offer a tool-using step for the test to mean anything");
  useGameStore.setState({ selectedTool: step.tool! } as never);
  useGameStore.getState().completeAction(step.actionId);
  assert.equal(useGameStore.getState().selectedTool, step.tool);
});

test("finishing a step that needs no tool keeps the pick for the step after it", () => {
  setupTools(LACK_FIXTURE, [], true);
  const step = useGameStore.getState().availableForMode().find((a) => !a.tool || a.tool === "hand");
  assert.ok(step, "this fixture state must offer a tool-free step for the test to mean anything");
  useGameStore.setState({ selectedTool: "screwdriver" } as never);
  useGameStore.getState().completeAction(step.actionId);
  assert.equal(useGameStore.getState().selectedTool, "screwdriver");
});

/** Look up an action by its literal id string, typed as this fixture's own ActionId — for reaching a specific named step rather than an arbitrary "first open one". */
function actionNamed(f: Furniture, actionId: string): ActionId {
  const found = f.actions.find((a) => (a.actionId as string) === actionId);
  assert.ok(found, `fixture must contain an action named ${actionId} for this lookup to mean anything`);
  return found.actionId;
}

test("finishing a HAND-tightened step keeps the pick for the step after it — the guard the previous test never reached", () => {
  // place_tableTop + insert_bolt115980_1 is the minimal completed set that makes tighten_bolt115980_1 available; bolt115980 is a HARDWARE entry with tool: "hand", so this reaches an available action whose tool is literally the string "hand", not undefined — the case the pickup-based test above cannot exercise since `!!finished?.tool` already excludes undefined before `finished.tool !== "hand"` is ever evaluated.
  setupTools(LACK_FIXTURE, [actionNamed(LACK_FIXTURE, "place_tableTop"), actionNamed(LACK_FIXTURE, "insert_bolt115980_1")], true);
  const step = useGameStore.getState().availableForMode().find((a) => a.actionId === actionNamed(LACK_FIXTURE, "tighten_bolt115980_1"));
  assert.ok(step, "this fixture state must offer the hand-tightened bolt step for the test to mean anything");
  assert.equal(step.tool, "hand", "the picked step must genuinely be hand-tooled, or this test is not exercising the guard it claims to");
  useGameStore.setState({ selectedTool: "screwdriver" } as never);
  assert.equal(useGameStore.getState().selectedTool, "screwdriver", "must be equipped before the call for this test to bite");
  useGameStore.getState().completeAction(step.actionId);
  assert.equal(useGameStore.getState().selectedTool, "screwdriver");
});

test("? at a tool-using step tells the player to pick a tool, outranking the part/section wording", () => {
  const done = onlyTightensLeft(EKET_FIXTURE);
  setupTools(EKET_FIXTURE, done, true);
  const avail = useGameStore.getState().availableForMode();
  const wanted = avail.find((a) => a.tool && a.tool !== "hand")?.tool;
  assert.ok(wanted, "this fixture state must offer a tool-using step for the test to mean anything");
  useGameStore.getState().suggestNext("hint");
  const s = useGameStore.getState();
  // Guard: hintTool must genuinely be set by this call — this is the premise the toast text is supposed to key off of, not an artifact of stale state.
  assert.equal(s.hintTool, wanted, "guard: hintTool must be genuinely set for this test to bite");
  assert.equal(s.hint, "Pick a tool from the toolbox.");
});

test("? at the same tool-using step falls back to part/section wording when manual tools are off", () => {
  const done = onlyTightensLeft(EKET_FIXTURE);
  setupTools(EKET_FIXTURE, done, false);
  const avail = useGameStore.getState().availableForMode();
  const wanted = avail.find((a) => a.tool && a.tool !== "hand")?.tool;
  assert.ok(wanted, "this fixture state must offer a tool-using step for the test to mean anything, same as the manual-tools-on case above");
  // Seed a stale tool line so a bug that hardcodes the toolbox sentence regardless of hintTool would still show it and fail this assertion.
  useGameStore.setState({ hint: "Pick a tool from the toolbox." } as never);
  useGameStore.getState().suggestNext("hint");
  const s = useGameStore.getState();
  assert.equal(s.hintTool, null, "manual tools off must never set hintTool");
  assert.notEqual(s.hint, "Pick a tool from the toolbox.", "with no tool to equip, the toolbox line must not appear — this pins the priority to hintTool, not to a tool-using step merely existing");
});
