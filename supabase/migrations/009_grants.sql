-- Table/function grants for the API roles — the FINAL word on privileges, so it runs LAST and the
-- blanket `... on all ...` lines cover every object the earlier files created. RLS policies gate
-- ROWS, but PostgREST still needs the underlying table privilege — without this, an authenticated
-- read fails with "permission denied for table ..." before RLS is even consulted. Dropping the
-- public schema wipes all of this, so it lives here to be reapplied on every reset. Idempotent.
--
-- anon deliberately gets NOTHING beyond schema usage: it is the key that ships inside the app bundle,
-- nothing in the app talks to PostgREST unauthenticated (catalogStore.refresh and useCatalogSync are
-- both gated on a session; Supabase Auth itself does not go through these grants), and `all` would
-- include TRUNCATE — which RLS does not gate at all — plus write access to any future table added
-- without `enable row level security`. The default-privileges lines keep anything created later on
-- the same footing.
grant usage on schema public to anon, authenticated, service_role;

grant all on all tables    in schema public to authenticated, service_role;
grant all on all sequences in schema public to authenticated, service_role;
grant all on all functions in schema public to authenticated, service_role;

alter default privileges in schema public grant all on tables    to authenticated, service_role;
alter default privileges in schema public grant all on sequences to authenticated, service_role;
alter default privileges in schema public grant all on functions to authenticated, service_role;

-- user_profile: coin / xp / level are economy state, and assembly_count / like_count are
-- trigger-maintained caches — none of them the client's to write. The RLS policy checks WHICH ROW you
-- may update, never WHICH COLUMN; with a blanket table grant any signed-in client could
--     PATCH /rest/v1/user_profile?user_id=eq.<own-uid>  {"coin": 999999999, "level": 12}
-- and then buy everything legitimately through purchase_item, whose price check was never the weak
-- point. Column grants are the fix rather than a new policy: `with check` cannot see which columns
-- changed. The RPCs (reward_build, purchase_item) are the only sanctioned writes to coins/xp.
--
-- The listed columns are the only ones the app ever legitimately writes: username/avatar_id/
-- onboarding_completed come from the profile screen and onboarding; last_login is stamped by
-- createProfileIfMissing on each sign-in; user_id is needed so that same function's legacy INSERT
-- path still works for pre-trigger accounts.
revoke insert, update on public.user_profile from anon, authenticated;
grant update (username, avatar_id, onboarding_completed, last_login, updated_at)
  on public.user_profile to authenticated;
grant insert (user_id, username, avatar_id, onboarding_completed, last_login, updated_at)
  on public.user_profile to authenticated;

-- dev_purge_anonymous_users: functions are created with EXECUTE granted to PUBLIC by default; take
-- that back so an unauthenticated caller cannot even reach the guards inside it.
revoke all on function public.dev_purge_anonymous_users() from public, anon;
grant execute on function public.dev_purge_anonymous_users() to authenticated;
