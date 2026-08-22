import { strict as assert } from "node:assert";
import { test } from "node:test";

import { recordedRoomGuideStages, roomGuideVoicePath } from "./roomGuideVoice";

// The guide's stages, as RoomFirstPlacementGuide declares them. Copied rather than imported: that
// module pulls in React, expo-speech and the placement store, none of which node can load, and the
// type it exports is compile-time only. Keep this list in step with GuideStage there — the test
// below is what makes a drift visible.
const GUIDE_STAGES = [
  "idle",
  "style",
  "rotate",
  "reposition",
  "confirm",
  "complete",
] as const;

test("the table names no stage the guide does not have", () => {
  // The direction a rename breaks. A renamed stage leaves the old key here matching nothing, the
  // clip goes unplayed, and the guide quietly falls back to synthesis — which from the device looks
  // exactly like a storage problem rather than a code one.
  const known = new Set<string>(GUIDE_STAGES);
  const orphans = recordedRoomGuideStages().filter((stage) => !known.has(stage));

  assert.deepEqual(orphans, [], `clip mapped to unknown stage: ${orphans.join(", ")}`);
});

test("clip paths are the names uploaded to storage", () => {
  // Verified against the bucket on 2026-08-21. Transcribed, not derived: the clips are named for
  // what Lumi says and the stages for what the player does. Capital L in Lumi-room — storage is
  // case-sensitive.
  assert.equal(roomGuideVoicePath("style"), "Lumi-room/Lumi-your-lack.mp3");
  assert.equal(
    roomGuideVoicePath("reposition"),
    "Lumi-room/Lumi-happy-with-placement.mp3",
  );
  assert.equal(roomGuideVoicePath("rotate"), "Lumi-room/Lumi-that-looks-good.mp3");
  assert.equal(
    roomGuideVoicePath("confirm"),
    "Lumi-room/Lumi-everything-is-ready.mp3",
  );
  assert.equal(roomGuideVoicePath("complete"), "Lumi-room/Lumi-lack-placed.mp3");
});

test("every spoken stage of the guide has a clip", () => {
  // `idle` is the only stage without one, and it is the stage where the guide is not on screen at
  // all. Everything else is recorded — a stage added later without a recording shows up here rather
  // than as one card in the run quietly dropping to synthesis, which from the device is
  // indistinguishable from a storage problem.
  const missing = GUIDE_STAGES.filter(
    (stage) => stage !== "idle" && roomGuideVoicePath(stage) === null,
  );

  assert.deepEqual(missing, [], `no recorded clip for: ${missing.join(", ")}`);
  assert.equal(roomGuideVoicePath("idle"), null);
});

test("an absent stage is null, not a malformed path", () => {
  assert.equal(roomGuideVoicePath(undefined), null);
  assert.equal(roomGuideVoicePath(""), null);
  assert.equal(roomGuideVoicePath("no-such-stage"), null);
});