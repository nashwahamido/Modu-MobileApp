// behavioural tests for the repo seam — no RN imports, so unlike the zustand stores this runs under node:test
import assert from "node:assert/strict";
import { test } from "node:test";

import { asFurnitureId } from "@/src/game/core/ids";
import { createInMemoryRepos } from "./inMemory";
import { DEMO_FRIEND_A, DEMO_ME } from "./seed";
import { STARTER_ROOM_ITEM_IDS, createStarterRoomPlacements } from "../room/initialLayout";

test("findByUsername returns the matching profile", async () => {
  const repos = createInMemoryRepos();
  const found = await repos.profiles.findByUsername("Astrid");
  assert.equal(found?.userId, DEMO_FRIEND_A);
});

test("findByUsername is EXACT — a prefix matches nothing", async () => {
  // the lookup rides the unique index, so the client must not pretend to a fuzziness the query lacks
  const repos = createInMemoryRepos();
  assert.equal(await repos.profiles.findByUsername("Astr"), null);
});

test("findByUsername is case-sensitive, matching the DB's unique constraint", async () => {
  // Postgres text equality is case-sensitive, so the adapter agrees with the DB rather than being kinder
  const repos = createInMemoryRepos();
  assert.equal(await repos.profiles.findByUsername("astrid"), null);
});

test("findByUsername returns null for a name nobody has", async () => {
  const repos = createInMemoryRepos();
  assert.equal(await repos.profiles.findByUsername("Nobody At All"), null);
});

test("the demo player starts with the starter room and owns its furniture", async () => {
  const repos = createInMemoryRepos();
  assert.deepEqual((await repos.rooms.get(DEMO_ME)).placements, createStarterRoomPlacements());
  const owned = await repos.store.listOwned(DEMO_ME);
  for (const itemId of STARTER_ROOM_ITEM_IDS) {
    assert.equal(owned.includes(itemId), true, `${itemId} should be owned`);
  }
});

// an id in no fixture — the request repos key on ids alone, so a test brings its own participant
// which keeps these readable alone, and seed.ts free of rows that exist only to be tested against
const OUTSIDER = "outsider-under-test";

test("accept writes BOTH directions — a friendship is never one-sided", async () => {
  // the regression this exists for: an accept writing one edge leaves the players disagreeing
  const repos = createInMemoryRepos();
  await repos.friendRequests.send(OUTSIDER, DEMO_ME);
  await repos.friendRequests.accept(DEMO_ME, OUTSIDER);
  const mine = await repos.friends.list(DEMO_ME);
  const theirs = await repos.friends.list(OUTSIDER);
  assert.ok(mine.some((f) => f.userId === OUTSIDER), "the outsider is missing from my friends");
  assert.ok(theirs.some((f) => f.userId === DEMO_ME), "I am missing from the outsider's friends");
});

test("accept consumes the request", async () => {
  const repos = createInMemoryRepos();
  await repos.friendRequests.send(OUTSIDER, DEMO_ME);
  await repos.friendRequests.accept(DEMO_ME, OUTSIDER);
  assert.deepEqual(await repos.friendRequests.listIncoming(DEMO_ME), []);
});

test("accept with no pending request throws rather than creating an edge", async () => {
  // consent is proven by the request existing — succeeding without one would let anyone add anyone
  const repos = createInMemoryRepos();
  await assert.rejects(() => repos.friendRequests.accept(DEMO_ME, OUTSIDER));
  assert.deepEqual(await repos.friends.list(OUTSIDER), []);
});

test("sending twice leaves one request", async () => {
  // (from,to) is the primary key, so sending again is the same intent, not a second request
  const repos = createInMemoryRepos();
  await repos.friendRequests.send(DEMO_ME, OUTSIDER);
  await repos.friendRequests.send(DEMO_ME, OUTSIDER);
  assert.equal((await repos.friendRequests.listOutgoing(DEMO_ME)).length, 1);
});

test("a request to yourself is refused", async () => {
  const repos = createInMemoryRepos();
  await assert.rejects(() => repos.friendRequests.send(DEMO_ME, DEMO_ME));
});

test("withdraw removes the request from both parties' views", async () => {
  const repos = createInMemoryRepos();
  await repos.friendRequests.send(OUTSIDER, DEMO_ME);
  await repos.friendRequests.withdraw(OUTSIDER, DEMO_ME);
  assert.deepEqual(await repos.friendRequests.listIncoming(DEMO_ME), []);
  assert.deepEqual(await repos.friendRequests.listOutgoing(OUTSIDER), []);
});

// into the same inventory a purchase writes, since that is the set the popup reads
// a grant returning the id without adding it passes every assertion and leaves the player empty-handed
test("reward() grants the furniture's reward item into the inventory", async () => {
  const repos = createInMemoryRepos();
  const before = await repos.store.listOwned(DEMO_ME);
  assert.equal(before.includes("neiden-bedframe"), false);

  const granted = await repos.builds.reward(DEMO_ME, asFurnitureId("lack-table"));
  assert.equal(granted.rewardItemId, "neiden-bedframe");

  const after = await repos.store.listOwned(DEMO_ME);
  assert.equal(after.includes("neiden-bedframe"), true);
});

// idempotent through the ledger's unique index, mirrored here — a replay can neither pay twice nor duplicate
test("reward() replayed grants no second item and no second payment", async () => {
  const repos = createInMemoryRepos();
  const first = await repos.builds.reward(DEMO_ME, asFurnitureId("lack-table"));
  const second = await repos.builds.reward(DEMO_ME, asFurnitureId("lack-table"));

  assert.equal(first.alreadyRewarded, false);
  assert.equal(second.alreadyRewarded, true);
  assert.equal(second.coins, first.coins);
  assert.equal(second.xp, first.xp);
  // the replay still reports the item id, since markOwned acts on it and it must name something owned
  // the self-heal contract: the insert sits above the already-rewarded return, so an early finisher is made whole
  assert.equal(second.rewardItemId, "neiden-bedframe");
  const owned = await repos.store.listOwned(DEMO_ME);
  assert.equal(owned.includes("neiden-bedframe"), true);
});

// no reward item is the ordinary case — it is every row in the live catalogue today
test("reward() grants no item for a furniture with none configured", async () => {
  const repos = createInMemoryRepos();
  const granted = await repos.builds.reward(DEMO_ME, asFurnitureId("eket-cabinet"));
  // key ABSENT, not present-and-undefined — assert.equal passes for both, so it would miss `rewardItemId: item?.id`
  assert.equal("rewardItemId" in granted, false);
});

test("buildReward() reports the item the grant will give, and omits it when there is none", async () => {
  const repos = createInMemoryRepos();
  const withItem = await repos.builds.buildReward(asFurnitureId("lack-table"));
  assert.deepEqual(withItem.item, { id: "neiden-bedframe", name: "NEIDEN Bedframe", category: "fur" });
  assert.equal("item" in (await repos.builds.buildReward(asFurnitureId("eket-cabinet"))), false);
});
