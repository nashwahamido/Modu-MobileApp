import { strict as assert } from "node:assert";
import { test } from "node:test";

import { stepVoicePath, VOICEOVER_BUCKET } from "./stepVoice";
import type { Furniture } from "@/src/game/core/type";

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