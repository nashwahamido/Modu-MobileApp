import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Expo Supabase environment variables.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Persist the session to device storage so a returning user stays signed in across app launches
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    // No URL-based session handoff on native
    detectSessionInUrl: false,
    // MUST stay "pkce"
    flowType: "pkce",
  },
});

// Keep the access token fresh only while the app is in the foreground
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
