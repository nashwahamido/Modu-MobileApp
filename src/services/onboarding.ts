import type { Handedness, ModeId } from "../onboarding/questionnaire";
import { supabase } from "../config/supabase";
import { createProfileIfMissing, updateProfile } from "./profile";

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

  await createProfileIfMissing(user.id, user.email);

  const { error } = await supabase.from("onboarding_results").insert({
    user_id: user.id,
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

export async function saveSelectedAvatarMode(_modeId: ModeId) {
  // The current Supabase schema does not store avatar/mode on user_profile.
  // Keep this as a no-op so the prototype confirmation flow remains intact.
  return { skipped: false as const };
}

export async function getLatestOnboardingMode(userId: string) {
  const { data, error } = await supabase
    .from("onboarding_results")
    .select("primary_mode")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.primary_mode as ModeId | null | undefined;
}
