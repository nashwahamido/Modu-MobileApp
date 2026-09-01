import { strict as assert } from "node:assert";
import { test } from "node:test";

import { SCRIPT_BLOCKS, stepVoicePath } from "./stepVoice";
import { composeFurnitureActions } from "@/src/game/core/composition/composeActions";
import { composeLabels } from "@/src/game/core/composition/composeLabels";
import { applyStructure, type StructureOverlay } from "@/src/game/core/model/liaisons";
import { buildInstructions, instructionText } from "@/src/game/core/presentation/instructions";
import { HARDWARE } from "@/src/game/content/hardware";
import * as LACK from "@/src/game/content/furnitures/LACK/authored";
import { PARTS as LACK_PARTS } from "@/src/game/content/furnitures/LACK/parts.gen";
import * as BEKVAM from "@/src/game/content/furnitures/BEKVAM/authored";
import { PARTS as BEKVAM_PARTS } from "@/src/game/content/furnitures/BEKVAM/parts.gen";
import * as DALFRED from "@/src/game/content/furnitures/DALFRED/authored";
import { PARTS as DALFRED_PARTS } from "@/src/game/content/furnitures/DALFRED/parts.gen";
import * as EKET from "@/src/game/content/furnitures/EKET/authored";
import { PARTS as EKET_PARTS } from "@/src/game/content/furnitures/EKET/parts.gen";
import type { Furniture, PartDef, TextLevel } from "@/src/game/core/type";
import { COMPOSED } from "@/src/game/content/furnitures/composed";

type AuthoredLike = {
  AUTHORED_ACTIONS: never;
  FASTENER_RULES: never;
  STRUCTURE: never;
  LABELS: never;
  CLUSTERS?: never;
  BEATS?: never;
};

/** A block's clips, as `line number -> the sentence recorded at it`. Read from the shipped table so
 *  the test cannot drift from what the app resolves. */
function blockLines(id: string, level: TextLevel): Map<number, string> {
  const block = SCRIPT_BLOCKS[id]?.[level];
  assert.ok(block, `no voice block for ${id} ${level}`);
  return new Map(block.lines.map((text, i) => [block.firstLine + i, text]));
}

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
test("every block starts and ends where the script says, with the folder names as uploaded", () => {
  // Read off the shipped table rather than through a fixture. It used to borrow the LACK stand-in
  // and relabel its meta.id, which only worked while the clip number came from a POSITION — the
  // stand-in's sentences are not DALFRED's, and now that the number comes from the sentence, asking
  // a stand-in for another model's first clip is meaningless.
  //
  // The ranges are the UPLOADED files, probed against the live bucket on 24 Aug: each block's first
  // and last return 200, the numbers either side return 400, and all 113 files are present.
  const expected: [string, TextLevel, string, string, number, number][] = [
    ["lack-table", "standard", "LACK-Standard", "LACK-standard", 11, 14],
    // Capital S in the file name too — LACK's two blocks were uploaded with different casing.
    ["lack-table", "simple", "LACK-Simple", "LACK-Simple", 17, 20],
    // "dalferd", as uploaded.
    ["dalfred-stool", "standard", "dalferd-standard", "dalferd-standard", 68, 87],
    ["dalfred-stool", "simple", "dalferd-simple", "dalferd-simple", 90, 103],
    ["bekvam-stool", "standard", "bekvam-standard", "bekvam-standard", 241, 254],
    ["bekvam-stool", "simple", "bekvam-simple", "bekvam-simple", 257, 265],
    ["eket-cabinet", "standard", "eket-standard", "eket-standard", 377, 420],
    ["eket-cabinet", "simple", "eket-simple", "eket-simple", 423, 457],
  ];
  for (const [id, level, folder, prefix, first, last] of expected) {
    const block = SCRIPT_BLOCKS[id]?.[level];
    assert.ok(block, `no voice block for ${id} ${level}`);
    assert.equal(block.folder, folder);
    assert.equal(block.prefix, prefix);
    assert.equal(block.firstLine, first);
    assert.equal(block.firstLine + block.lines.length - 1, last, `${id} ${level} runs past its files`);
    // No sentence twice: the script lists each ONCE, and a duplicate would make indexOf pick the
    // earlier of two clips at random.
    assert.equal(new Set(block.lines).size, block.lines.length, `${id} ${level} has a repeated line`);
  }
});

