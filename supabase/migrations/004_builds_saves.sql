-- Building: resumable in-progress saves and the completed-build record behind assembly_count.

-- Resumable in-progress builds: one row per (owner, furniture). Private to the owner.
create table if not exists public.user_save (
  builder_id uuid not null references auth.users (id) on delete cascade,
  furniture_id text not null,
  completed jsonb not null default '[]'::jsonb,
  tighten_deg jsonb not null default '{}'::jsonb,
  orientation_deg jsonb not null default '{}'::jsonb,
  drive_progress jsonb not null default '{}'::jsonb,
  mode text not null default 'free',
  updated_at timestamptz not null default now(),
  primary key (builder_id, furniture_id)
);

alter table public.user_save enable row level security;

drop policy if exists user_save_all on public.user_save;
create policy user_save_all on public.user_save
  for all to authenticated using (auth.uid() = builder_id) with check (auth.uid() = builder_id);

-- Completed builds: the record of truth behind user_profile.assembly_count (which is a cache kept
-- correct by the trigger below). One row per finished furniture per user.
--
-- The furniture FK keeps completions pointing at a real item_build row. No ON DELETE action
-- (defaults to NO ACTION / RESTRICT): a furniture users have built can't be silently removed from
-- the catalog — protects completion history and the assembly_count cache.
create table if not exists public.user_build (
  builder_id uuid not null references auth.users (id) on delete cascade,
  furniture_id text not null references public.item_build (id),
  completed_at timestamptz not null default now(),
  primary key (builder_id, furniture_id)
);

alter table public.user_build enable row level security;

drop policy if exists user_build_all on public.user_build;
create policy user_build_all on public.user_build
  for all to authenticated using (auth.uid() = builder_id) with check (auth.uid() = builder_id);

create or replace function public.sync_items_assembled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.user_profile set assembly_count = assembly_count + 1 where user_id = new.builder_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.user_profile set assembly_count = greatest(assembly_count - 1, 0) where user_id = old.builder_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists user_build_sync on public.user_build;
create trigger user_build_sync
  after insert or delete on public.user_build
  for each row execute function public.sync_items_assembled();
