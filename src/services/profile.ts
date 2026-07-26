import { supabase } from "../config/supabase";

export type UserProfile = {
  user_id: string;
  username: string | null;
  onboarding_completed: boolean;
  created_at: string | null;
  last_login: string | null;
};

export type UserProfileUpdate = Partial<
  Pick<UserProfile, "username" | "onboarding_completed" | "last_login">
>;

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

export async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from("user_profile")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data as UserProfile | null;
}

// A SAFETY NET, not the provisioning path. The row is created by the on_auth_user_created trigger
// (migration 20260724100000), which covers every sign-in route including ones that never reach this
// code. This stays for accounts that predate the trigger, and to stamp last_login on each sign-in.
export async function createProfileIfMissing(userId: string, email?: string | null) {
  const now = new Date().toISOString();
  const existingProfile = await getProfile(userId);

  // The normal case: the trigger already made the row, so only touch last_login — never rewrite the username.
  if (existingProfile) {
    return updateProfile(userId, { last_login: now });
  }

  const { data, error } = await supabase
    .from("user_profile")
    .insert({
      user_id: userId,
      username: fallbackUsername(userId, email),
      onboarding_completed: false,
      last_login: now,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as UserProfile;
}

// Mirrors the trigger's naming rule. The EMAIL LOCAL-PART only — user_profile is readable by every
// authenticated user, so a full address stored here would be published to all of them. The uid suffix
// keeps the NOT NULL + UNIQUE constraint satisfied without a round-trip to check for collisions.
function fallbackUsername(userId: string, email?: string | null): string {
  const local = (email ?? "").split("@")[0].trim();
  return `${local || "builder"}-${userId.replace(/-/g, "").slice(0, 8)}`;
}

export async function updateProfile(userId: string, data: UserProfileUpdate) {
  const { data: profile, error } = await supabase
    .from("user_profile")
    .update(data)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return profile as UserProfile;
}
