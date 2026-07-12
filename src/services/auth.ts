import { supabase } from "../config/supabase";
import { createProfileIfMissing } from "./profile";

export type AccountMode = "create" | "login";
export type PrototypeAuthMethod = "google" | "apple" | "phone";

export async function signUp(email: string, password: string, username: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username },
    },
  });
  if (error) throw error;
  if (data.user) {
    await createProfileIfMissing(data.user.id, data.user.email ?? email);
  }
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  if (data.user) {
    await createProfileIfMissing(data.user.id, data.user.email ?? email);
  }
  return data;
}

export async function continueWithEmail(email: string, mode: AccountMode) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error("Please enter an email address.");
  }

  const { data, error } = await supabase.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      shouldCreateUser: mode === "create",
      emailRedirectTo: "modu://",
    },
  });

  if (error) throw error;

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (user) {
    await createProfileIfMissing(user.id, user.email ?? normalizedEmail);
  }

  return data;
}

export async function continueWithPrototypeProvider(_method: PrototypeAuthMethod) {
  return { skipped: true as const };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}
