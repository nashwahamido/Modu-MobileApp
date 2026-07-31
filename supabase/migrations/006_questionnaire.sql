-- questionnaire: one row per completed questionnaire run, read/written by src/services/onboarding.ts.
-- History is append-only: saveSelectedAvatarMode() inserts a NEW row when the user overrides the
-- recommended mode, and every reader takes the latest by created_at.
create table if not exists public.questionnaire (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- { handedness: "left" | "right" | null, responses: string[] } — see OnboardingSaveInput.
  answers jsonb not null default '{}'::jsonb,
  -- FKs to avatars.mode (unique) rather than free text, matching the avatar_id rule in user_profile.
  primary_mode text not null references public.avatars (mode),
  secondary_mode text not null references public.avatars (mode),
  -- Denormalised copy of user_profile.username, stamped at save time by src/services/onboarding.ts.
  -- Nullable and NOT unique on purpose: it is a snapshot of the name at answer time, not the identity.
  username text,
  created_at timestamptz not null default now()
);

-- Every read is "the latest row for this user".
create index if not exists questionnaire_user_created_idx
  on public.questionnaire (user_id, created_at desc);

alter table public.questionnaire enable row level security;

-- Private to the owner, unlike user_profile/user_room: nothing shows another user's answers.
drop policy if exists questionnaire_select on public.questionnaire;
create policy questionnaire_select on public.questionnaire
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists questionnaire_insert on public.questionnaire;
create policy questionnaire_insert on public.questionnaire
  for insert to authenticated with check (auth.uid() = user_id);
