-- Friend requests: the consent step in front of the friends table.
-- Why this table has to exist at all: friends holds DIRECTED edges and a mutual friendship is two rows, but friends_insert only permits auth.uid() = user_id — so a client can write its OWN edge and never the other one. 001's "add both sides from the app" is not achievable under the policy printed directly beneath it, and accept_friend_request below is the only writer that can produce a real friendship.

create table if not exists public.friend_requests (
  from_id uuid not null references auth.users (id) on delete cascade,
  to_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- (from,to) as the key makes a repeat send a conflict rather than a growing pile of identical rows.
  constraint friend_requests_pkey primary key (from_id, to_id),
  -- A constraint and not a client guard, because it has to hold for every caller including the RPC.
  constraint friend_requests_not_self check (from_id <> to_id)
);

-- The recipient's inbox is the query that runs on every profile open; the sender's is already served by the primary key's leading column.
create index if not exists friend_requests_to_id_idx on public.friend_requests (to_id);

alter table public.friend_requests enable row level security;

-- Both parties see the row: the sender to render "Requested", the recipient to act on it.
drop policy if exists friend_requests_select on public.friend_requests;
create policy friend_requests_select on public.friend_requests
  for select to authenticated using (auth.uid() in (from_id, to_id));

drop policy if exists friend_requests_insert on public.friend_requests;
create policy friend_requests_insert on public.friend_requests
  for insert to authenticated with check (auth.uid() = from_id);

-- One policy covers reject AND cancel: they are the same row delete, differing only in which party performs it.
drop policy if exists friend_requests_delete on public.friend_requests;
create policy friend_requests_delete on public.friend_requests
  for delete to authenticated using (auth.uid() in (from_id, to_id));

-- The ONLY way a mutual friendship comes into existence. security definer because the second edge (requester -> recipient) is a row the recipient does not own, which friends_insert refuses. The recipient is read from auth.uid() and is deliberately NOT a parameter: a version taking both ids would let any caller befriend any two accounts that never consented.
create or replace function public.accept_friend_request(requester uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The delete IS the authorisation check: a request addressed to auth.uid() is the recipient's proof of consent. Doing it FIRST also makes a double-tap raise on the second call instead of quietly re-inserting.
  delete from public.friend_requests where from_id = requester and to_id = auth.uid();
  if not found then
    raise exception 'no pending friend request from %', requester using errcode = 'no_data_found';
  end if;

  -- on conflict do nothing covers a half-friendship left by the old one-way friends.add, and a crossed pair of requests where one edge already exists.
  -- What actually lets this insert past friends_insert (auth.uid() = user_id, which fails for the requester->recipient row) is not security definer itself — security definer only changes current_user for privilege checks — it is that a table owner is exempt from its own RLS policies unless the table has `force row level security` set, and 001 never forces it on public.friends, so the exemption holds only because this function is owned by the owner of public.friends; running `alter table public.friends force row level security` would break every accept in the app, since policies would then apply to the owner too and friends_insert is `to authenticated`, a role the owner is not a member of, and on conflict do nothing would NOT hide that failure because it only suppresses conflicts, not a WITH CHECK violation, so the break would be loud, not silent.
  -- The two rows are inserted in a single statement, ordered deterministically by (user_id, friend_id), so that a crossed pair of simultaneous accepts (A->B and B->A both consented at once) always acquires the same two friends keys in the same order in both transactions; inserting them as two separate statements lets one transaction take (A,B) then wait on (B,A) while the other takes (B,A) then waits on (A,B) — on conflict do nothing's speculative insertion blocks on the other's uncommitted tuple, so Postgres deadlocks (40P01) and kills one side with what looks like a generic failure. Do not split this back into two inserts.
  insert into public.friends (user_id, friend_id)
    select u, f from (values (auth.uid(), requester), (requester, auth.uid())) v(u, f) order by u, f
    on conflict do nothing;
end;
$$;

-- Default execute is granted to public on new functions; withdraw it so only a signed-in user can call a security definer.
revoke all on function public.accept_friend_request(uuid) from public, anon;
grant execute on function public.accept_friend_request(uuid) to authenticated;

-- The insert policy above only checks from_id, and a column default only fills in when the client omits the column, so without this a sender could hand created_at an arbitrary past timestamp and pin themselves to the top of the recipient's inbox once the UI sorts by it; the column-grant pattern from 009 closes that by limiting the client to from_id and to_id, leaving created_at to the not-null default.
revoke insert on public.friend_requests from authenticated;
grant insert (from_id, to_id) on public.friend_requests to authenticated;

-- Terminal audit, in the style of 011: confirms RLS is actually on (zero policies means nothing if it is off), that all three policies exist, and that the function really is SECURITY DEFINER; also catches the two failure modes the columns above cannot see. anon_can_execute must read false — a true here means the revoke above didn't take and anon could call the security definer directly. self_check_present must read 1 — create table if not exists silently skips ALL constraints, including friend_requests_not_self, if a table of that name already existed in some other shape, and the earlier columns would still report all green. authed_can_read and authed_can_delete do NOT come from 009's one-time `grant all on all tables`, which ran once at position 9 against the tables that existed then and never reruns — this table is created four migrations later, at 13. What actually grants it is 009's `alter default privileges in schema public grant all on tables to authenticated`, the same standing mechanism 012's item_lights relies on; deleting those default-privileges lines as apparently redundant with the one-time grant would silently break every table created after 009. Both are checked because reject and cancel depend on delete just as the inbox depends on select.
select
  (select relrowsecurity from pg_class where oid = 'public.friend_requests'::regclass) as rls_enabled,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'friend_requests') as policy_count,
  (select prosecdef from pg_proc where oid = 'public.accept_friend_request(uuid)'::regprocedure) as is_security_definer,
  has_function_privilege('anon', 'public.accept_friend_request(uuid)', 'execute') as anon_can_execute,
  (select count(*) from pg_constraint where conname = 'friend_requests_not_self') as self_check_present,
  -- Two columns, not one call listing both privileges: has_table_privilege treats a comma-separated list as OR, so a single 'select, delete' check would read true with only one of them granted and the name would be a lie. Both must read true — reject and cancel depend on delete just as the inbox depends on select.
  has_table_privilege('authenticated', 'public.friend_requests', 'select') as authed_can_read,
  has_table_privilege('authenticated', 'public.friend_requests', 'delete') as authed_can_delete;
