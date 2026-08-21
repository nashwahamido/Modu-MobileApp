import { strict as assert } from "node:assert";
import { test } from "node:test";

import { stepVoicePath, VOICEOVER_BUCKET } from "./stepVoice";
import { composeFurnitureActions } from "@/src/game/core/composition/composeActions";
import { composeLabels } from "@/src/game/core/composition/composeLabels";
import { applyStructure } from "@/src/game/core/model/liaisons";
import { buildInstructions, instructionText } from "@/src/game/core/presentation/instructions";
import { HARDWARE } from "@/src/game/content/hardware";
import * as EKET from "@/src/game/content/furnitures/EKET/authored";
import { PARTS as EKET_PARTS } from "@/src/game/content/furnitures/EKET/parts.gen";
import type { ActionId, Furniture, PartDef } from "@/src/game/core/type";

// A stand-in LACK: the real module requires GLBs and PNGs, which node cannot parse. What matters
// here is the SHAPE — repeated actions sharing one line, in authored order — not the geometry.
const lack = {
  meta: { id: "lack-table" },
  parts: {},
  labels: { leg: { standard: "Leg", simple: "Leg" }, bolt: { standard: "Bolt", simple: "Bolt" } },
  clusters: {},
  instructions: {
    place_tableTop: { text: "Place the Table top into position.", simpleText: "Add the Top." },
    place_leg_1: { text: "Place the Leg into position.", simpleText: "Add the Leg." },
    place_leg_2: { text: "Place the Leg into position.", simpleText: "Add the Leg." },
    insert_bolt_1: { text: "Push the Bolt into its hole by hand.", simpleText: "Start the Bolt by hand." },
    tighten_bolt_1: { text: "Tighten the Bolt by hand.", simpleText: "Tighten the Bolt." },
  },
  actions: [
    { actionId: "place_tableTop", type: "placePart" },
    { actionId: "place_leg_1", type: "placePart" },
    { actionId: "place_leg_2", type: "placePart" },
    { actionId: "insert_bolt_1", type: "insertFastener" },
    { actionId: "tighten_bolt_1", type: "tightenFastener" },
  ],
} as unknown as Furniture;

test("the first LACK line is clip 11 — the line it occupies in the script", () => {
  assert.equal(
    stepVoicePath(lack, "place_tableTop" as never, "standard"),
    "LACK-Standard/LACK-standard-11.mp3",
  );
});

test("a line said more than once is ONE clip, played for every action that says it", () => {
  const first = stepVoicePath(lack, "place_leg_1" as never, "standard");
  const second = stepVoicePath(lack, "place_leg_2" as never, "standard");
  assert.equal(first, second);
  assert.equal(first, "LACK-Standard/LACK-standard-12.mp3");
});

test("numbering follows the DEDUPED list, not the action index", () => {
  // insert_bolt_1 is the FOURTH action but the THIRD distinct line, so it is clip 13 and not 14.
  assert.equal(
    stepVoicePath(lack, "insert_bolt_1" as never, "standard"),
    "LACK-Standard/LACK-standard-13.mp3",
  );
  assert.equal(
    stepVoicePath(lack, "tighten_bolt_1" as never, "standard"),
    "LACK-Standard/LACK-standard-14.mp3",
  );
});

test("simple has its own block, and its own offset", () => {
  // The simple wording differs, so the two levels cannot share a clip even for the same action.
  assert.equal(
    stepVoicePath(lack, "place_tableTop" as never, "simple"),
    "LACK-Simple/LACK-Simple-17.mp3",
  );
});

test("an action the furniture does not have has no clip", () => {
  // Null, not a guessed number: a number here would point at whatever clip sits at that index and
  // play the wrong instruction confidently.
  assert.equal(stepVoicePath(lack, "no_such_action" as never, "standard"), null);
});

test("a model with no recordings has no clip", () => {
  const unknown = { ...lack, meta: { id: "not-recorded" } } as unknown as Furniture;
  assert.equal(stepVoicePath(unknown, "place_tableTop" as never, "standard"), null);
});

