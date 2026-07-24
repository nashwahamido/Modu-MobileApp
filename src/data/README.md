# `src/data` — the data-access seam

Features talk to **interfaces**, not to Supabase. Today those interfaces are backed by an in-memory adapter with demo fixtures; going live is a one-line swap.

## Layout

| File | Role |
| --- | --- |
| `types.ts` | App-facing domain types (`Profile`, `RoomLayout`, `PlacedFurniture`, `Friend`) — camelCase, decoupled from Supabase row shapes in `src/services`. |
| `shopItems.ts` | Shop catalogue reference data (`ShopItem`, `ShopCategory`, `DEFAULT_SHOP_ITEMS`) — the purchasable items, same for everyone. Keep `DEFAULT_SHOP_ITEMS` in sync with the `shop_items` seed in the shop/inventory migration. |
| `repos.ts` | The interfaces (`ProfileRepo`, `RoomLayoutRepo`, `FriendsRepo`, `BuildProgressRepo`, `RoomLikesRepo`, `StoreRepo`) and the `Repos` bundle. |
| `adapters/seed.ts` | Demo seed data: a `me` + two friends, each with a profile and a room. |
| `adapters/inMemory.ts` | `createInMemoryRepos()` — clones in/out so callers can't mutate the store by reference. Optional `latencyMs` simulates a round-trip to exercise loading states. |
| `adapters/supabase.ts` | *(later)* `createSupabaseRepos()`, wrapping `src/services/*`. |
| `index.ts` | The injection point: `useRepos()`, `getRepos()`, `setRepos()`, `useCurrentUserId()`. |

## Using it in a feature

```ts
import { useRepos, useCurrentUserId } from "@/src/data";

const repos = useRepos();
const me = useCurrentUserId();

const layout = await repos.rooms.get(ownerId);   // yours or a friend's — same call
await repos.rooms.save(me, nextLayout);
const friends = await repos.friends.list(me);
const cards = await repos.profiles.getMany(friends.map((f) => f.userId));
```

Rule: **no feature reaches past this seam** — not into `src/services`, not into `supabase` directly. That is what keeps the backend swappable.

## Going live on Supabase

The Supabase adapter is built (`adapters/supabase.ts`) and wired behind an env flag. To switch:

1. Run the migrations in `supabase/migrations/` (Supabase SQL editor, or `supabase db push`), in order. `20260724000000_repo_backend.sql` extends `user_profile` and creates `room_layouts`, `friends`, `build_saves` with RLS; `20260724010000_shop_inventory.sql` adds `shop_items`, `user_inventory`, and the atomic `purchase_shop_item` RPC (spends coins + grants the item).
2. Set `EXPO_PUBLIC_DATA_BACKEND=supabase` in your env and restart Metro. `index.ts` then constructs `createSupabaseRepos()` instead of the in-memory adapter.
3. Make sure the user is **signed in** — RLS requires an authenticated session. `useCurrentUserId()` returns the real Supabase id when there is one (the `DEMO_ME` fallback only applies on fixtures; drop it once auth is enforced everywhere).

No feature or UI code changes — the seam is the whole point. Flip the flag back to run on fixtures again.

### Column mapping (snake_case row ↔ camelCase domain)
`user_profile`: `avatar_mode↔avatarMode`, `items_assembled↔itemsAssembled`, `onboarding_completed↔onboardingCompleted`. `build_saves`: `tighten_deg↔tightenDeg`, `orientation_deg↔orientationDeg`, `drive_progress↔driveProgress`. All mapping lives in `adapters/supabase.ts` — nowhere else.

`Profile.title` is **not a column** — it's derived from `level` via the `level_titles` tiers (`levelTitles.ts`) and filled by the adapter on read. Keep `DEFAULT_LEVEL_TITLES` in sync with the migration's `level_titles` seed.

`Profile.avatarMode` (a `ProfileId` string in code) is stored as a **numeric FK** `user_profile.avatar_id → avatars(id)` — the DB enforces valid values, no typo-prone free text. The adapter maps `id ↔ mode` via the cached `avatars` table (`avatars.ts` / `DEFAULT_AVATARS`, kept in sync with the migration seed).

`Profile.itemsAssembled` and `Profile.likes` are **cached aggregates**, not free-standing counters. Source of truth: the `completed_builds` and `room_likes` tables. In Supabase the `user_profile` columns are kept correct by triggers (`sync_items_assembled`, `sync_room_likes`); the adapter reads the cached columns. In-memory derives them from seeded sets. Write via `repos.builds.complete()` and `repos.likes.like()/unlike()` — never by setting the count directly (it's not in `ProfilePatch`).