// EVERY MODEL, EVERY STEP, AGAINST THE SENTENCE IT SPEAKS.
//
// The old tests here pinned a block's FIRST and LAST clip, which is what a wrong offset breaks. That
// caught nothing when the fault was ordering: both ends were right and the middle was scrambled —
// DALFRED was wrong from its first screw, EKET from its first runner screw, and every wrong number
// still resolved to a real file, so nothing 404'd and nothing fell back.
//
// So this checks the invariant that actually matters: the clip a step resolves to must be the clip
// that SAYS that step. Fixture composed exactly as instructionSim.test.ts does — what each model's
// index.ts does, minus the GLB and thumbnail requires node cannot parse — under the real furniture
// ids, because anything less would not be testing the numbers the app resolves.
const fixture = (id: string, m: AuthoredLike, raw: Record<string, PartDef>, composed: StructureOverlay): Furniture => {
  const parts = applyStructure(raw as never, composed);
  return {
    meta: { id },
    parts,
    actions: composeFurnitureActions(m.AUTHORED_ACTIONS, m.FASTENER_RULES, parts, HARDWARE, m.CLUSTERS),
    clusters: m.CLUSTERS,
    instructions: m.BEATS,
    labels: composeLabels(m.LABELS, parts, HARDWARE),
  } as unknown as Furniture;
};

const MODELS: { id: string; f: Furniture; counts: Record<TextLevel, number> }[] = [
  // The counts are the UPLOADED FILE counts, probed against the live bucket on 24 Aug: every block's
  // first and last file returns 200 and the numbers either side return 400. A model that grows a
  // step needs new audio, and this is the number that says so.
  { id: "lack-table", f: fixture("lack-table", LACK as never, LACK_PARTS as never, COMPOSED.LACK), counts: { standard: 4, simple: 4 } },
  { id: "dalfred-stool", f: fixture("dalfred-stool", DALFRED as never, DALFRED_PARTS as never, COMPOSED.DALFRED), counts: { standard: 20, simple: 14 } },
  { id: "bekvam-stool", f: fixture("bekvam-stool", BEKVAM as never, BEKVAM_PARTS as never, COMPOSED.BEKVAM), counts: { standard: 14, simple: 9 } },
  { id: "eket-cabinet", f: fixture("eket-cabinet", EKET as never, EKET_PARTS as never, COMPOSED.EKET), counts: { standard: 44, simple: 35 } },
];

for (const { id, f, counts } of MODELS) {
  for (const level of ["standard", "simple"] as TextLevel[]) {
    test(`${id} ${level}: every step resolves to the clip that speaks it`, () => {
      const set = buildInstructions(
        f.actions,
        f.parts as Record<string, PartDef>,
        f.labels,
        f.instructions!,
        f.clusters ?? {},
      );
      const block = blockLines(id, level);
      const used = new Set<number>();
      let checked = 0;
      for (const action of f.actions) {
        const text = instructionText(set, action.actionId, level);
        if (!text) continue;
        const path = stepVoicePath(f, action.actionId, level);
        assert.ok(path, `${id} ${level} ${action.actionId} has no clip for: ${text}`);
        const n = Number(path.slice(path.lastIndexOf("-") + 1, -4));
        // THE ASSERTION. The recording at that number must be this step's own sentence.
        assert.equal(
          block.get(n),
          text,
          `${id} ${level} ${action.actionId}: clip ${n} says ${JSON.stringify(block.get(n))} but the step says ${JSON.stringify(text)}`,
        );
        used.add(n);
        checked += 1;
      }
      assert.ok(checked > 0, `${id} ${level} produced no spoken steps`);
      // Every uploaded clip is reachable, and no step reaches past the end of its block. Repeats are
      // fine — four legs share one line — so this counts DISTINCT clips, which is the file count.
      assert.equal(
        used.size,
        counts[level],
        `${id} ${level} uses ${used.size} distinct clips but ${counts[level]} files are uploaded`,
      );
    });
  }
}