// The four verified blocks, transcribed from the script and cross-checked against the uploaded
// files. These are the numbers a recording session produced; if a step is re-worded the script has
// to be regenerated and these move, and this test is what says so out loud rather than the app
// quietly playing the line next door.
test("the verified blocks start where the script says they do", () => {
  const first = (id: string, level: "standard" | "simple") =>
    stepVoicePath({ ...lack, meta: { id } } as never, "place_tableTop" as never, level);

  assert.equal(first("lack-table", "standard"), "LACK-Standard/LACK-standard-11.mp3");
  // Capital S in the file name too — LACK's two blocks were uploaded with different casing.
  assert.equal(first("lack-table", "simple"), "LACK-Simple/LACK-Simple-17.mp3");
  assert.equal(first("dalfred-stool", "standard"), "dalferd-standard/dalferd-standard-68.mp3");
  assert.equal(first("dalfred-stool", "simple"), "dalferd-simple/dalferd-simple-90.mp3");
  assert.equal(first("bekvam-stool", "standard"), "bekvam-standard/bekvam-standard-241.mp3");
  assert.equal(first("bekvam-stool", "simple"), "bekvam-simple/bekvam-simple-257.mp3");
  // EKET is checked separately, against its REAL line list rather than the stand-in — see below.
});

// EKET, against the actual authored content instead of the stand-in above, because it is the block
// that was wrong: both its levels were out by 20, and standard's wrong numbers were all real files,
// so it played the wrong step twenty lines late rather than falling back. A first-line assertion
// alone would not have caught that a re-worded step had moved the END of the block into the next
// one, so this pins the LAST line too — which is the same thing as pinning the count.
//
// Composed the way instructionSim.test.ts composes its fixtures: exactly what EKET/index.ts does,
// minus the GLB and thumbnail requires that node cannot parse. It is the same id as the real module,
// which is the point — anything less would not be testing the numbers the app actually resolves.
const eket = (() => {
  const parts = applyStructure(EKET_PARTS, EKET.STRUCTURE);
  return {
    meta: { id: "eket-cabinet" },
    parts,
    actions: composeFurnitureActions(
      EKET.AUTHORED_ACTIONS,
      EKET.FASTENER_RULES,
      parts,
      HARDWARE,
      EKET.CLUSTERS,
    ),
    clusters: EKET.CLUSTERS,
    instructions: EKET.BEATS,
    labels: composeLabels(EKET.LABELS, parts, HARDWARE),
  } as unknown as Furniture;
})();

/** EKET's deduped line list, rebuilt here the same way linesFor does — action order, first
 *  occurrence wins. Used to reach the LAST line without hard-coding which action says it. */
function eketLines(level: "standard" | "simple"): ActionId[] {
  const set = buildInstructions(
    eket.actions,
    eket.parts as Record<string, PartDef>,
    eket.labels,
    eket.instructions,
    eket.clusters ?? {},
  );
  const seen = new Set<string>();
  const firstSayers: ActionId[] = [];
  for (const a of eket.actions) {
    const text = instructionText(set, a.actionId, level);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    firstSayers.push(a.actionId);
  }
  return firstSayers;
}

test("EKET standard covers script lines 377 to 420, one clip per distinct line", () => {
  const lines = eketLines("standard");
  // 44 distinct lines against 44 uploaded files. If this number moves, the script has been re-worded
  // and the recordings need regenerating — the offset alone will no longer save it.
  assert.equal(lines.length, 44);
  assert.equal(stepVoicePath(eket, lines[0], "standard"), "eket-standard/eket-standard-377.mp3");
  assert.equal(stepVoicePath(eket, lines[43], "standard"), "eket-standard/eket-standard-420.mp3");
});

test("EKET simple covers script lines 423 to 457, one clip per distinct line", () => {
  const lines = eketLines("simple");
  assert.equal(lines.length, 35);
  assert.equal(stepVoicePath(eket, lines[0], "simple"), "eket-simple/eket-simple-423.mp3");
  assert.equal(stepVoicePath(eket, lines[34], "simple"), "eket-simple/eket-simple-457.mp3");
});

test("a repeated EKET line resolves to ONE clip, at both levels", () => {
  // The two runner brackets say the same simple line ("Add the Bracket.") while their standard
  // wording differs by side — so simple has fewer clips than standard, and the dedupe is what keeps
  // the two blocks numbered independently rather than one following the other's positions.
  assert.ok(eketLines("simple").length < eketLines("standard").length);
});

test("the misspelled DALFRED folder is preserved, not corrected", () => {
  // The bucket has "dalferd". Storage is case- and spelling-sensitive, so the code has to match the
  // upload rather than the model's real name — fixing the spelling here would break playback.
  const p = stepVoicePath(
    { ...lack, meta: { id: "dalfred-stool" } } as never,
    "place_tableTop" as never,
    "standard",
  );
  assert.ok(p?.startsWith("dalferd-"), "must use the folder name as uploaded");
});

test("the bucket name is capitalised, as storage has it", () => {
  assert.equal(VOICEOVER_BUCKET, "Voiceover");
});