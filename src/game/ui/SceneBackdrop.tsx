// The one backdrop renderer for every scene screen (play, tutorial, room) — an ImageBackground as the screen root, so the artwork always frames identically.
// A separate <Image style={absoluteFill}> scaled the same file differently (that was the tutorial's zoomed-in backdrop), so all screens must go through this component.
// "clear": backdropSource returns undefined — no image, the caller's root background shows through.
import type { ReactNode } from "react";
import { ImageBackground, type StyleProp, type ViewStyle } from "react-native";

import type { BackdropId } from "@/src/game/core/type";
import { backdropSource } from "@/src/game/ui/backdrops";

type Props = {
  backdrop: BackdropId;
  dark: boolean;
  // The screen's root style (flex:1 + its own background colour for "clear").
  style: StyleProp<ViewStyle>;
  children?: ReactNode;
};

export function SceneBackdrop({ backdrop, dark, style, children }: Props) {
  return (
    <ImageBackground
      source={backdropSource(backdrop, dark)}
      resizeMode="cover"
      style={style}
    >
      {children}
    </ImageBackground>
  );
}
