-- The upload portal's staging area. The portal writes HERE and to the room/workshop/ storage prefix, and the live catalog is touched exactly once, at an explicit publish, through publish_workshop_draft().
--
-- What that isolation does and does not rest on, stated precisely because an earlier version of this comment overclaimed: the portal never holds a service-role key, so every write it makes is subject to RLS as the signed-in user — that part is structural. The TABLE side is fully closed: workshop_drafts is writable only by workshop editors and no policy here grants the portal's session anything on item_buy, item_build or item_variants, which is why publish has to go through a security-definer function. The STORAGE side is only as tight as the policy set on the models bucket AS A WHOLE, because permissive policies OR together — the room/workshop/ prefix policy at the bottom of this file ADDS access and cannot subtract it. If some broader authenticated-write policy already exists on that bucket, the prefix is descriptive rather than enforcing, and the real boundary is the workshop_editors gate. Check with: select policyname, cmd, roles, qual from pg_policies where schemaname = 'storage' and tablename = 'objects';
--
-- Lifecycle draft -> testing -> published, filtered by build flavour. Dev builds merge 'testing' rows into the room catalog so an item can be placed and orbited before it is ever purchasable; showcase and release builds read only the placeable_items view and never see this table's contents.
--
-- Sizes are NOT nullable here, unlike item_buy/item_build: a draft without a measurement is not saveable, because the portal always measures before it saves. Surfaces (wallpaper/floor, which have no model) are out of scope for phase 1.

create table if not exists public.workshop_drafts (
  id            text primary key,
  name          text not null,
  brand_id      text references public.brands (id),
  category_id   text not null references public.item_categories (id),
  link          text,
  price         integer not null default 0 check (price >= 0),
  min_level     integer not null default 1 check (min_level >= 1),
  size_x        double precision not null check (size_x > 0),
  size_y        double precision not null check (size_y > 0),
  size_z        double precision not null check (size_z > 0),
  base_offset_y double precision not null default 0,
  -- [{ variation: text|null, is_default: bool }]. Variants live as JSONB rather than a child table because a draft is a working document read and written whole by one editor; the one-default rule and every other relational constraint is enforced at publish, where the data becomes item_variants rows. Storage paths are derived exactly as for live items: room/workshop/<id>/<variation|'default'>.glb and .jpg.
  variants      jsonb not null default '[]'::jsonb,
  status        text not null default 'draft' check (status in ('draft','testing','published')),
  created_by    uuid references auth.users (id) default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- without this, a non-array variants value (an object, a string, a bare scalar) is only caught at publish time, where jsonb_array_elements raises a raw "cannot extract elements from an object" instead of a named, write-time constraint violation.
  constraint workshop_drafts_variants_is_array check (jsonb_typeof(variants) = 'array')
);

-- Who may write. Stage (b) reuses this table verbatim for vetted creators, adding a created_by = auth.uid() ownership check alongside it rather than replacing it.
create table if not exists public.workshop_editors (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  added_at   timestamptz not null default now()
);

alter table public.workshop_drafts enable row level security;
alter table public.workshop_editors enable row level security;

create or replace function public.is_workshop_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.workshop_editors where user_id = auth.uid());
$$;

-- Every authenticated user may READ drafts, because the dev app build merges testing rows into its catalog and dev builds sign in as ordinary roster accounts.
drop policy if exists workshop_drafts_read on public.workshop_drafts;
create policy workshop_drafts_read on public.workshop_drafts
  for select to authenticated using (true);

drop policy if exists workshop_drafts_write on public.workshop_drafts;
create policy workshop_drafts_write on public.workshop_drafts
  for all to authenticated using (public.is_workshop_editor()) with check (public.is_workshop_editor());

drop policy if exists workshop_editors_read on public.workshop_editors;
create policy workshop_editors_read on public.workshop_editors
  for select to authenticated using (true);

