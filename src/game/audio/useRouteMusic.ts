// Which music the CURRENT SCREEN wants, decided in one place.
//
// Mounted once, at the root. The alternative — a start/stop effect on every screen — was how this
// started, and it does not survive a second track: two screens unmounting and mounting in the wrong
// order leave both loops running, or neither. Route in, track out, one owner.
import { useEffect } from "react";
import { usePathname } from "expo-router";

import { setMusicTrack, type MusicTrackId } from "./music";

/**
 * The ASSEMBLY theme belongs to the build itself — play and the tutorial, which is a build too.
 * The catalogue is not: it sits with the room, the profile and the shop as somewhere you browse.
 */
function trackFor(pathname: string): MusicTrackId | null {
  // Onboarding is SILENT: it is wall-to-wall narration — the questionnaire, the avatar
  // recommendation — and a bed under a voice that is asking questions makes it harder to hear.
  if (pathname.startsWith("/onboarding") || pathname.includes("(onboarding)")) return null;
  if (pathname.startsWith("/avatar-recommendation")) return null;
  if (pathname.startsWith("/onboarding-questionnaire")) return null;
  if (pathname.startsWith("/create-account") || pathname.startsWith("/auth")) return null;
  if (pathname === "/" || pathname === "") return null;

  if (pathname.startsWith("/play") || pathname.startsWith("/tutorial")) return "assembly";
  // Everything else — room, catalogue, profile, settings, shop, visiting a friend.
  return "ambient";
}

/** Follows the route. Call once, at the root of the app tree. */
export function useRouteMusic() {
  const pathname = usePathname();
  useEffect(() => {
    setMusicTrack(trackFor(pathname));
  }, [pathname]);
}