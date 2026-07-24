// The data-access seam. Features depend ONLY on these interfaces; swapping the in-memory adapter for a Supabase one is a single change in ./index.
import type { FurnitureId } from "@/src/game/core/type";
import type { BuildSave, Friend, Profile, ProfilePatch, RoomLayout, UserId } from "./types";

export interface ProfileRepo {
  get(userId: UserId): Promise<Profile | null>;
  // Batch fetch so a friends list renders without N round-trips.
  getMany(userIds: UserId[]): Promise<Profile[]>;
  update(userId: UserId, patch: ProfilePatch): Promise<Profile>;
}

export interface RoomLayoutRepo {
  // Returns an empty layout (no placements) when the owner has none yet — never null, so callers don't special-case.
  get(ownerId: UserId): Promise<RoomLayout>;
  save(ownerId: UserId, layout: RoomLayout): Promise<void>;
}

export interface FriendsRepo {
  list(userId: UserId): Promise<Friend[]>;
  add(userId: UserId, friendId: UserId): Promise<void>;
  remove(userId: UserId, friendId: UserId): Promise<void>;
}

export interface BuildProgressRepo {
  // Every in-progress build for a user — powers a "continue building" shelf.
  list(ownerId: UserId): Promise<BuildSave[]>;
  // The save for one furniture, or null if none is in progress.
  get(ownerId: UserId, furnitureId: FurnitureId): Promise<BuildSave | null>;
  save(save: BuildSave): Promise<void>;
  // Abandon: drop the in-progress save without recording a completion.
  clear(ownerId: UserId, furnitureId: FurnitureId): Promise<void>;
  // Finish: record a completed build (backs items_assembled) AND clear its in-progress save.
  complete(ownerId: UserId, furnitureId: FurnitureId): Promise<void>;
  // The furniture this user has finished — the record behind items_assembled.
  listCompleted(ownerId: UserId): Promise<FurnitureId[]>;
}

export interface RoomLikesRepo {
  // Like / unlike a room. The owner's user_profile.likes is a cache kept in sync by these.
  like(roomOwnerId: UserId, likerId: UserId): Promise<void>;
  unlike(roomOwnerId: UserId, likerId: UserId): Promise<void>;
  hasLiked(roomOwnerId: UserId, likerId: UserId): Promise<boolean>;
  count(roomOwnerId: UserId): Promise<number>;
}

// The bundle every feature reaches through. One object, swappable behind ./index.
export interface Repos {
  profiles: ProfileRepo;
  rooms: RoomLayoutRepo;
  friends: FriendsRepo;
  builds: BuildProgressRepo;
  likes: RoomLikesRepo;
}
