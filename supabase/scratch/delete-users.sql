-- Delete accounts from auth.users, taking all of their app data with them.
--
-- READ THIS BEFORE RUNNING. Unlike supabase/tests/*.sql, this script is NOT self-undoing: it is written
-- to end in ROLLBACK so that a first run is a harmless preview, and it only actually deletes anything
-- once you change that last line to COMMIT. There is no undo after that — deleted auth users are gone
-- along with every row that cascades from them (profiles, rooms, inventory, saves, questionnaire
-- answers, friendships, friend requests, likes). Take a backup first if the project holds anything real.
--
-- Two knobs, both in the WHERE clause below: a KEEP list of emails that must survive, and a cutoff so
-- only accounts created after some moment are considered. Set both deliberately — leaving the cutoff at
-- its permissive default and the keep list empty means "delete every account in the project".
--
-- Run in the dashboard SQL editor (paste the whole thing), or with psql:
--   psql "<connection string from the dashboard's Connect button, Session pooler>" -f supabase/scratch/delete-users.sql

begin;

-- The accounts to remove. Everything downstream reads this table, so the preview you inspect below is
-- exactly the set that gets deleted — no chance of the two clauses drifting apart.
create temporary table doomed_users on commit drop as
select u.id, u.email, u.created_at
from auth.users u
-- KEEP: accounts that must survive. Replace with your own; add as many as you need.
where u.email is distinct from 'you@example.com'
-- CUTOFF: only accounts created after this. Widen or narrow it; delete the line to consider all accounts.
  and u.created_at > timestamptz '2026-08-01';

-- workshop_drafts.created_by is the one reference to auth.users in this schema WITHOUT `on delete
-- cascade` (011_workshop.sql line 24), so a draft authored by one of these accounts would abort the
-- delete below with a foreign key violation. The column is nullable, and a published draft's authorship
-- is not worth keeping a dead account alive for, so orphan the drafts rather than delete them: the draft
-- itself, and anything already published from it, is catalog data that outlives its author.
update public.workshop_drafts
   set created_by = null
 where created_by in (select id from doomed_users);

-- The delete itself. Every other table that references auth.users does so `on delete cascade`, so this
-- one statement removes the app data too — user_profile, rooms, room likes, friends, friend_requests,
-- questionnaire answers, economy rows, builds and saves, workshop_editors.
delete from auth.users where id in (select id from doomed_users);

-- THE PREVIEW, and the reason it sits after the delete rather than before it: the dashboard SQL editor
-- displays only the LAST statement's result, so a preview placed up front is invisible there. Reading it
-- here costs nothing, because on the first run the ROLLBACK below undoes the delete it is describing —
-- so this is a list of who WOULD go, and it is your last chance to spot a real account among them.
-- accounts_remaining is what auth.users would be left holding; orphaned_profiles must be 0, or some
-- reference this script did not anticipate survived the cascade.
select d.email,
       d.created_at,
       (select count(*) from doomed_users)                                       as deleted_accounts,
       (select count(*) from auth.users)                                         as accounts_remaining,
       (select count(*) from public.user_profile p
          where not exists (select 1 from auth.users u where u.id = p.user_id))  as orphaned_profiles
from doomed_users d
order by d.created_at;

-- CHANGE THIS TO `commit;` TO ACTUALLY DELETE. As written, the script previews and undoes itself.
rollback;
