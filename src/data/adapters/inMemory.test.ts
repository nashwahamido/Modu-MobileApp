// Behavioural tests for the repo seam, run against the in-memory adapter. The adapters are plain TypeScript with no React Native imports, so unlike the zustand stores they are reachable from node:test.
import assert from "node:assert/strict";
import { test } from "node:test";

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
