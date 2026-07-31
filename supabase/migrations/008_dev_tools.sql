-- DEV TOOLING — drop this before any real launch.
--
-- Backs the "Purge anon" button in the dev panel (src/dev/AccountSwitcher.tsx). Every tap of "Start
-- fresh" creates a real anonymous auth user, so a week of testing leaves dozens of them, and the
-- dashboard deletes users one at a time.
--
-- Deleting from auth.users needs the service_role key, which must NEVER reach a client bundle, so the
-- cleanup runs here as SECURITY DEFINER instead. Two guards keep that from being a mass-deletion
-- primitive for anyone holding the anon key (which is public by design):
--
--   * only ANONYMOUS users are ever deleted. The rule is fixed here, not passed in by the caller —
--     a client that could name its own victims would be exactly the primitive we are avoiding, so
--     an account with an email address cannot be reached through this function at all.
--   * the caller must be signed in and NOT anonymous, so a fresh throwaway account cannot wipe its
--     siblings, and an unauthenticated caller gets nowhere.
--
-- Every owner-scoped table cascades from auth.users, so the profile, room and inventory rows go with
-- each user. Function grants are locked down in 009_grants.sql.
create or replace function public.dev_purge_anonymous_users()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller  uuid := auth.uid();
  v_deleted integer;
begin
  if v_caller is null then
    raise exception 'dev_purge_anonymous_users: sign in first';
  end if;

  if exists (select 1 from auth.users where id = v_caller and is_anonymous) then
    raise exception 'dev_purge_anonymous_users: an anonymous account cannot purge';
  end if;

  with doomed as (
    delete from auth.users where is_anonymous returning 1
  )
  select count(*) into v_deleted from doomed;

  return v_deleted;
end;
$$;
