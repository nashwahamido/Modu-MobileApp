-- Levelling: one row PER LEVEL carrying the xp curve, plus the xp -> level function.
-- title is tier-shaped — set it only on the row where a new tier begins and leave it null below,
-- so a rank is still authored once. Null title = "inherit the tier below".
-- Keep in sync with seedLevelRows() in src/data/adapters/seed.ts (the in-memory adapter's stand-in).
create table if not exists public.levels (
  level integer primary key,
  xp_required integer not null default 0,
  title text,
  constraint levels_xp_required_check check (xp_required >= 0)
);

alter table public.levels enable row level security;

-- Reference data: any authenticated user may read it; no client writes.
drop policy if exists level_select on public.levels;
create policy level_select on public.levels
  for select to authenticated using (true);

-- The curve. Sized to the current catalogue: one finished furniture is worth roughly steps*10 + 100 xp
-- (LACK ~250 up to EKET ~1000), so the whole catalogue lands a player around level 8 — the top title
-- tier — leaving it aspirational as content grows. Deltas ramp +50 per level.
insert into public.levels (level, xp_required, title) values
  (1,     0, 'an ambitious newbie'),
  (2,   200, 'a budding builder'),
  (3,   450, 'a steady hand'),
  (4,   750, null),
  (5,  1100, 'a seasoned builder'),
  (6,  1500, null),
  (7,  1950, null),
  (8,  2450, 'a master assembler'),
  (9,  3000, null),
  (10, 3600, null),
  (11, 4250, null),
  (12, 4950, null)
on conflict (level) do update set
  xp_required = excluded.xp_required,
  title       = excluded.title;

-- The level a total xp has earned: the highest row still <= xp, never below the curve's floor.
create or replace function public.level_for_xp(p_xp integer)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select max(level) from public.levels where xp_required <= coalesce(p_xp, 0)),
    (select min(level) from public.levels),
    1
  );
$$;
