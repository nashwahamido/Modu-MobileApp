import type { Handedness, ModeId } from "../onboarding/questionnaire";
import { supabase } from "../config/supabase";
import { createProfileIfMissing, getProfile, updateProfile } from "./profile";

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

  await updateProfile(user.id, {
    onboarding_completed: true,
  });

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
  if (latestResult?.primary_mode === modeId) {
    return { skipped: false as const };
  }

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
  return { skipped: false as const };
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
