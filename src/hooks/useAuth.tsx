import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as Linking from "expo-linking";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "../config/supabase";
import { completeAuthFromUrl } from "../services/authLink";

// linkError carries a refused or expired magic link. Nothing renders it yet — see the note on the deep-link effect below.
type AuthState = { user: User | null; session: Session | null; loading: boolean; linkError: string | null };

// One shared session for the whole app. A per-component hook would give each caller its own async getSession()/subscription — so a screen mounting just after sign-in would briefly see user=null and query the DB with the DEMO_ME fallback ("me") before its own copy resolved. A single context means every consumer reads the same user in the same commit, so that race can't happen.
const AuthContext = createContext<AuthState>({ user: null, session: null, loading: true, linkError: null });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  // Two gates, because a cold start launched BY a magic link has to finish the token exchange before loading drops — otherwise getSession() resolves null first and the app flashes the login screen.
  const [sessionReady, setSessionReady] = useState(false);
  const [linkReady, setLinkReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    // The session persisted to AsyncStorage by a previous launch (see src/config/supabase.ts).
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setSessionReady(true);
    });

    // Login, logout, and token refresh all flow through here.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // The magic-link callback. A successful exchange fires onAuthStateChange above, so the session lands through the one path everything else already reads. linkError is set but NOT rendered anywhere yet: an expired link currently fails quietly apart from this warning.
  useEffect(() => {
    let cancelled = false;

    const consume = async (url: string) => {
      const result = await completeAuthFromUrl(url);
      if (cancelled || result.status === "none") return;
      if (result.status === "error") {
        console.warn("[auth] sign-in link failed:", result.message);
        setLinkError(result.message);
      } else {
        setLinkError(null);
      }
    };

    // Cold start: the link that launched the app.
    Linking.getInitialURL()
      .then((url) => (url ? consume(url) : undefined))
      .catch((err) => console.warn("[auth] could not read the launch URL:", (err as Error).message))
      .finally(() => {
        if (!cancelled) setLinkReady(true);
      });

    // Warm start: the app was already running when the link opened.
    const sub = Linking.addEventListener("url", ({ url }) => {
      void consume(url);
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  const loading = !sessionReady || !linkReady;

  return (
    <AuthContext.Provider value={{ user, session, loading, linkError }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
