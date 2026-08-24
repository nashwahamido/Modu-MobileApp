// Behavioural tests for the repo seam, run against the in-memory adapter. The adapters are plain TypeScript with no React Native imports, so unlike the zustand stores they are reachable from node:test.
import assert from "node:assert/strict";
import { test } from "node:test";

import { asFurnitureId } from "@/src/game/core/ids";
import { createInMemoryRepos } from "./inMemory";
import { DEMO_FRIEND_A, DEMO_ME } from "./seed";

test("findByUsername returns the matching profile", async () => {
  const repos = createInMemoryRepos();
  const found = await repos.profiles.findByUsername("Astrid");
  assert.equal(found?.userId, DEMO_FRIEND_A);
});

test("findByUsername is EXACT — a prefix matches nothing", async () => {
  // Deliberate: username is UNIQUE in Postgres and the lookup rides that index, so the client must not pretend to a fuzziness the query does not have.
  const repos = createInMemoryRepos();
  assert.equal(await repos.profiles.findByUsername("Astr"), null);
});

test("findByUsername is case-sensitive, matching the DB's unique constraint", async () => {
  // Postgres text equality is case-sensitive, so "astrid" and "Astrid" are two different usernames that could both exist. The adapter agrees with the database rather than being quietly kinder than it.
  const repos = createInMemoryRepos();
  assert.equal(await repos.profiles.findByUsername("astrid"), null);
});

test("findByUsername returns null for a name nobody has", async () => {
  const repos = createInMemoryRepos();
  assert.equal(await repos.profiles.findByUsername("Nobody At All"), null);
});

// An id that is in no fixture. The request repos key on ids alone, so a test brings its own participant and sets up its own scenario rather than depending on seeded demo data — which keeps these tests readable on their own and keeps seed.ts free of rows that exist only to be tested against.
const OUTSIDER = "outsider-under-test";

test("accept writes BOTH directions — a friendship is never one-sided", async () => {
  // The regression this whole feature exists to prevent: friends holds directed edges, and an accept that wrote only one would leave the two players disagreeing about whether they are friends.
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
  // Consent is proven by the request existing. Without one there is nothing to accept, and succeeding silently would let anyone add anyone.
  const repos = createInMemoryRepos();
  await assert.rejects(() => repos.friendRequests.accept(DEMO_ME, OUTSIDER));
  assert.deepEqual(await repos.friends.list(OUTSIDER), []);
});

test("sending twice leaves one request", async () => {
  // (from,to) is the primary key in the DB; sending again is the same intent, not a second request.
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

// The reward item goes into the same inventory a purchase writes, because that is the set the room's Inventory popup reads. A grant that returned the id but never added it would look correct in every assertion about the return value and still leave the player without the item.
test("reward() grants the furniture's reward item into the inventory", async () => {
  const repos = createInMemoryRepos();
  const before = await repos.store.listOwned(DEMO_ME);
  assert.equal(before.includes("neiden-bedframe"), false);

  const granted = await repos.builds.reward(DEMO_ME, asFurnitureId("lack-table"));
  assert.equal(granted.rewardItemId, "neiden-bedframe");

  const after = await repos.store.listOwned(DEMO_ME);
  assert.equal(after.includes("neiden-bedframe"), true);
});

// The grant is idempotent on the DB side via the ledger's partial unique index; the fixture mirrors that, and the ownership set is a Set, so a replay can neither pay twice nor duplicate the row.
test("reward() replayed grants no second item and no second payment", async () => {
  const repos = createInMemoryRepos();
  const first = await repos.builds.reward(DEMO_ME, asFurnitureId("lack-table"));
  const second = await repos.builds.reward(DEMO_ME, asFurnitureId("lack-table"));

  assert.equal(first.alreadyRewarded, false);
  assert.equal(second.alreadyRewarded, true);
  assert.equal(second.coins, first.coins);
  assert.equal(second.xp, first.xp);
  // The replay STILL reports the item id — it is what the client's markOwned acts on, and it must only ever name something genuinely in the inventory. This is the self-heal contract: reward_build inserts into user_buy above its already-rewarded return (migration 027), so a player who completed the build before the furniture was wired is made whole on the replay rather than told about an item they never received.
  assert.equal(second.rewardItemId, "neiden-bedframe");
  const owned = await repos.store.listOwned(DEMO_ME);
  assert.equal(owned.includes("neiden-bedframe"), true);
});

// A furniture with no reward item is the ordinary case, not the exception — it is every row in the live catalogue today.
test("reward() grants no item for a furniture with none configured", async () => {
  const repos = createInMemoryRepos();
  const granted = await repos.builds.reward(DEMO_ME, asFurnitureId("eket-cabinet"));
  // Key ABSENT, not present-and-undefined: `assert.equal(x, undefined)` passes for both, so it would not notice a change from the conditional spread to `rewardItemId: item?.id` — which is exactly the requirement this pins.
  assert.equal("rewardItemId" in granted, false);
});

test("buildReward() reports the item the grant will give, and omits it when there is none", async () => {
  const repos = createInMemoryRepos();
  const withItem = await repos.builds.buildReward(asFurnitureId("lack-table"));
  assert.deepEqual(withItem.item, { id: "neiden-bedframe", name: "NEIDEN Bedframe", category: "fur" });
  assert.equal("item" in (await repos.builds.buildReward(asFurnitureId("eket-cabinet"))), false);
});
