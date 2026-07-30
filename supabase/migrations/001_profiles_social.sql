-- Profiles + social graph: avatars, user_profile, user_room, friends, room_likes.
-- Fresh-schema migration set: to re-apply, reset the DB (drop the public schema) so the files run in order from scratch.
-- All policies use DROP ... IF EXISTS then CREATE so every file is safe to re-run.
--
-- NOTE ON user_profile RLS: SELECT is granted on ANY profile (needed to show a friend's profile);
-- INSERT/UPDATE only on the caller's own row (needed by onboarding in src/services).
-- Which COLUMNS a client may write is gated separately in 009_grants.sql.

-- Avatar reference: profiles point at an avatar by numeric id (a typo-safe FK), not a free string.
-- Keep in sync with DEFAULT_AVATARS in src/data/avatars.ts.
create table if not exists public.avatars (
  id integer primary key,
  mode text not null unique
);

insert into public.avatars (id, mode) values
  (1, 'control'),
  (2, 'visual'),
  (3, 'momentum'),
  (4, 'clearPath')
on conflict (id) do nothing;

alter table public.avatars enable row level security;

drop policy if exists avatars_select on public.avatars;
create policy avatars_select on public.avatars
  for select to authenticated using (true);

-- The game/profile row the app reads. avatar_id is a FK to avatars (typo-safe).
-- No `title` column — title is DERIVED from level via the levels table (002_levels.sql).
-- assembly_count / like_count are caches kept correct by triggers on user_build / room_likes.
-- The auth FK cascades so deleting a user (incl. the dashboard's Delete user button) takes the profile with it.
create table if not exists public.user_profile (
  user_id uuid not null,
  username text not null,
  onboarding_completed boolean null default false,
  created_at timestamp with time zone null default now(),
  last_login timestamp with time zone null,
  avatar_id integer null,
  level integer not null default 1,
  coin integer not null default 0,
  xp integer not null default 0,
  assembly_count integer not null default 0,
  like_count integer not null default 0,
  updated_at timestamp with time zone null,
  constraint user_profile_pkey primary key (user_id),
  constraint user_profile_username_key unique (username),
  constraint user_profile_avatar_id_fkey foreign key (avatar_id) references avatars (id),
  constraint user_profile_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade
) TABLESPACE pg_default;

alter table public.user_profile enable row level security;

drop policy if exists user_profile_select on public.user_profile;
create policy user_profile_select on public.user_profile
  for select to authenticated using (true);

drop policy if exists user_profile_insert on public.user_profile;
create policy user_profile_insert on public.user_profile
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists user_profile_update on public.user_profile;
create policy user_profile_update on public.user_profile
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- One room layout per user. Placements are stored as JSON (the app's PlacedFurniture[]).
create table if not exists public.user_room (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  placements jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_room enable row level security;

-- SELECT is open to any authenticated user so friends can view each other's rooms.
drop policy if exists user_room_select on public.user_room;
create policy user_room_select on public.user_room
  for select to authenticated using (true);

-- Writes are owner-only.
drop policy if exists user_room_insert on public.user_room;
create policy user_room_insert on public.user_room
  for insert to authenticated with check (auth.uid() = owner_id);

drop policy if exists user_room_update on public.user_room;
create policy user_room_update on public.user_room
  for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists user_room_delete on public.user_room;
create policy user_room_delete on public.user_room
  for delete to authenticated using (auth.uid() = owner_id);

-- Directed friend edges: one row per (user_id -> friend_id). A mutual friendship is two rows;
-- add both sides from the app, or add a mirror trigger later.
-- Each user manages only their own outgoing edges, which keeps RLS simple.
create table if not exists public.friends (
  user_id uuid not null references auth.users (id) on delete cascade,
  friend_id uuid not null references auth.users (id) on delete cascade,
  since timestamptz not null default now(),
  primary key (user_id, friend_id)
);

alter table public.friends enable row level security;

drop policy if exists friends_select on public.friends;
create policy friends_select on public.friends
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists friends_insert on public.friends;
create policy friends_insert on public.friends
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists friends_delete on public.friends;
create policy friends_delete on public.friends
  for delete to authenticated using (auth.uid() = user_id);

-- Room likes: the record of truth behind user_profile.like_count (cache kept correct by the trigger below).
-- One row per liker per room.
create table if not exists public.room_likes (
  room_owner_id uuid not null references auth.users (id) on delete cascade,
  liker_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_owner_id, liker_id)
);

alter table public.room_likes enable row level security;

drop policy if exists room_likes_select on public.room_likes;
create policy room_likes_select on public.room_likes
  for select to authenticated using (true);

drop policy if exists room_likes_insert on public.room_likes;
create policy room_likes_insert on public.room_likes
  for insert to authenticated with check (auth.uid() = liker_id);

drop policy if exists room_likes_delete on public.room_likes;
create policy room_likes_delete on public.room_likes
  for delete to authenticated using (auth.uid() = liker_id);

create or replace function public.sync_room_likes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.user_profile set like_count = like_count + 1 where user_id = new.room_owner_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.user_profile set like_count = greatest(like_count - 1, 0) where user_id = old.room_owner_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists room_likes_sync on public.room_likes;
create trigger room_likes_sync
  after insert or delete on public.room_likes
  for each row execute function public.sync_room_likes();
