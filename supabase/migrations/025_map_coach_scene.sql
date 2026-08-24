-- The Map coach: shown once per ACCOUNT, on the first assembly task after the tutorial.
--
-- On the profile rather than in AsyncStorage, which is where this app's other one-off coaches live
-- (RoomExperience's modu.room-edit-guide-seen.v1 and friends). Those are per-INSTALL: sign in on a
-- second device and they all run again. This one is per-account on purpose — a player who has been
-- shown where the Map button is has been shown it, and being taught the same control again on a
-- tablet reads as the app not remembering them.
--
-- NOT NULL DEFAULT FALSE, so every existing row is "has not seen it" without a backfill, and the
-- adapter never has to decide what a null means.
alter table public.user_profile
  add column if not exists map_coach_seen boolean not null default false;

comment on column public.user_profile.map_coach_seen is
  'One-off HUD coach: the player has been shown that the Map button returns to the project map and catalogue.';

-- The column grant, matching 009_grants.sql.
--
-- WITHOUT THIS THE FEATURE IS BROKEN AND SILENT. 009 revoked the blanket update grant and re-granted
-- one column at a time, so a column added later is not writable by `authenticated` until it is named
-- here — the write fails at the API and the coach reappears on every launch. It is safe to add: this
-- is a UI flag with no economic meaning, unlike coin/xp/level, which stay RPC-only by design.
grant update (map_coach_seen) on public.user_profile to authenticated;
grant insert (map_coach_seen) on public.user_profile to authenticated;