grant select on public.workshop_drafts to authenticated;
grant insert, update, delete on public.workshop_drafts to authenticated;
grant select on public.workshop_editors to authenticated;

create or replace function public.touch_workshop_draft()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workshop_drafts_touch on public.workshop_drafts;
create trigger workshop_drafts_touch before update on public.workshop_drafts
  for each row execute function public.touch_workshop_draft();

-- Promote a draft into the live catalog atomically. The STORAGE copy happens before this call and is idempotent (a re-copy overwrites the same derived paths), so a publish that fails here can simply be retried — the DB half is all-or-nothing and the storage half does not care how many times it runs.
--
-- Phase 1 publishes into item_buy only. Built/assembly items keep their manual path until the assembly lane exists.
create or replace function public.publish_workshop_draft(draft_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  draft public.workshop_drafts;
  default_count integer;
begin
  if not public.is_workshop_editor() then
    raise exception 'not a workshop editor';
  end if;

  select * into draft from public.workshop_drafts where id = draft_id for update;
  if not found then
    raise exception 'draft % does not exist', draft_id;
  end if;
  if draft.status <> 'testing' then
    raise exception 'draft % is not in testing (status %)', draft_id, draft.status;
  end if;

  -- The id has to be free in BOTH item tables: placeable_items is their union, and a collision would make the view ambiguous rather than merely wrong.
  if exists (select 1 from public.item_buy where id = draft_id) or exists (select 1 from public.item_build where id = draft_id) then
    raise exception 'id % already exists in the live catalog', draft_id;
  end if;

  select count(*) into default_count from jsonb_array_elements(draft.variants) v where (v->>'is_default')::boolean is true;
  if default_count <> 1 then
    raise exception 'draft % must have exactly one default variant (found %)', draft_id, default_count;
  end if;

  insert into public.item_buy (id, name, brand_id, category_id, link, price, min_level, size_x, size_y, size_z, base_offset_y)
  values (draft.id, draft.name, draft.brand_id, draft.category_id, draft.link, draft.price, draft.min_level, draft.size_x, draft.size_y, draft.size_z, draft.base_offset_y);

  -- coalesce to false: a variant object missing the is_default key would otherwise carry SQL NULL into a not-null column and abort the insert AFTER the item_buy row above has already been written in this same transaction — the precheck's `is true` already treats a missing key as not-default, so this just makes the insert agree with what the precheck already decided.
  insert into public.item_variants (id, item_id, variation, is_default)
  select draft.id || '__' || coalesce(v->>'variation', 'default'), draft.id, v->>'variation', coalesce((v->>'is_default')::boolean, false)
  from jsonb_array_elements(draft.variants) v;

  -- Published rows are KEPT, never deleted: they are the audit trail of what was promoted and when.
  update public.workshop_drafts set status = 'published' where id = draft_id;
end;
$$;

-- functions are created with EXECUTE granted to PUBLIC by default; take that back so an unauthenticated caller cannot even reach the guards inside either function — both already fail closed (is_workshop_editor() and the auth.uid()-gated check within it), so this is hardening rather than a fix for a live hole, matching the same revoke for dev_purge_anonymous_users in 009_grants.sql.
revoke all on function public.publish_workshop_draft(text) from public, anon;
revoke all on function public.is_workshop_editor() from public, anon;
grant execute on function public.publish_workshop_draft(text) to authenticated;
grant execute on function public.is_workshop_editor() to authenticated;

-- ============================================================================================
-- STORAGE POLICY — kept in its own section at the END of the file, on purpose.
-- ============================================================================================
-- storage.objects is Supabase's table, not one this migration owns outright the way it owns everything above — creating a policy on it can require privileges the migration role does not hold on every hosted project, depending on how that project's database role was provisioned.
-- This is the single statement in this migration most likely to fail on a real project, and a failure here must not take the rest of the migration down with it, so it is wrapped in its own exception handler: every table, function, trigger and policy above this point has already been created by the time this block runs, and stays created even if this block's CREATE POLICY does not go through.
-- If it fails, add the same policy by hand from the Supabase dashboard: Storage -> Policies -> models bucket -> New policy -> for INSERT/UPDATE/DELETE/SELECT (all four, i.e. FOR ALL) -> to role authenticated -> USING and WITH CHECK both set to: bucket_id = 'models' and name like 'room/workshop/%' and public.is_workshop_editor().
-- Grants workshop editors write access under room/workshop/. Note what this does NOT do: it does not PREVENT writes elsewhere in the bucket, because permissive policies OR together and this one only ever adds. It confines the portal to room/workshop/ exactly when no broader write policy exists on the models bucket — verify that rather than assuming it, with the pg_policies query in the header comment at the top of this file.
--
-- Known consequence, unresolved as of 2026-08-02: the publish flow copies room/workshop/<id>/* to room/bought/<id>/* from the browser, and a storage copy needs INSERT on the DESTINATION. If this prefix policy is the only write policy on the bucket, that copy will be refused and publish cannot work until room/bought/ is granted too. Whether that is already covered depends on the policies the project carries today.
do $$
begin
  execute 'drop policy if exists workshop_objects_write on storage.objects';
  execute $policy$
    create policy workshop_objects_write on storage.objects
      for all to authenticated
      using (bucket_id = 'models' and name like 'room/workshop/%' and public.is_workshop_editor())
      with check (bucket_id = 'models' and name like 'room/workshop/%' and public.is_workshop_editor())
  $policy$;
exception when insufficient_privilege then
  raise warning 'workshop_objects_write policy on storage.objects could not be created (%) — the rest of this migration is unaffected; add the policy by hand from the Supabase dashboard under Storage -> Policies, see the comment above this block for the exact definition', sqlerrm;
end $$;

-- The publish flow copies room/workshop/<id>/* to room/bought/<id>/*, and a storage copy needs permission on the DESTINATION, so without this an editor's publish is refused at the copy and can never complete. Verified 2026-08-02: the project carries NO policies on storage.objects at all, which is why fix-catalog-webp.mjs requires a service-role key to upload — so this grant is genuinely additive and the room/workshop/ prefix above is a real boundary rather than a decorative one.
--
-- INSERT and nothing else, deliberately. A copy onto a path that already exists is an UPDATE, so withholding UPDATE means a publish whose id collides with a live item is refused BY THE POLICY, at the copy, before the RPC is ever called. That matters because the copy runs FIRST: with UPDATE granted, a colliding publish would overwrite the existing item's real model and thumbnail and only then get rejected by the RPC's id-uniqueness check, leaving a live catalog item wearing someone else's assets. Withholding one verb turns that into a structural impossibility instead of an ordering rule someone has to remember.
do $$
begin
  execute 'drop policy if exists workshop_publish_to_bought on storage.objects';
  execute $policy$
    create policy workshop_publish_to_bought on storage.objects
      for insert to authenticated
      with check (bucket_id = 'models' and name like 'room/bought/%' and public.is_workshop_editor())
  $policy$;
exception when insufficient_privilege then
  raise warning 'workshop_publish_to_bought policy on storage.objects could not be created (%) — publish will fail at the storage copy until it is added by hand from the Supabase dashboard under Storage -> Policies', sqlerrm;
end $$;

-- raise warning above is not enough on its own: pasting this file into the Supabase dashboard SQL editor does not reliably surface WARNING messages, so a silent failure there looks identical to success ("Success. No rows returned"). This final statement returns actual ROWS the dashboard cannot hide — expect BOTH policies listed, and note that storage.objects must also have row security ENABLED for either of them to mean anything, which the same query reports.
select
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'workshop_objects_write') as workshop_write_policy,
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'workshop_publish_to_bought') as bought_insert_policy,
  (select relrowsecurity from pg_class where relname = 'objects' and relnamespace = 'storage'::regnamespace) as storage_rls_enabled;
