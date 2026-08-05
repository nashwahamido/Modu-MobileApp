// The wait in front of a room — the player's own in the hub, a friend's on the visit screen. Both screens mount their RoomScene UNDER this and keep it up until the whole room has landed, so a room is never watched assembling itself: no bare shell, no furniture popping in one piece at a time. It owns no look of its own. LoadingScreen is the app's single loading look (mascot/initial ring, name line, creep/jump bar) and this is the thin piece that maps a room's two waits onto its Milestone — which is the same job LoadingOverlay does for the assembly loader.
import { useEffect, useState } from "react";

import { LoadingScreen, type LoadingAvatar } from "@/src/game/ui/loading/LoadingScreen";
import type { Milestone } from "@/src/game/ui/loading/loadingProgress";

// The bar creeps to 0.85 and waits there for a model that may never arrive: a variant GLB missing from storage leaves react-native-filament's useModel in `loading` FOREVER, with no error state to read (see the header of scene/variantModel.ts). So the wait is bounded, and it ends by REVEALING rather than by reporting a failure — one piece short is still your room, and it is the room, not an error page, that gives you a way to act. The visit screen keeps its own error path for the case that genuinely has nothing to show: a room that could not be fetched at all.
const WATCHDOG_MS = 15_000;

interface Props {
  /** The room's DATA: the saved layout has been fetched (hub) or the friend's room has been opened (visit). */
  dataReady: boolean;
  /** The room's PIXELS: RoomScene's onReady — shell parsed and every piece it draws has its GLB. */
  sceneReady: boolean;
  avatar?: LoadingAvatar;
  label?: string;
  /** Fired after the bar fills and the fade-out finishes; the screen unmounts this then. */
  onRevealed: () => void;
}

export function RoomLoadingOverlay({ dataReady, sceneReady, avatar, label, onRevealed }: Props) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, []);

  const milestone: Milestone = timedOut || (dataReady && sceneReady) ? 1 : dataReady ? 0.35 : 0;

  return (
    <LoadingScreen
      overlay
      // The scene is live underneath — it must be dissolved into, not cut to.
      fadeOnComplete
      milestone={milestone}
      avatar={avatar}
      label={label}
      onComplete={onRevealed}
    />
  );
}
