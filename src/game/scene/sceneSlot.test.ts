// The invariant these pin is not "someone owns the slot" but "the handover has a gap in it": between
// one scene giving the engine up and the next taking it, there is a commit where NOBODY owns it. That
// gap is what stops two Filament engines from existing at once, which is what leaks them.
//
// useSceneSlot drives the same four functions these call, so the sequences below are what the hook does
// across commits: a non-owner's effect calls settleSlot() once its scene is out of the tree.
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
    // Navigating to play: the room still holds the engine, so play must NOT be granted yet.
    requestSlot("play");
    assert.equal(currentOwner(), null);
    // The room has now rendered without its scene and settles, which is what hands the slot on.
    settleSlot();
    assert.equal(currentOwner(), "play");
  });

  it("returns the slot to the previous claimant when the newest unmounts", () => {
    requestSlot("room");
    requestSlot("play");
    settleSlot();
    assert.equal(currentOwner(), "play");
    // Popping back. An unmounting owner has nothing left to tear down, so no revoke commit is needed.
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
    // The room drops its claim while a friend's room is on top, without unmounting the screen.
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
