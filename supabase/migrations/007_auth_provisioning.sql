-- Provision user_profile from the auth layer, not the client. Creating the row client-side
-- (createProfileIfMissing() at scattered call sites) can be bypassed by a real signup — a magic-link
-- user in particular lands back in the app with a session and NO profile row, and the UI's only
-- symptom is a spinner that never resolves. A trigger on auth.users covers every path: magic link,
-- password, anonymous (the showcase's "start fresh"), and any OAuth provider added later.

-- username is NOT NULL + UNIQUE, so provisioning has to produce a free one. Prefer the name passed
-- through signUp's options.data, then the EMAIL LOCAL-PART — never the full address: user_profile is
-- world-readable to authenticated users (user_profile_select uses `true`), so storing whole emails
-- there publishes them to every signed-in player. Shared by the trigger and the backfill so both
-- name people the same way.
create or replace function public.derive_username(p_user_id uuid, p_meta jsonb, p_email text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_base text;
  v_name text;
  v_try  integer := 0;
  v_uid  text := substr(replace(p_user_id::text, '-', ''), 1, 8);
begin
  v_base := coalesce(
    nullif(trim(p_meta ->> 'username'), ''),
    nullif(split_part(coalesce(p_email, ''), '@', 1), '')
  );

  -- No name to work from — an anonymous sign-in. Every one of these would collide on the same base,
  -- so skip the search and go straight to the uid, which cannot.
  if v_base is null then
    return 'builder-' || v_uid;
  end if;

  -- Walk suffixes until the name is free, so the first "ada" is just "ada". Bounded: past the cap, fall back to the uid.
  loop
    v_name := case when v_try = 0 then v_base else v_base || '-' || v_try end;
    exit when not exists (select 1 from public.user_profile where username = v_name);
    v_try := v_try + 1;
    if v_try > 50 then
      return v_base || '-' || v_uid;
    end if;
  end loop;

  return v_name;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profile (user_id, username, onboarding_completed, last_login)
  values (
    new.id,
    public.derive_username(new.id, new.raw_user_meta_data, new.email),
    false,
    now()
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: auth.users survives a public-schema reset, so any user who signed up before this run has
-- no profile row. Row-at-a-time rather than one INSERT ... SELECT, because derive_username has to see
-- the rows inserted just before it to resolve collisions — a set-based insert would name two
-- same-base users identically and fail.
do $$
declare
  r record;
begin
  for r in
    select u.id, u.email, u.raw_user_meta_data
    from auth.users u
    where not exists (select 1 from public.user_profile p where p.user_id = u.id)
    order by u.created_at
  loop
    insert into public.user_profile (user_id, username, onboarding_completed, last_login)
    values (r.id, public.derive_username(r.id, r.raw_user_meta_data, r.email), false, now())
    on conflict (user_id) do nothing;
  end loop;
end $$;
