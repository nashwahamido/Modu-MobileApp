// Demo seed data for the in-memory adapter: a fake "me" plus demo friends, each with a profile and a room. Doubles as demo data (the DEV panel) and test fixtures.
import type { FurnitureId } from "@/src/game/core/type";
import type { BuildSave, Friend, Profile, RoomLayout, UserId } from "../types";

// The fake current user for local/dev runs. Real code derives the id from Supabase auth (useAuth().user.id).
export const DEMO_ME: UserId = "me";
export const DEMO_FRIEND_A: UserId = "friend-astrid";
export const DEMO_FRIEND_B: UserId = "friend-noah";

// Fixed timestamp so seeds stay deterministic (no Date at module load).
const SEED_TS = "2026-01-01T00:00:00.000Z";

export function seedProfiles(): Profile[] {
  return [
    // title (from level), itemsAssembled (from seedCompleted) and likes (from seedRoomLikes) are all derived on read — the values here are placeholders the adapter overwrites.
    { userId: DEMO_ME, username: "You", avatarMode: "control", level: 1, coins: 120, xp: 340, onboardingCompleted: true, title: null, itemsAssembled: 0, likes: 0 },
    { userId: DEMO_FRIEND_A, username: "Astrid", avatarMode: "visual", level: 5, coins: 410, xp: 980, onboardingCompleted: true, title: null, itemsAssembled: 0, likes: 0 },
    { userId: DEMO_FRIEND_B, username: "Noah", avatarMode: "momentum", level: 2, coins: 60, xp: 150, onboardingCompleted: true, title: null, itemsAssembled: 0, likes: 0 },
  ];
}

export function seedRooms(): RoomLayout[] {
  return [
    { ownerId: DEMO_ME, placements: [], updatedAt: SEED_TS },
    { ownerId: DEMO_FRIEND_A, placements: [{ instanceId: "a1", furnitureId: "LACK", position: { x: 0.3, y: 0.4 }, rotation: 0 }], updatedAt: SEED_TS },
    { ownerId: DEMO_FRIEND_B, placements: [{ instanceId: "b1", furnitureId: "DALFRED", position: { x: 0.6, y: 0.5 }, rotation: 1.57 }], updatedAt: SEED_TS },
  ];
}

export function seedFriends(): Record<UserId, Friend[]> {
  return {
    [DEMO_ME]: [{ userId: DEMO_FRIEND_A, since: SEED_TS }, { userId: DEMO_FRIEND_B, since: SEED_TS }],
    [DEMO_FRIEND_A]: [{ userId: DEMO_ME, since: SEED_TS }],
    [DEMO_FRIEND_B]: [{ userId: DEMO_ME, since: SEED_TS }],
  };
}

// No in-progress builds at seed: saves accrue at runtime as the user assembles. Seeding fake ActionIds here would not match a freshly composed furniture.
export function seedBuilds(): BuildSave[] {
  return [];
}

// Completed furniture per user — the source of the derived itemsAssembled count.
export function seedCompleted(): Record<UserId, FurnitureId[]> {
  return {
    [DEMO_ME]: ["LACK"],
    [DEMO_FRIEND_A]: ["LACK", "DALFRED", "EKET", "BEKVAM"],
    [DEMO_FRIEND_B]: [],
  };
}

// Likers per room owner — the source of the derived likes count. Ids are synthetic.
export function seedRoomLikes(): Record<UserId, UserId[]> {
  const likers = (n: number): UserId[] => Array.from({ length: n }, (_, i) => `liker-${i}`);
  return {
    [DEMO_ME]: likers(4),
    [DEMO_FRIEND_A]: likers(12),
    [DEMO_FRIEND_B]: likers(1),
  };
}
