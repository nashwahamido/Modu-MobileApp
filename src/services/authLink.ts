// Consumes the Supabase auth redirect (the modu:// magic-link callback) and turns it into a session.
// Without this the email link brings the app up but the tokens ride in on the URL and are dropped:
// detectSessionInUrl is false on native (it is a web-only concern), so nothing reads them otherwise.
import { supabase } from "../config/supabase";

// Both auth flows are handled, so switching flowType later needs no change here: implicit returns
// access_token/refresh_token in the URL fragment, PKCE returns a single-use code in the query.
export type AuthLinkResult =
  | { status: "signed-in" }
  // Not an auth callback at all — an ordinary deep link, which the caller should ignore.
  | { status: "none" }
  | { status: "error"; message: string };

// Hand-rolled rather than URLSearchParams: React Native's polyfill has historically been partial, and this is a dozen lines.
function decodePairs(input: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of input.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const key = decodeURIComponent(eq === -1 ? pair : pair.slice(0, eq));
    const value = eq === -1 ? "" : decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, " "));
    if (key) out[key] = value;
  }
  return out;
}

// Params from BOTH the query and the fragment of scheme://path?query#fragment, fragment winning on a clash.
function paramsOf(url: string): Record<string, string> {
  const hashAt = url.indexOf("#");
  const fragment = hashAt >= 0 ? url.slice(hashAt + 1) : "";
  const beforeHash = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const queryAt = beforeHash.indexOf("?");
  const query = queryAt >= 0 ? beforeHash.slice(queryAt + 1) : "";
  return { ...decodePairs(query), ...decodePairs(fragment) };
}

export async function completeAuthFromUrl(url: string): Promise<AuthLinkResult> {
  const params = paramsOf(url);

  // Supabase reports a refused/expired link this way rather than by failing the redirect.
  if (params.error || params.error_description) {
    return { status: "error", message: params.error_description || params.error };
  }

  // PKCE: exchange the one-time code for a session.
  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) return { status: "error", message: error.message };
    return { status: "signed-in" };
  }

  // Implicit: the tokens are already in the fragment; adopt them directly.
  if (params.access_token && params.refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (error) return { status: "error", message: error.message };
    return { status: "signed-in" };
  }

  return { status: "none" };
}
