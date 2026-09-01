import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";

import {
  currentOwner,
  requestSlot,
  resetSceneSlot,
  settleSlot,
  withdrawSlot,
} from "./sceneSlot";

afterEach(() => resetSceneSlot());

describe("sceneSlot", () => {
  it("grants the slot to a lone claimant", () => {
    requestSlot("room");
    assert.equal(currentOwner(), "room");
  });

  it("revokes before it grants, so the two scenes never overlap", () => {
    requestSlot("room");
    requestSlot("play");
    assert.equal(currentOwner(), null);
    settleSlot();
    assert.equal(currentOwner(), "play");
  });

  it("returns the slot to the previous claimant when the newest unmounts", () => {
    requestSlot("room");
    requestSlot("play");
    settleSlot();
    assert.equal(currentOwner(), "play");
    withdrawSlot("play");
    assert.equal(currentOwner(), "room");
  });

  it("hands straight over between two scenes that are both leaving and arriving", () => {
    requestSlot("room");
    requestSlot("visit");
    settleSlot();
    requestSlot("play");
    assert.equal(currentOwner(), null);
    settleSlot();
    assert.equal(currentOwner(), "play");
    withdrawSlot("play");
    assert.equal(currentOwner(), "visit");
    withdrawSlot("visit");
    assert.equal(currentOwner(), "room");
  });

  it("gives the slot up on withdraw without unmounting, and takes it back on re-request", () => {
    requestSlot("room");
    withdrawSlot("room");
    assert.equal(currentOwner(), null);
    requestSlot("room");
    assert.equal(currentOwner(), "room");
  });

  it("ignores a repeated request from the current owner", () => {
    requestSlot("room");
    requestSlot("room");
    assert.equal(currentOwner(), "room");
  });

  it("revokes the first room when a SECOND room mounts under the same name", () => {
    requestSlot("room#1");
    assert.equal(currentOwner(), "room#1");
    requestSlot("room#2");
    assert.equal(currentOwner(), null);
    settleSlot();
    assert.equal(currentOwner(), "room#2");
    withdrawSlot("room#1");
    assert.equal(currentOwner(), "room#2");
  });

  it("leaves nobody owning it once every claim is gone", () => {
    requestSlot("room");
    requestSlot("play");
    settleSlot();
    withdrawSlot("play");
    withdrawSlot("room");
    assert.equal(currentOwner(), null);
    settleSlot();
    assert.equal(currentOwner(), null);
  });

  it("settles to the newest claimant however many times it is called", () => {
    requestSlot("room");
    requestSlot("play");
    for (let i = 0; i < 5; i++) settleSlot();
    assert.equal(currentOwner(), "play");
  });
});
