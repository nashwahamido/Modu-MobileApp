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

export async function createProfileIfMissing(userId: string, email?: string | null) {
  const now = new Date().toISOString();
  const existingProfile = await getProfile(userId);

  if (existingProfile) {
    return updateProfile(userId, {
      username: existingProfile.username ?? email ?? null,
      last_login: now,
    });
  }

  const { data, error } = await supabase
    .from("user_profile")
    .insert({
      user_id: userId,
      username: email ?? null,
      onboarding_completed: false,
      last_login: now,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as UserProfile;
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
