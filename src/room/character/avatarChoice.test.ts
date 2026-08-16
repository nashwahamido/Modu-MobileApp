import assert from "node:assert/strict";
import test from "node:test";

import { roomAvatarKindForProfile } from "./avatarChoice";

test("Control mode places Felix in the room", () => {
  assert.equal(roomAvatarKindForProfile("control"), "felix");
});

test("every non-Felix recommendation places Sparky in the room", () => {
  assert.equal(roomAvatarKindForProfile("visual"), "sparky");
  assert.equal(roomAvatarKindForProfile("momentum"), "sparky");
  assert.equal(roomAvatarKindForProfile("clearPath"), "sparky");
});
