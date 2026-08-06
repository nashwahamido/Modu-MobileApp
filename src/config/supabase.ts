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
    // Persist the session to device storage so a returning user stays signed in across app launches. AsyncStorage is unencrypted — fine for a game; swap to a SecureStore adapter to encrypt tokens.
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    // No URL-based session handoff on native (that's a web-only OAuth redirect concern).
    detectSessionInUrl: false,
    // MUST stay "pkce". auth-js defaults to "implicit", which returns the access AND refresh token in the fragment of the modu:// redirect — and a custom scheme is unverified, so any app on the device can register it and harvest a tapped magic link into a full account takeover. PKCE sends a single-use code instead, worthless without the verifier held in this app's storage. completeAuthFromUrl() (services/authLink.ts) already handles both shapes.
    flowType: "pkce",
  },
});

// Keep the access token fresh only while the app is in the foreground: refreshing in the background wastes work and can fail. Supabase's recommended React Native pattern.
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
