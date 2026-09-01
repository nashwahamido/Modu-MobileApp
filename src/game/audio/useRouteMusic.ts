import { useEffect } from "react";
import { usePathname } from "expo-router";

import { setMusicTrack, type MusicTrackId } from "./music";

function trackFor(pathname: string): MusicTrackId | null {
  if (pathname.startsWith("/onboarding") || pathname.includes("(onboarding)")) return "onboarding";
  if (pathname.startsWith("/avatar-recommendation")) return "onboarding";
  if (pathname.startsWith("/onboarding-questionnaire")) return "onboarding";
  if (pathname.startsWith("/voice-intro")) return "onboarding";
  if (pathname.startsWith("/create-account") || pathname.startsWith("/auth")) return "onboarding";
  if (pathname === "/" || pathname === "") return null;

  if (pathname.startsWith("/play") || pathname.startsWith("/tutorial")) return "assembly";
  return "ambient";
}

export function useRouteMusic() {
  const pathname = usePathname();
  useEffect(() => {
    setMusicTrack(trackFor(pathname));
  }, [pathname]);
}