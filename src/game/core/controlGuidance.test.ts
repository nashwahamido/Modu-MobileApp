import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTROL_GUIDANCE_PRESETS,
  controlGuidanceIsCustomized,
} from "./controlGuidance";
import { settingsForProfile } from "./profile";

test("Control profile starts from the Balanced support preset", () => {
  const settings = settingsForProfile("control");

  assert.equal(settings.controlGuidanceLevel, "balanced");
  for (const [key, value] of Object.entries(CONTROL_GUIDANCE_PRESETS.balanced)) {
    assert.equal(settings[key as keyof typeof settings], value);
  }
  assert.equal(controlGuidanceIsCustomized(settings), false);
});

test("an individual override keeps the selected level but marks it customized", () => {
  const settings = { ...settingsForProfile("control"), audio: true };

  assert.equal(settings.controlGuidanceLevel, "balanced");
  assert.equal(controlGuidanceIsCustomized(settings), true);
});
