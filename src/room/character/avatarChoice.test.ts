import assert from "node:assert/strict";
import test from "node:test";

import { roomAvatarKindForProfile } from "./avatarChoice";

test("Control mode places Felix in the room", () => {
  assert.equal(roomAvatarKindForProfile("control"), "felix");
});

test("Visual mode places Lumi in the room", () => {
  assert.equal(roomAvatarKindForProfile("visual"), "lumi");
});

test("Momentum mode places Sparky in the room", () => {
  assert.equal(roomAvatarKindForProfile("momentum"), "sparky");
});

test("Clear Path mode places Pebble in the room", () => {
  assert.equal(roomAvatarKindForProfile("clearPath"), "pebble");
});
