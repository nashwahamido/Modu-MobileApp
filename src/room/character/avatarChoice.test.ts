import assert from "node:assert/strict";
import test from "node:test";

import { roomAvatarKindForProfile } from "./avatarChoice";

test("Control mode places Felix in the room", () => {
  assert.equal(roomAvatarKindForProfile("control"), "felix");
});

test("Visual mode places Lumi in the room", () => {
  assert.equal(roomAvatarKindForProfile("visual"), "lumi");
});

test("Momentum and the Clear Path fallback use Sparky", () => {
  assert.equal(roomAvatarKindForProfile("momentum"), "sparky");
  assert.equal(roomAvatarKindForProfile("clearPath"), "sparky");
});
