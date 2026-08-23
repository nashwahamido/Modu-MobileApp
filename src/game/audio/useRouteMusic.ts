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
  // ONBOARDING HAS ITS OWN THEME. It used to be silent, because these screens are wall-to-wall
  // narration — the questionnaire reads every question and answer, the recommendation reads the whole
  // card — and a bed at room-theme level sits on top of the voice rather than under it. The track is
  // trimmed for that (see TRIM in music.ts) rather than the route being left quiet.
  if (pathname.startsWith("/onboarding") || pathname.includes("(onboarding)")) return "onboarding";
  if (pathname.startsWith("/avatar-recommendation")) return "onboarding";
  if (pathname.startsWith("/onboarding-questionnaire")) return "onboarding";
  // Its filename does not begin with "onboarding", so it needs naming: the group prefix is stripped
  // from the pathname at runtime and the two rules above would both miss it.
  if (pathname.startsWith("/voice-intro")) return "onboarding";
  if (pathname.startsWith("/create-account") || pathname.startsWith("/auth")) return "onboarding";
  // The splash/redirect frame, before any screen has decided where it is going. Still silent: a loop
  // that starts and stops inside a frame is a click, not music.
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