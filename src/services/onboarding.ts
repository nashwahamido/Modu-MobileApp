import type { Handedness, ModeId } from "../onboarding/questionnaire";
import { supabase } from "../config/supabase";
import { createProfileIfMissing, getProfile, updateProfile } from "./profile";
import { idForMode, modeForId } from "../data/player/avatars";

export type OnboardingSaveInput = {
  handedness: Handedness | null;
  answers: string[];
  primaryMode: ModeId;
  secondaryMode: ModeId;
};

export async function saveOnboardingResults(input: OnboardingSaveInput) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const user = sessionData.session?.user;
  if (!user) {
    return { skipped: true as const };
  }

  const profile = await createProfileIfMissing(user.id, user.email);

  const { error } = await supabase.from("questionnaire").insert({
    user_id: user.id,
    // Snapshot of the name at answer time — questionnaire rows are append-only history.
    username: profile.username,
    answers: {
      handedness: input.handedness,
      responses: input.answers,
    },
    primary_mode: input.primaryMode,
    secondary_mode: input.secondaryMode,
  });

  if (error) throw error;

  return { skipped: false as const };
}

export async function saveSelectedAvatarMode(modeId: ModeId) {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const user = sessionData.session?.user;
  if (!user) {
    return { skipped: true as const };
  }

  // Re-read the profile rather than carrying the old row's username forward: the user may have renamed themselves between finishing the questionnaire and overriding the recommended mode.
  const profile = await getProfile(user.id);

  const { data: latestResult, error: selectError } = await supabase
    .from("questionnaire")
    .select("answers, primary_mode, secondary_mode")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selectError) throw selectError;
  if (latestResult?.primary_mode !== modeId) {
    const { error: insertError } = await supabase
      .from("questionnaire")
      .insert({
        user_id: user.id,
        username: profile?.username ?? null,
        answers: latestResult?.answers ?? {},
        primary_mode: modeId,
        secondary_mode: latestResult?.secondary_mode ?? modeId,
      });

    if (insertError) throw insertError;
  }

  // user_profile.avatar_id is the authoritative CURRENT choice. The
  // questionnaire above remains append-only recommendation/override history.
  // Write current state last, so a failed history insert cannot report failure
  // after silently changing what the next launch will load.
  await updateProfile(user.id, {
    avatar_id: idForMode(modeId),
    onboarding_completed: true,
  });
  return { skipped: false as const };
}

/**
 * The hand the player answered with, from their most recent questionnaire run.
 *
 * Read from `answers` rather than a column of its own: the jsonb is where saveOnboardingResults
 * puts it (see migration 006), and the shape is not guaranteed — an older row, or a run where the
 * question was skipped, has no handedness at all. Anything that is not exactly "left" or "right"
 * reads as null and the caller keeps the right-handed default, which is what every row written
 * before this feature existed should mean.
 */
export async function getLatestHandedness(userId: string): Promise<Handedness | null> {
  const { data, error } = await supabase
    .from("questionnaire")
    .select("answers")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  const value = (data?.answers as { handedness?: unknown } | null)?.handedness;
  return value === "left" || value === "right" ? value : null;
}

/**
 * The account's CURRENT mode, off user_profile.avatar_id — the counterpart to saveSelectedAvatarMode
 * above, and the source getLatestOnboardingMode is only a fallback for.
 *
 * The two answer different questions and drift apart on purpose: the questionnaire row is what the
 * player answered once during onboarding and never changes, while avatar_id is what they are set to
 * NOW — after Settings, or after the demo reset in supabase/migrations/029_demo_reset.sql. Read the
 * questionnaire when you want the original answer; read this when you want the live one.
 *
 * Null means "no current choice recorded", which is the signal to fall back — not an error.
 */
export async function getSelectedAvatarMode(userId: string) {
  const { data, error } = await supabase
    .from("user_profile")
    .select("avatar_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return modeForId(data?.avatar_id ?? null);
}

export async function getLatestOnboardingMode(userId: string) {
  const { data, error } = await supabase
    .from("questionnaire")
    .select("primary_mode")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.primary_mode as ModeId | null | undefined;
}
